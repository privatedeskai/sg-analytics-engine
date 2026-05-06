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
2. Summarize what you found in max 30 words
3. Decide if you have enough to answer the user question

CRITICAL CONSTRAINTS — Judge0 CE sandbox, Python stdlib only:
- FORBIDDEN: pandas, numpy, matplotlib, scipy, sklearn, or ANY non-stdlib import
- ALLOWED: csv, json, io, math, statistics, collections, itertools, functools, datetime, re, operator
- Write LESS THAN 25 lines of Python

CSV data is pre-loaded as UTF-8 string in variable CSV_DATA (already defined, do not redefine it).
Parse CSV: import csv,json,io; reader=csv.DictReader(io.StringIO(CSV_DATA)); rows=list(reader)
Output results: print(json.dumps({"result": ...}, ensure_ascii=False))

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "python": "<executable Python code, max 25 lines>",
  "summary": "<max 30 words: what this iteration found>",
  "enough": <true if you can now fully answer the question, false otherwise>,
  "reason": "<max 20 words>"
}`;

    const contextBlock = iterationSummaries.length > 0
      ? `\n\nWhat we know so far:\n${iterationSummaries.map((s, i) => `Iter ${i + 1}: ${s}`).join('\n')}`
      : '';

    const userMessage = `Data schema:\n${dataDescription}\n\nQuestion: ${question} (iteration ${iteration}/${maxIterations})${contextBlock}\n\nOne hypothesis only. No repeat of previous analysis.`;

    console.log(`[KIMI:PROMPT] iter=${iteration} est_tokens=${Math.round((systemPrompt.length + userMessage.length) / 4)} summaries=${iterationSummaries.length}`);

    const raw = await this.callAPIStreaming(systemPrompt, userMessage, 2000, `iter${iteration}`);
    return this.parseIterationResult(raw, iteration);
  }

  async generateFinalAnalysis(question: string, summaries: string[], language: string = 'ru'): Promise<string> {
    const langInstruction = language === 'ru'
      ? 'Respond in Russian. Be concise and business-focused. Use plain text, no markdown headers.'
      : 'Respond in English. Be concise and business-focused.';

    const systemPrompt = `You are a business analyst. Synthesize findings into clear insights and actionable recommendations. ${langInstruction}
Structure: 1-2 sentence summary, key findings, 1 concrete recommendation.`;

    const userMessage = `Question: ${question}\n\nFindings:\n${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    return await this.callAPIStreaming(systemPrompt, userMessage, 1000, 'final');
  }

  private async callAPIStreaming(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
    label: string
  ): Promise<string> {
    const t0 = Date.now();

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
        // Instant mode: отключаем thinking — модель отвечает напрямую без reasoning tokens
        // Thinking mode потребляет все токены на рассуждение, не оставляя места для ответа
        // Для возврата к Thinking mode: убрать thinking, поставить temperature=1.0, max_tokens>=16000
        // См. DECISIONS.md раздел "Режим работы Kimi"
        thinking: { type: 'disabled' },
        temperature: 0.6,
        top_p: 0.95,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[KIMI:ERROR] label=${label} status=${response.status} body=${err.slice(0, 200)}`);
      throw new Error(`Kimi API error ${response.status}: ${err}`);
    }

    const t1 = Date.now();
    console.log(`[KIMI:RESP] label=${label} status=200 headers_ms=${t1 - t0}ms`);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let firstChunkMs: number | null = null;
    let contentChunks = 0;
    let reasoningChunks = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (firstChunkMs === null) {
        firstChunkMs = Date.now() - t0;
        console.log(`[KIMI:FIRST_CHUNK] label=${label} TTFT=${firstChunkMs}ms`);
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) { fullContent += delta.content; contentChunks++; }
          if (delta?.reasoning_content) {
            reasoningChunks++;
            if (reasoningChunks === 1) {
              console.warn(`[KIMI:THINKING_LEAK] label=${label} reasoning tokens present despite disabled — check API support`);
            }
          }
          if (json.usage) {
            console.log(`[KIMI:USAGE] label=${label} prompt=${json.usage.prompt_tokens} completion=${json.usage.completion_tokens} total=${json.usage.total_tokens}`);
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    const totalMs = Date.now() - t0;
    console.log(`[KIMI:COMPLETE] label=${label} total_ms=${totalMs} TTFT=${firstChunkMs}ms content_chars=${fullContent.length} content_chunks=${contentChunks} reasoning_chunks=${reasoningChunks}`);

    return fullContent.trim();
  }

  private parseIterationResult(raw: string, iteration: number): IterationResult {
    try {
      const clean = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      const result = {
        python: this.extractCode(parsed.python || ''),
        summary: (parsed.summary || 'No summary').slice(0, 200),
        enough: Boolean(parsed.enough),
        reason: (parsed.reason || '').slice(0, 100),
      };
      console.log(`[KIMI:PARSE_OK] iter=${iteration} python_chars=${result.python.length} enough=${result.enough}`);
      return result;
    } catch (e) {
      console.error(`[KIMI:PARSE_FAIL] iter=${iteration} error="${String(e)}" raw="${raw.slice(0, 200)}"`);
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
