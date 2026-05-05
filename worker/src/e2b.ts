export interface E2BResult {
  stdout: string;
  stderr: string;
  error: string | null;
  executionTime: number;
}

export class E2BClient {
  private apiKey: string;
  private apiUrl = "https://api.e2b.app";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createSandbox(timeoutMs = 120000): Promise<string> {
    const resp = await fetch(`${this.apiUrl}/sandboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
      body: JSON.stringify({ templateID: "code-interpreter-v1", timeout: Math.floor(timeoutMs / 1000) }),
    });
    if (!resp.ok) throw new Error(`E2B createSandbox failed: ${resp.status} ${await resp.text()}`);
    const data = await resp.json() as { sandboxID: string };
    return data.sandboxID;
  }

  async runCode(sandboxId: string, code: string): Promise<E2BResult> {
    const start = Date.now();
    const resp = await fetch(`https://${sandboxId}.e2b.app/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
      body: JSON.stringify({ code, language: "python" }),
    });
    if (!resp.ok) throw new Error(`E2B runCode failed: ${resp.status} ${await resp.text()}`);
    const data = await resp.json() as { stdout?: string; stderr?: string; error?: string };
    return {
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      error: data.error || null,
      executionTime: Date.now() - start,
    };
  }

  async installPackages(sandboxId: string, packages: string[]): Promise<void> {
    const pkgs = packages.join(" ");
    await this.runCode(sandboxId, `import subprocess; subprocess.run(["pip", "install", "-q"] + "${pkgs}".split()); print("installed")`);
  }

  async uploadCSV(sandboxId: string, csvContent: string): Promise<void> {
    const encoded = btoa(unescape(encodeURIComponent(csvContent)));
    await this.runCode(sandboxId, `
import base64
data = base64.b64decode("${encoded}").decode("utf-8")
with open("/tmp/data.csv", "w", encoding="utf-8") as f:
    f.write(data)
print("uploaded")
`);
  }

  async downloadFile(sandboxId: string, path: string): Promise<string> {
    const resp = await fetch(`https://${sandboxId}.e2b.app/files?path=${encodeURIComponent(path)}`, {
      headers: { "X-API-Key": this.apiKey },
    });
    if (!resp.ok) throw new Error(`E2B downloadFile failed: ${resp.status}`);
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async closeSandbox(sandboxId: string): Promise<void> {
    await fetch(`${this.apiUrl}/sandboxes/${sandboxId}`, {
      method: "DELETE",
      headers: { "X-API-Key": this.apiKey },
    }).catch(() => {});
  }
}
