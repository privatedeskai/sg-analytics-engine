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
    // Vариант 4: Kimi K2.5 — нет thinking mode по умолчанию, быстрее K2.6
    // Гипотеза: K2.6 таймаутит из-за thinking tokens, K2.5 должна отвечать быстро
    this.baseUrl = 'https://api.deepinfra.com/v1/openai';
    this.model = 'moonshotai/Kimi-K2.5';
  }

  async generateIteration(
    dataDescription: string,
    question: string,
    iterationSummaries: string[],
    iteration: number,
    maxIterations: number
  ): Promise<IterationResult> {
    const systemPrompt = `You are a Python data analyst working iteratively. Each iteration you:
1. Write focused Python to test ONE specific hypothesis
2. Summarize what you found in 1-2 sentences
3. Decide if you have enough to answer the user question

CRITICAL CONSTRAINTS — Judge0 CE sandbox, Python stdlib only:
- FORBIDDEN: pandas, numpy, matplotlib, scipy, sklearn, or ANY non-stdlib import
- ALLOWED: csv, json, io, math, statistics, collections, itertools, functools, datetime, re, operator

CSV data is pre-loaded as UTF-8 string in variable CSV_DATA (already defined, do not redefine it).
Parse CSV: import csv,json,io; reader=csv.DictReader(io.StringIO(CSV_DATA)); rows=list(reader)
Output results: print(json.dumps({"result": ...}, ensure_ascii=False))

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "python": "<executable Python code>",
  "summary": "<1-2 sentences: what this iteration found>",
  "enough": <true if you can now fully answer the question, false otherwise>,
  "reason": "<why enough or what is still missing>"
}`;

    const contextBlock = iterationSummaries.length > 0
      ? `\n\nWhat we know so far:\n${iterationSummaries.map((s, i) => `Iteration ${i + 1}: ${s}`).join('\n')}`
      : '';

    const userMessage = `Data schema:\n${dataDescription}\n\nQuestion: ${question} (iteration ${iteration}/${maxIterations})${contextBlock}\n\nWrite focused Python for ONE specific check. Do not repeat previous analysis.`;

    const raw = await this.callAPIStreaming(systemPrompt, userMessage, 2000);
    return this.parseIterationResult(raw);
  }

  async generateFinalAnalysis(question: string, summaries: string[], language: string = 'ru'): Promise<string> {
    const langInstruction = language === 'ru'
      ? 'Respond in Russian. Be concise and business-focused. Use plain text, no markdown headers.'
      : 'Respond in English. Be concise and business-focused.';

    const systemPrompt = `You are a business analyst. Synthesize findings into clear insights and actionable recommendations. ${langInstruction}
Structure: 1-2 sentence summary, key findings, 1 concrete recommendation.`;

    const userMessage = `Question: ${question}\n\nFindings from ${summaries.length} analysis iterations:\n${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    return await this.callAPIStreaming(systemPrompt, userMessage, 1000);
  }

  // Streaming — читаем токены по мере генерации
  // Нужно для больших моделей чтобы не ждать весь ответ целиком
  private async callAPIStreaming(systemPrompt: string, userMessage: string, maxTokens: number): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        stream: true,
        // temperature=1.0 как рекомендует документация Kimi
        temperature: 1.0,
        top_p: 1.0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Kimi API error ${response.status}: ${err}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) fullContent += delta;
        } catch {
          // пропускаем битые SSE чанки
        }
      }
    }

    return fullContent.trim();
  }

  private parseIterationResult(raw: string): IterationResult {
    try {
      const clean = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      return {
        python: this.extractCode(parsed.python || ''),
        summary: parsed.summary || 'No summary provided',
        enough: Boolean(parsed.enough),
        reason: parsed.reason || '',
      };
    } catch {
      console.error('[KimiClient] Failed to parse iteration JSON, falling back');
      return {
        python: this.extractCode(raw),
        summary: 'Iteration completed (parse fallback)',
        enough: false,
        reason: 'JSON parse failed',
      };
    }
  }

  private extractCode(text: string): string {
    const fenceMatch = text.match(/```(?:python)?\n?([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    return text.trim();
  }
}
