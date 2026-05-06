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
2. Summarize what you found in 1-2 sentences
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
  "reason": "<max 20 words: why enough or what is still missing>"
}`;

    const contextBlock = iterationSummaries.length > 0
      ? `\n\nWhat we know so far:\n${iterationSummaries.map((s, i) => `Iteration ${i + 1}: ${s}`).join('\n')}`
      : '';

    const userMessage = `Data schema:\n${dataDescription}\n\nQuestion: ${question} (iteration ${iteration}/${maxIterations})${contextBlock}\n\nWrite focused Python for ONE specific check. Do not repeat previous analysis.`;

    const systemTokensEst = Math.round(systemPrompt.length / 4);
    const userTokensEst = Math.round(userMessage.length / 4);
    console.log(`[KIMI:PROMPT] iter=${iteration} system_chars=${systemPrompt.length}(~${systemTokensEst}tok) user_chars=${userMessage.length}(~${userTokensEst}tok) total_est_tokens=${systemTokensEst + userTokensEst} summaries_count=${iterationSummaries.length}`);

    const raw = await this.callAPIStreaming(systemPrompt, userMessage, 1500, `iter${iteration}`);
    return this.parseIterationResult(raw, iteration);
  }

  async generateFinalAnalysis(question: string, summaries: string[], language: string = 'ru'): Promise<string> {
    const langInstruction = language === 'ru'
      ? 'Respond in Russian. Be concise and business-focused. Use plain text, no markdown headers.'
      : 'Respond in English. Be concise and business-focused.';

    const systemPrompt = `You are a business analyst. Synthesize findings into clear insights and actionable recommendations. ${langInstruction}
Structure: 1-2 sentence summary, key findings, 1 concrete recommendation.`;

    const userMessage = `Question: ${question}\n\nFindings from ${summaries.length} analysis iterations:\n${summaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;

    console.log(`[KIMI:PROMPT] final system_chars=${systemPrompt.length} user_chars=${userMessage.length} est_tokens=${Math.round((systemPrompt.length + userMessage.length) / 4)}`);

    return await this.callAPIStreaming(systemPrompt, userMessage, 800, 'final');
  }

  private async callAPIStreaming(
    systemPrompt: string,
    userMessage: string,
    maxTokens: number,
    label: string
  ): Promise<string> {
    const t0 = Date.now();

    const body = JSON.stringify({
      model: this.model,
      max_tokens: maxTokens,
      stream: true,
      temperature: 1.0,
      top_p: 1.0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });

    console.log(`[KIMI:REQ] label=${label} model=${this.model} max_tokens=${maxTokens} body_bytes=${body.length}`);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body,
      });
    } catch (err) {
      console.error(`[KIMI:FETCH_ERROR] label=${label} error="${String(err)}" elapsed=${Date.now()-t0}ms`);
      throw err;
    }

    const t1 = Date.now();
    console.log(`[KIMI:RESP] label=${label} status=${response.status} elapsed_to_headers=${t1-t0}ms content-type=${response.headers.get('content-type')}`);

    if (!response.ok) {
      const err = await response.text();
      console.error(`[KIMI:HTTP_ERROR] label=${label} status=${response.status} body=${err.slice(0, 200)}`);
      throw new Error(`Kimi API error ${response.status}: ${err}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    let chunkCount = 0;
    let totalBytes = 0;
    let firstChunkMs: number | null = null;
    let lastChunkMs = t1;
    let contentChunks = 0;
    let reasoningChunks = 0;
    let doneReceived = false;
    let parseErrors = 0;

    while (true) {
      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (err) {
        console.error(`[KIMI:READ_ERROR] label=${label} chunk=${chunkCount} elapsed=${Date.now()-t0}ms error="${String(err)}"`);
        throw err;
      }

      const { done, value } = readResult;

      if (done) {
        console.log(`[KIMI:STREAM_DONE] label=${label} stream_closed elapsed=${Date.now()-t0}ms chunks=${chunkCount} bytes=${totalBytes}`);
        break;
      }

      chunkCount++;
      totalBytes += value.length;
      const now = Date.now();

      if (firstChunkMs === null) {
        firstChunkMs = now - t0;
        console.log(`[KIMI:FIRST_CHUNK] label=${label} TTFT=${firstChunkMs}ms bytes=${value.length}`);
      }

      // Log slow chunks (gap > 3s between chunks)
      const gapMs = now - lastChunkMs;
      if (gapMs > 3000) {
        console.log(`[KIMI:SLOW_CHUNK] label=${label} chunk=${chunkCount} gap=${gapMs}ms elapsed=${now-t0}ms`);
      }
      lastChunkMs = now;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed === 'data: [DONE]') {
          doneReceived = true;
          console.log(`[KIMI:DONE_SIGNAL] label=${label} elapsed=${Date.now()-t0}ms content_so_far=${fullContent.length}chars`);
          continue;
        }

        if (!trimmed.startsWith('data: ')) {
          // Non-data line — could be event: or comment
          if (trimmed.startsWith('event:') || trimmed.startsWith(':')) {
            console.log(`[KIMI:SSE_META] label=${label} line="${trimmed.slice(0, 80)}"`);
          }
          continue;
        }

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          const finishReason = json.choices?.[0]?.finish_reason;

          if (delta?.content) {
            fullContent += delta.content;
            contentChunks++;
          }

          // Detect reasoning/thinking tokens
          if (delta?.reasoning_content) {
            reasoningChunks++;
            if (reasoningChunks === 1) {
              console.log(`[KIMI:THINKING_DETECTED] label=${label} model is using thinking mode — reasoning tokens present`);
            }
          }

          if (finishReason && finishReason !== 'null') {
            console.log(`[KIMI:FINISH] label=${label} finish_reason=${finishReason} elapsed=${Date.now()-t0}ms`);
          }

          // Log usage stats if present
          if (json.usage) {
            console.log(`[KIMI:USAGE] label=${label} prompt_tokens=${json.usage.prompt_tokens} completion_tokens=${json.usage.completion_tokens} total=${json.usage.total_tokens}`);
          }

        } catch (e) {
          parseErrors++;
          if (parseErrors <= 3) {
            console.log(`[KIMI:PARSE_ERR] label=${label} chunk=${chunkCount} raw="${trimmed.slice(0, 100)}"`);
          }
        }
      }
    }

    const totalMs = Date.now() - t0;
    console.log(`[KIMI:COMPLETE] label=${label} total_ms=${totalMs} TTFT=${firstChunkMs}ms content_chars=${fullContent.length} content_chunks=${contentChunks} reasoning_chunks=${reasoningChunks} parse_errors=${parseErrors} done_received=${doneReceived} total_sse_chunks=${chunkCount} total_bytes=${totalBytes}`);

    if (fullContent.length === 0) {
      console.error(`[KIMI:EMPTY_RESPONSE] label=${label} got zero content chars — reasoning_chunks=${reasoningChunks} parse_errors=${parseErrors}`);
    }

    return fullContent.trim();
  }

  private parseIterationResult(raw: string, iteration: number): IterationResult {
    console.log(`[KIMI:PARSE] iter=${iteration} raw_chars=${raw.length} raw_preview="${raw.slice(0, 150).replace(/\n/g, '\\n')}"`);
    try {
      const clean = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(clean);
      const result = {
        python: this.extractCode(parsed.python || ''),
        summary: parsed.summary || 'No summary provided',
        enough: Boolean(parsed.enough),
        reason: parsed.reason || '',
      };
      console.log(`[KIMI:PARSE_OK] iter=${iteration} python_chars=${result.python.length} summary_words=${result.summary.split(' ').length} enough=${result.enough}`);
      return result;
    } catch (e) {
      console.error(`[KIMI:PARSE_FAIL] iter=${iteration} error="${String(e)}" raw_chars=${raw.length} raw_full="${raw.slice(0, 300).replace(/\n/g, '\\n')}"`);
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
