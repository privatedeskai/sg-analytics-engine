import { createGonkaSignature } from './gonka-signature.js';

export interface IterationResult {
  python: string; summary: string; enough: boolean; reason: string;
}

const GONKA_NODES = ['https://node4.gonka.ai'];
const MODEL = 'Qwen/Qwen3-235B-A22B-Instruct-2507-FP8';
const NODE_TIMEOUT_MS = 15000;

async function collectStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const s = line.slice(6);
      if (s === '[DONE]') continue;
      try {
        const c = JSON.parse(s)?.choices?.[0]?.delta?.content;
        if (c) fullText += c;
      } catch (_) {}
    }
  }
  return fullText;
}

async function callGonka(body: object, privateKeyHex: string, providerAddress: string): Promise<string> {
  const payloadString = JSON.stringify(body);
  let lastError = '';
  for (const node of GONKA_NODES) {
    try {
      const timestampNs = BigInt(Date.now()) * 1_000_000n;
      const authHeader = await createGonkaSignature(privateKeyHex, body, timestampNs, providerAddress);
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'X-Requester-Address': providerAddress,
        'X-Timestamp': timestampNs.toString(),
      };
      const res = await fetch(node + '/v1/chat/completions', {
        method: 'POST', headers, body: payloadString,
        signal: AbortSignal.timeout(NODE_TIMEOUT_MS),
      });
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 100);
        console.log('[LLM] ' + node + ' status=' + res.status + ' ' + errText);
        lastError = 'HTTP ' + res.status;
        continue;
      }
      const text = await collectStream(res);
      if (!text || text.length < 10) {
        console.log('[LLM] ' + node + ' empty response');
        lastError = 'empty response';
        continue;
      }
      console.log('[LLM] success node=' + node + ' chars=' + text.length);
      return text;
    } catch (e: any) {
      const msg = e?.name === 'TimeoutError' ? 'timeout ' + NODE_TIMEOUT_MS + 'ms' : e.message;
      console.log('[LLM] ' + node + ' failed: ' + msg);
      lastError = msg;
    }
  }
  throw new Error('All Gonka nodes failed. Last error: ' + lastError);
}

export class KimiClient {
  constructor(private key: string, private address: string) {}

  async generateIteration(dd: string, q: string, sums: string[], i: number, max: number): Promise<IterationResult> {
    const sp = 'You are a Python data analyst. Write Python under 25 lines for ONE hypothesis. FORBIDDEN: pandas/numpy. CSV in CSV_DATA. Output: print(json.dumps({"result":...})). Respond with JSON only, no markdown: {"python":"...","summary":"...","enough":true/false,"reason":"..."}';
    const cb = sums.length > 0 ? '\n\nKnown findings: ' + sums.map((s, j) => (j + 1) + ': ' + s).join('; ') : '';
    const um = 'Schema:\n' + dd + '\n\nQuestion: ' + q + ' (iter ' + i + '/' + max + ')' + cb + '\n\nOne hypothesis only.';
    const t0 = Date.now();
    const raw = await this.call(sp, um, 4000);
    console.log('[LLM] iter=' + i + ' elapsed=' + (Date.now() - t0) + 'ms len=' + raw.length);
    return this.parse(raw, i);
  }

  async generateFinalAnalysis(q: string, sums: string[], lang = 'ru'): Promise<string> {
    if (sums.length === 0) return 'Анализ не дал результатов — все итерации завершились с ошибкой.';
    const l = lang === 'ru' ? 'Respond in Russian. Plain text, no markdown.' : 'Respond in English. Plain text.';
    const s = 'You are a business analyst. ' + l + ' Give summary, key findings, 1 actionable recommendation.';
    const m = 'Question: ' + q + '\n\nFindings:\n' + sums.map((s, i) => (i + 1) + '. ' + s).join('\n');
    return await this.call(s, m, 2000);
  }

  private async call(sys: string, usr: string, max: number): Promise<string> {
    return callGonka(
      { model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.6, max_tokens: max, stream: true },
      this.key, this.address
    );
  }

  private parse(raw: string, i: number): IterationResult {
    try {
      const clean = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const p = JSON.parse(clean);
      if (p && typeof p === 'object' && p.python) {
        console.log('[LLM] parse ok iter=' + i);
        return {
          python: this.extractCode(p.python || ''),
          summary: (p.summary || '').slice(0, 200),
          enough: Boolean(p.enough),
          reason: (p.reason || '').slice(0, 100),
        };
      }
    } catch (_) {}
    try {
      const jsonMatch = raw.match(/\{[\s\S]*"python"[\s\S]*\}/);
      if (jsonMatch) {
        const p = JSON.parse(jsonMatch[0]);
        if (p && p.python) {
          console.log('[LLM] parse json-extract iter=' + i);
          return {
            python: this.extractCode(p.python || ''),
            summary: (p.summary || '').slice(0, 200),
            enough: Boolean(p.enough),
            reason: (p.reason || '').slice(0, 100),
          };
        }
      }
    } catch (_) {}
    console.log('[LLM] parse failed iter=' + i + ' raw=' + raw.slice(0, 150));
    return { python: '', summary: 'parse failed iter ' + i, enough: false, reason: 'parse failed' };
  }

  private extractCode(t: string): string {
    const m = t.match(/```(?:python)?\n?([\s\S]*?)```/);
    return m ? m[1].trim() : t.trim();
  }
}
