export interface E2BResult {
  stdout: string;
  stderr: string;
  error: string | null;
  executionTime: number;
}

export class E2BClient {
  private apiKey: string;
  private baseUrl = "https://api.e2b.dev";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createSandbox(timeoutMs = 120000): Promise<string> {
    const response = await fetch(`${this.baseUrl}/sandboxes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        template: "Python3",
        timeout: Math.floor(timeoutMs / 1000),
        metadata: { source: "sg-analytics-engine" },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`E2B createSandbox failed: ${response.status} — ${err}`);
    }
    const data = await response.json() as { sandboxId: string };
    return data.sandboxId;
  }

  async runCode(sandboxId: string, code: string): Promise<E2BResult> {
    const start = Date.now();
    const response = await fetch(`${this.baseUrl}/sandboxes/${sandboxId}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({ code, language: "python" }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`E2B runCode failed: ${response.status} — ${err}`);
    }
    const data = await response.json() as {
      stdout?: string;
      stderr?: string;
      error?: string;
    };
    return {
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      error: data.error || null,
      executionTime: Date.now() - start,
    };
  }

  async installPackages(sandboxId: string, packages: string[]): Promise<void> {
    const pkgArgs = packages.map(p => `"${p}"`).join(", ");
    const code = `
import subprocess, sys
result = subprocess.run(
    [sys.executable, "-m", "pip", "install", "--quiet", ${pkgArgs}],
    capture_output=True, text=True
)
if result.returncode != 0:
    raise Exception(result.stderr)
print("OK: installed ${packages.join(", ")}")
`;
    const result = await this.runCode(sandboxId, code);
    if (result.error) throw new Error(`installPackages: ${result.error}`);
  }

  async uploadCSV(sandboxId: string, csvContent: string, filename = "data.csv"): Promise<void> {
    const b64 = btoa(unescape(encodeURIComponent(csvContent)));
    const code = `
import base64
raw = base64.b64decode("${b64}").decode("utf-8")
with open("/tmp/${filename}", "w", encoding="utf-8") as f:
    f.write(raw)
print(f"Uploaded /tmp/${filename} ({len(raw)} chars)")
`;
    const result = await this.runCode(sandboxId, code);
    if (result.error) throw new Error(`uploadCSV: ${result.error}`);
  }

  async downloadFile(sandboxId: string, path: string): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/sandboxes/${sandboxId}/files?path=${encodeURIComponent(path)}`,
      { headers: { "X-API-Key": this.apiKey } }
    );
    if (!response.ok) throw new Error(`E2B downloadFile failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  async closeSandbox(sandboxId: string): Promise<void> {
    await fetch(`${this.baseUrl}/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers: { "X-API-Key": this.apiKey },
    }).catch(() => {});
  }
}
