import { Sandbox } from "@e2b/code-interpreter";

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
    const sandbox = await Sandbox.create({ apiKey: this.apiKey });
    try {
      const execution = await sandbox.runCode(code);
      const stdout = execution.logs.stdout.join("\n");
      const stderr = execution.logs.stderr.join("\n");
      const error = execution.error ? execution.error.value : null;
      return {
        stdout,
        stderr,
        error,
        executionTime: Date.now() - start,
      };
    } finally {
      await sandbox.kill();
    }
  }
}
