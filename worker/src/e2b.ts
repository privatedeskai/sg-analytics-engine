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

  async runPython(code: string): Promise<E2BResult> {
    const start = Date.now();

    const sbResp = await fetch(`${this.apiUrl}/sandboxes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": this.apiKey },
      body: JSON.stringify({ templateID: "code-interpreter-v1" }),
    });
    if (!sbResp.ok) throw new Error(`E2B create failed: ${sbResp.status} ${await sbResp.text()}`);
    const sb = await sbResp.json() as { sandboxID: string; clientID: string };
    const sandboxID = sb.sandboxID;
    const host = `${sandboxID}.e2b.app`;

    try {
      const runResp = await fetch(`https://${host}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: "python" }),
      });
      if (!runResp.ok) throw new Error(`E2B run failed: ${runResp.status} ${await runResp.text()}`);
      const result = await runResp.json() as { stdout?: string; stderr?: string; error?: string };
      return {
        stdout: result.stdout || "",
        stderr: result.stderr || "",
        error: result.error || null,
        executionTime: Date.now() - start,
      };
    } finally {
      await fetch(`${this.apiUrl}/sandboxes/${sandboxID}`, {
        method: "DELETE",
        headers: { "X-API-Key": this.apiKey },
      }).catch(() => {});
    }
  }
}
