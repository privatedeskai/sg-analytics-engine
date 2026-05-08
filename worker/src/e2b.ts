// Code execution via Judge0 CE public API
// https://ce.judge0.com — no API key required
// Python language_id: 109 (Python 3.12)

export interface E2BResult {
  stdout: string;
  stderr: string;
  error: string | null;
  executionTime: number;
}

const JUDGE0_URL = 'https://ce.judge0.com';
const PYTHON_LANGUAGE_ID = 109;
const POLL_INTERVAL_MS = 500;
const POLL_MAX_ATTEMPTS = 20; // 20 × 500ms = 10 сек потолок

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): string {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch { return ''; }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class E2BClient {
  private csvContent: string = '';
  private csvB64: string = '';

  constructor(_apiKey: string) {}

  async createSandbox(): Promise<string> {
    return 'judge0-sandbox';
  }

  async installPackages(_sandboxId: string, _packages: string[]): Promise<void> {}

  async uploadCSV(_sandboxId: string, csvContent: string): Promise<void> {
    this.csvContent = csvContent;
    this.csvB64 = toBase64(csvContent);
  }

  async runCode(_sandboxId: string, code: string): Promise<E2BResult> {
    const preamble = this.csvB64
      ? [
          'import base64, io',
          `_CSV_B64 = "${this.csvB64}"`,
          'CSV_DATA = base64.b64decode(_CSV_B64).decode("utf-8")',
          '',
        ].join('\n')
      : '';
    return this.runPython(preamble + code);
  }

  async runPython(code: string): Promise<E2BResult> {
    const start = Date.now();
    try {
      // Шаг 1 — отправить задачу без wait=true
      const submitResp = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_code: toBase64(code),
          language_id: PYTHON_LANGUAGE_ID,
          cpu_time_limit: 10,
          wall_time_limit: 15,
          memory_limit: 256000,
        }),
      });

      if (!submitResp.ok) {
        const err = await submitResp.text();
        throw new Error(`Judge0 submit failed: ${submitResp.status} ${err}`);
      }

      const { token } = await submitResp.json() as { token: string };
      if (!token) throw new Error('Judge0 returned no token');

      // Шаг 2 — polling по статусу пока не завершится
      let attempts = 0;
      while (attempts < POLL_MAX_ATTEMPTS) {
        await sleep(POLL_INTERVAL_MS);
        attempts++;

        const pollResp = await fetch(
          `${JUDGE0_URL}/submissions/${token}?base64_encoded=true&fields=status,stdout,stderr,compile_output,message,time`,
          { method: 'GET' }
        );

        if (!pollResp.ok) continue;

        const result = await pollResp.json() as {
          stdout?: string | null;
          stderr?: string | null;
          compile_output?: string | null;
          message?: string | null;
          status?: { id: number; description: string };
          time?: string;
        };

        const statusId = result.status?.id || 0;

        // статусы 1 (In Queue) и 2 (Processing) — ждём
        if (statusId === 1 || statusId === 2) continue;

        // любой другой статус — завершено (3=Accepted, 4+=Error)
        const stdout = result.stdout ? fromBase64(result.stdout) : '';
        const stderr = result.stderr ? fromBase64(result.stderr) : '';
        const compileOut = result.compile_output ? fromBase64(result.compile_output) : '';
        const errText = stderr || compileOut || result.message || '';
        const isError = statusId !== 3;

        return {
          stdout,
          stderr: errText,
          error: isError ? `Execution failed (${result.status?.description}): ${errText}` : null,
          executionTime: Date.now() - start,
        };
      }

      throw new Error(`Judge0 polling timeout after ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS}ms`);

    } catch (err) {
      return {
        stdout: '',
        stderr: String(err),
        error: String(err),
        executionTime: Date.now() - start,
      };
    }
  }

  async downloadFile(_sandboxId: string, _path: string): Promise<string> { return ''; }
  async closeSandbox(_sandboxId: string): Promise<void> {}
}
