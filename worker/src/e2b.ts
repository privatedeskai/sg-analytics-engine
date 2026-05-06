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

// Safe base64 encode — handles Unicode, Cyrillic, special chars
function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Safe base64 decode — handles Unicode, Cyrillic, special chars
function fromBase64(b64: string): string {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

export class E2BClient {
  private apiKey: string;
  private csvContent: string = '';
  private csvB64: string = '';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createSandbox(_timeoutMs = 120000): Promise<string> {
    return 'judge0-sandbox';
  }

  async installPackages(_sandboxId: string, _packages: string[]): Promise<void> {
    // Judge0 CE has pandas, numpy pre-installed
  }

  async uploadCSV(_sandboxId: string, csvContent: string): Promise<void> {
    this.csvContent = csvContent;
    // Unicode-safe base64 encoding
    this.csvB64 = toBase64(csvContent);
  }

  async runCode(_sandboxId: string, code: string): Promise<E2BResult> {
    // Inject CSV via base64 — safe for Cyrillic, quotes, backslashes, any Unicode
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
      // Unicode-safe base64 encode of source code
      const sourceB64 = toBase64(code);

      const submitResp = await fetch(`${JUDGE0_URL}/submissions?wait=true&base64_encoded=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_code: sourceB64,
          language_id: PYTHON_LANGUAGE_ID,
          cpu_time_limit: 10,
          wall_time_limit: 20,
          memory_limit: 256000,
        }),
      });

      if (!submitResp.ok) {
        const err = await submitResp.text();
        throw new Error(`Judge0 submit failed: ${submitResp.status} ${err}`);
      }

      const result = await submitResp.json() as {
        stdout?: string | null;
        stderr?: string | null;
        compile_output?: string | null;
        message?: string | null;
        status?: { id: number; description: string };
        time?: string;
      };

      // Unicode-safe base64 decode of outputs
      const stdout = result.stdout ? fromBase64(result.stdout) : '';
      const stderr = result.stderr ? fromBase64(result.stderr) : '';
      const compileOut = result.compile_output ? fromBase64(result.compile_output) : '';
      const errText = stderr || compileOut || result.message || '';

      const statusId = result.status?.id || 0;
      const isError = statusId !== 3 && statusId !== 0;
      const error = isError
        ? `Execution failed (${result.status?.description}): ${errText}`
        : null;

      return {
        stdout,
        stderr: errText,
        error,
        executionTime: Date.now() - start,
      };
    } catch (err) {
      return {
        stdout: '',
        stderr: String(err),
        error: String(err),
        executionTime: Date.now() - start,
      };
    }
  }

  async downloadFile(_sandboxId: string, _path: string): Promise<string> {
    return '';
  }

  async closeSandbox(_sandboxId: string): Promise<void> {
    // no-op
  }
}
