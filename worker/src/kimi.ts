import { secp256k1 } from '@noble/curves/secp256k1';

export interface IterationResult {
  python: string; summary: string; enough: boolean; reason: string;
}

const GONKA_NODES = [
  'https://node4.gonka.ai',
  'https://node1.gonka.ai',
  'https://node2.gonka.ai',
  'https://node3.gonka.ai',
];

// TD-007: модель Qwen3-235B (Kimi-K2.6 недоступна на node4, переключено в сессии 10)
const MODEL = 'Qwen/Qwen3-235B-A22B-Instruct-2507-FP8';

// Таймаут на один запрос к ноде — 8 сек. Итого максимум 4 × 8 = 32 сек вместо 4 × 30 = 120 сек
const NODE_TIMEOUT_MS = 8000;

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const arr = new Uint8Array(h.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function sha256Bytes(data: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return new Uint8Array(buf);
}

async function buildSignature(
  payloadString: string,
  timestampNs: bigint,
  providerAddress: string,
  privateKeyHex: string
): Promise<{ authHeader: string; timestamp: string }> {
  const hash = await sha256Bytes(payloadString + timestampNs.toString() + providerAddress);
  const sig = secp256k1.sign(hash, hexToBytes(privateKeyHex), { lowS: true });
  const r = sig.r.toString(16).padStart(64, '0');
  const s = sig.s.toString(16).padStart(64, '0');
  return {
    authHeader: bytesToBase64(hexToBytes(r + s)),
    timestamp: timestampNs.toString(),
  };
}

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
      // Пересчитываем timestamp для каждой ноды — старая подпись может быть отклонена
      const timestampNs = BigInt(Date.now()) * 1_000_000n;
      const { authHeader, timestamp } = await buildSignature(payloadString, timestampNs, providerAddress, privateKeyHex);
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
        'X-Requester-Address': providerAddress,
        'X-Timestamp': timestamp,
      };

      const res = await fetch(node + '/v1/chat/completions', {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(NODE_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = (await res.text()).slice(0, 100);
        console.log('[LLM] ' + node + ' status=' + res.status + ' ' + errText);
        lastError = 'HTTP ' + res.status;
        continue;
      }

      const text = await collectStream(res);
      if (!text || text.length < 5) {
        console.log('[LLM] ' + node + ' empty response, trying next node');
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
    const raw = await this.call(sp, um, 2000);
    console.log('[LLM] iter=' + i + ' elapsed=' + (Date.now() - t0) + 'ms len=' + raw.length);
    return this.parse(raw, i);
  }

  async generateFinalAnalysis(q: string, sums: string[], lang = 'ru'): Promise<string> {
    if (sums.length === 0) return 'Анализ не дал результатов — все итерации завершились с ошибкой.';
    const l = lang === 'ru' ? 'Respond in Russian. Plain text, no markdown.' : 'Respond in English. Plain text.';
    const s = 'You are a business analyst. ' + l + ' Give summary, key findings, 1 actionable recommendation.';
    const m = 'Question: ' + q + '\n\nFindings:\n' + sums.map((s, i) => (i + 1) + '. ' + s).join('\n');
    return await this.call(s, m, 1500);
  }

  private async call(sys: string, usr: string, max: number): Promise<string> {
    return callGonka(
      { model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.6, max_tokens: max, stream: true },
      this.key,
      this.address
    );
  }

  private parse(raw: string, i: number): IterationResult {
    // Попытка 1 — чистый JSON после удаления markdown-блоков
    try {
      const clean = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
      const p = JSON.parse(clean);
      if (p && typeof p === 'object') {
        return {
          python: this.extractCode(p.python || ''),
          summary: (p.summary || '').slice(0, 200),
          enough: Boolean(p.enough),
          reason: (p.reason || '').slice(0, 100),
        };
      }
    } catch (_) {}

    // Попытка 2 — regex-извлечение из частично сломанного JSON
    try {
      const pythonMatch = raw.match(/"python"\s*:\s*"([\s\S]*?)(?<!\\)"/);
      const summaryMatch = raw.match(/"summary"\s*:\s*"([^"]{0,200})"/);
      const enoughMatch = raw.match(/"enough"\s*:\s*(true|false)/);
      const reasonMatch = raw.match(/"reason"\s*:\s*"([^"]{0,100})"/);

      if (pythonMatch || summaryMatch) {
        console.log('[LLM] parse fallback regex iter=' + i);
        return {
          python: this.extractCode(pythonMatch?.[1]?.replace(/\\n/g, '\n').replace(/\\"/g, '"') || raw),
          summary: summaryMatch?.[1] || 'iter ' + i + ' (partial parse)',
          enough: enoughMatch?.[1] === 'true',
          reason: reasonMatch?.[1] || 'partial parse',
        };
      }
    } catch (_) {}

    // Попытка 3 — совсем сломано, берём как есть
    console.log('[LLM] parse failed completely iter=' + i + ' raw=' + raw.slice(0, 100));
    return { python: this.extractCode(raw), summary: 'fallback iter ' + i, enough: false, reason: 'parse failed' };
  }

  private extractCode(t: string): string {
    const m = t.match(/```(?:python)?\n?([\s\S]*?)```/);
    return m ? m[1].trim() : t.trim();
  }
}
