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

export class E2BClient {
  private apiKey: string; // kept for interface compatibility, not used
  private csvContent: string = '';

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
  }

  async runCode(_sandboxId: string, code: string): Promise<E2BResult> {
    const csvEscaped = this.csvContent.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"');
    const preamble = this.csvContent ? `CSV_DATA = """${csvEscaped}"""\n\n` : '';
    return this.runPython(preamble + code);
  }

  async runPython(code: string): Promise<E2BResult> {
    const start = Date.now();
    try {
      // Submit with wait=true — синхронное ожидание результата
      const submitResp = await fetch(`${JUDGE0_URL}/submissions?wait=true&base64_encoded=false`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_code: code,
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

      const result = await submitResp.json() as {
        stdout?: string | null;
        stderr?: string | null;
        compile_output?: string | null;
        message?: string | null;
        status?: { id: number; description: string };
        time?: string;
      };

      const stdout = result.stdout || '';
      const stderr = result.stderr || result.compile_output || result.message || '';
      const statusId = result.status?.id || 0;

      // Status IDs: 3=Accepted, 4=Wrong Answer, 5=TLE, 6=Compilation Error, 11=Runtime Error
      const isError = statusId !== 3 && statusId !== 0;
      const error = isError
        ? `Execution failed (${result.status?.description}): ${stderr}`
        : null;

      return {
        stdout,
        stderr,
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
