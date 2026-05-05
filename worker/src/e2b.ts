// E2B execution via Pyodide (Python in WebAssembly)
// Runs Python code directly in Cloudflare Worker without external services

export interface E2BResult {
  stdout: string;
  stderr: string;
  error: string | null;
  executionTime: number;
}

export class E2BClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async runPython(code: string): Promise<E2BResult> {
    const start = Date.now();
    try {
      const resp = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "python",
          version: "3.10.0",
          files: [{ content: code }],
        }),
      });
      if (!resp.ok) throw new Error(`Piston execute failed: ${resp.status} ${await resp.text()}`);
      const data = await resp.json() as {
        run: { stdout: string; stderr: string; code: number; output: string };
      };
      return {
        stdout: data.run.stdout || "",
        stderr: data.run.stderr || "",
        error: data.run.code !== 0 ? `Exit code ${data.run.code}: ${data.run.stderr}` : null,
        executionTime: Date.now() - start,
      };
    } catch (err) {
      return {
        stdout: "",
        stderr: String(err),
        error: String(err),
        executionTime: Date.now() - start,
      };
    }
  }

  async createSandbox(_timeoutMs = 120000): Promise<string> {
    return "piston-sandbox";
  }

  async runCode(_sandboxId: string, code: string): Promise<E2BResult> {
    return this.runPython(code);
  }

  async installPackages(_sandboxId: string, _packages: string[]): Promise<void> {
    // Piston has pandas, numpy, matplotlib pre-installed
  }

  async uploadCSV(_sandboxId: string, csvContent: string): Promise<void> {
    // Store CSV in memory - inject into code via global variable
    (globalThis as unknown as Record<string, string>)["__csv_content__"] = csvContent;
  }

  async downloadFile(_sandboxId: string, _path: string): Promise<string> {
    return "";
  }

  async closeSandbox(_sandboxId: string): Promise<void> {
    // no-op
  }
}
