export interface KimiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface KimiResponse {
  content: string;
  iterations: number;
  pythonCode?: string;
}

export interface IterationResult {
  python: string;
  summary: string;
  enough: boolean;
  reason: string;
}

export class KimiClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // TD-001 CLOSED: switched to Kimi K2.6 via DeepInfra
    this.baseUrl = 'https://api.deepinfra.com/v1/openai';
    this.model = 'moonshotai/Kimi-K2.6';
  }

  // Generates Python code + summary + convergence signal in one call
  // Returns structured IterationResult — orchestrator uses summary for next iteration context
  async generateIteration(
    dataDescription: string,
    question: string,
    iterationSummaries: string[], // summaries from previous iterations, NOT raw outputs
    iteration: number,
    maxIterations: number
  ): Promise<IterationResult> {
    const systemPrompt = `You are a Python data analyst working iteratively. Each iteration you:
1. Write focused Python to test ONE specific hypothesis
2. Summarize what you found in 1-2 sentences
3. Decide if you have enough to answer the user's question

CRITICAL CONSTRAINTS — Judge0 CE sandbox, Python stdlib only:
- FORBIDDEN: pandas, numpy, matplotlib, scipy, sklearn, or ANY non-stdlib import
- ALLOWED: csv, json, io, math, statistics, collections, itertools, functools, datetime, re, operator

CSV data is pre-loaded as UTF-8 string in variable CSV_DATA (already defined, do not redefine it).
Parse CSV: import csv,json,io; reader=csv.DictReader(io.StringIO(CSV_DATA)); rows=list(reader)
Output results: print(json.dumps({"result": ...}, ensure_ascii=False))

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "python": "<executable Python code, single line strings escaped>",
  "summary": "<1-2 sentences: what this iteration found>",
  "enough": <true if you can now fully answer the question, false otherwise>,
  "reason": "<why enough or what's still missing>"
}`;

    const contextBlock = iterationSummaries.length > 0
      ? `\n\nWhat we know so far:\n${iterationSummaries.map((s, i) => `Iteration ${i + 1}: ${s}`).join('\n')}`
      : '';

    const iterNote = `(iteration ${iteration}/${maxIterations})`;
    const userMessage = `Data schema:\n${dataDescription}\n\nQuestion: ${question} ${iterNote}${contextBlock}\n\nWrite focused Python for ONE specific check. Do not repeat previous analysis.`;

    const raw = await this.callAPI(systemPrompt, userMessage, 2000);
    return this.parseIterationResult(raw);
  }

  async generateFinalAnalysis(question: string, summaries: string[], language: string = 'en'): Promise<string> {
    const langInstruction = language === 'ru'
      ? 'Respond in Russian. Be concise and business-focused. Use plain text, no markdown headers.'
      : 'Respond in English. Be concise and business-focused.';

    const systemPrompt = `You are a business analyst. Synthesize data analysis findings into clear insights and actionable recommendations. ${langInstruction}
Structure: 1-2 sentence summary, then key findings, then 1 concrete recommendation.`;

    const userMessage = `Question: ${question}\n\nFindings from ${summaries.length} analysis iterations:\n${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    return await this.callAPI(systemPrompt, userMessage, 1500);
  }

  private parseIterationResult(raw: string): IterationResult {
    try {
      // Strip markdown fences if model added them despite instructions
      const clean = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        python: this.extractCode(parsed.python || ''),
        summary: parsed.summary || 'No summary provided',
        enough: Boolean(parsed.enough),
        reason: parsed.reason || '',
      };
    } catch {
      // Fallback: treat entire response as Python code, no early exit
      console.error('[KimiClient] Failed to parse iteration JSON, falling back to raw code');
      return {
        python: this.extractCode(raw),
        summary: 'Iteration completed (parse fallback)',
        enough: false,
        reason: 'JSON parse failed',
      };
    }
  }

  private async callAPI(systemPrompt: string, userMessage: string, maxTokens: number = 2000): Promise<string> {
    const bodyStr = JSON.stringify({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.6,
    });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: bodyStr,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Kimi API error ${response.status}: ${err}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content;
  }

  private extractCode(text: string): string {
    const fenceMatch = text.match(/```(?:python)?\n?([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    return text.trim();
  }
}
