export interface KimiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface KimiResponse {
  content: string;
  iterations: number;
  pythonCode?: string;
}

export class KimiClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // TODO_TEMP TD-001: temporarily using Claude API instead of Kimi K2.6
    // REVERT: baseUrl = 'https://api.deepinfra.com/v1/openai', model = 'moonshotai/Kimi-K2-Instruct'
    // TRIGGER: top up DeepInfra balance (~$10), verify DEEPINFRA_API_KEY in Cloudflare secrets
    this.baseUrl = 'https://api.anthropic.com/v1';
    this.model = 'claude-sonnet-4-5';
  }

  async generatePython(dataDescription: string, question: string, previousResult?: string, iteration?: number): Promise<string> {
    // All prompts in English only — avoids any Cyrillic encoding issues in Python code generation
    const systemPrompt = `You are a Python data analyst. Write clean, executable Python code to analyze data and answer questions.

CRITICAL CONSTRAINTS - Judge0 CE sandbox, Python stdlib only:
- FORBIDDEN: pandas, numpy, matplotlib, scipy, sklearn, or ANY non-stdlib import
- ALLOWED: csv, json, io, math, statistics, collections, itertools, functools, datetime, re, operator

The CSV data is pre-loaded as a UTF-8 string in variable CSV_DATA (already defined, do not redefine it).

Parse CSV like this:
import csv, json, io
reader = csv.DictReader(io.StringIO(CSV_DATA))
rows = list(reader)

Always output results as valid JSON on a single line:
print(json.dumps({"result": ...}, ensure_ascii=False))

Return ONLY executable Python code. No explanations. No markdown. No triple backticks.`;

    const iterNote = iteration ? ` (iteration ${iteration}/10)` : '';
    const userMessage = previousResult
      ? `Data schema:\n${dataDescription}\n\nQuestion: ${question}${iterNote}\n\nPrevious iteration output:\n${previousResult}\n\nBuild on the previous result. Go deeper. Return only Python code. No pandas. No markdown.`
      : `Data schema:\n${dataDescription}\n\nQuestion: ${question}${iterNote}\n\nWrite Python code to analyze this data and answer the question. Return only Python code. No pandas. No markdown.`;

    const response = await this.callAPI(systemPrompt, userMessage);
    return this.extractCode(response);
  }

  async generateFinalAnalysis(question: string, analysisResults: string[], language: string = 'en'): Promise<string> {
    return this.generateFinalText(question, analysisResults, language);
  }

  async generateFinalText(question: string, analysisResults: string[], language: string = 'en'): Promise<string> {
    const langInstruction = language === 'ru'
      ? 'Respond in Russian. Be concise and business-focused. Use plain text, no markdown headers.'
      : 'Respond in English. Be concise and business-focused.';

    const systemPrompt = `You are a business analyst. Synthesize data analysis results into clear insights and actionable recommendations. ${langInstruction}
Structure: 1-2 sentence summary, then key findings, then 1 concrete recommendation.`;

    const userMessage = `Question: ${question}\n\nAnalysis results from ${analysisResults.length} iterations:\n${analysisResults.slice(0, 8).join('\n---\n')}`;

    return await this.callAPI(systemPrompt, userMessage);
  }

  private async callAPI(systemPrompt: string, userMessage: string): Promise<string> {
    const isAnthropic = this.baseUrl.includes('anthropic');

    // Encode body as UTF-8 explicitly — handles Cyrillic and all Unicode correctly
    const bodyStr = isAnthropic
      ? JSON.stringify({
          model: this.model,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        })
      : JSON.stringify({
          model: this.model,
          max_tokens: 2000,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
    };

    if (isAnthropic) {
      headers['x-api-key'] = this.apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const endpoint = isAnthropic
      ? `${this.baseUrl}/messages`
      : `${this.baseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: bodyStr,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`API error ${response.status}: ${err}`);
    }

    const data: any = await response.json();

    if (isAnthropic) {
      return data.content[0].text;
    } else {
      return data.choices[0].message.content;
    }
  }

  private extractCode(text: string): string {
    // Strip markdown fences if model added them despite instructions
    const fenceMatch = text.match(/```(?:python)?\n?([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    return text.trim();
  }
}
