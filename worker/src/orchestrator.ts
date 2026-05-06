import { E2BClient } from "./e2b";
import { KimiClient } from "./kimi";
import { OutputFormatter } from "./output";

export interface AnalysisRequest {
  sessionId: string;
  question: string;
  csvContent: string;
  userId: string;
  maxIterations?: number;
  language?: "ru" | "en";
}

export interface SessionStatus {
  sessionId: string;
  iteration: number;
  total: number;
  message: string;
  status: "running" | "completed" | "error";
  result?: AnalysisResult;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  question?: string;
}

export interface AnalysisResult {
  sessionId: string;
  summary: string;
  metrics: any[];
  charts: any[];
  iterations: Array<{ n: number; output: string; executionTimeMs: number }>;
  durationMs: number;
  error?: string;
}

interface Env {
  KV: KVNamespace;
  E2B_API_KEY: string;
  DEEPINFRA_API_KEY: string;
  CLAUDE_API_KEY: string;
}

export class AnalysisOrchestrator implements DurableObject {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/analyze" && request.method === "POST") {
      const body = await request.json() as AnalysisRequest;
      this.state.waitUntil(this.runAnalysis(body));
      return Response.json({ sessionId: body.sessionId, status: "started" });
    }

    return new Response("Not found", { status: 404 });
  }

  private async saveStatus(status: SessionStatus): Promise<void> {
    try {
      await this.env.KV.put(
        `session:${status.sessionId}`,
        JSON.stringify(status),
        { expirationTtl: 86400 }
      );
    } catch (err) {
      console.error("KV write error:", err);
    }
  }

  private getIterationMessage(i: number, total: number): string {
    const pct = Math.round(i / total * 100);
    if (i === 1) return `Loading data, detecting schema... (${pct}%)`;
    if (i === 2) return `Grouping by periods, searching anomalies... (${pct}%)`;
    if (i === 3) return `Testing hypotheses... (${pct}%)`;
    if (i === 4) return `Deepening analysis... (${pct}%)`;
    return `Forming conclusions... (${pct}%)`;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
      ),
    ]);
  }

  private async runAnalysis(req: AnalysisRequest): Promise<void> {
    const startTime = Date.now();
    // TODO_TEMP TD-002: max 5 iterations — DO CPU limit ~30s per iteration pair
    // REVERT to 10 after switching to Kimi K2.6 (faster) — TD-001
    const maxIter = 5;
    const { sessionId, question, csvContent, language = "en" } = req;

    console.log(`[${sessionId}] Starting analysis, maxIter=${maxIter}`);

    const e2b = new E2BClient(this.env.E2B_API_KEY);
    const kimi = new KimiClient(this.env.CLAUDE_API_KEY);
    const formatter = new OutputFormatter();

    const result: AnalysisResult = {
      sessionId, summary: "", metrics: [], charts: [], iterations: [], durationMs: 0,
    };

    try {
      await this.saveStatus({
        sessionId, iteration: 0, total: maxIter,
        message: "Initializing...", status: "running",
        startedAt: new Date().toISOString(), question,
      });

      const sandboxId = await e2b.createSandbox(180000);
      await e2b.uploadCSV(sandboxId, csvContent);

      // Schema detection
      console.log(`[${sessionId}] Getting schema...`);
      const schemaCode = [
        "import csv, json, io",
        "reader = csv.DictReader(io.StringIO(CSV_DATA))",
        "rows = list(reader)",
        "columns = list(rows[0].keys()) if rows else []",
        "sample = rows[:3]",
        "print(json.dumps({'schema': {'columns': columns, 'shape': [len(rows), len(columns)]}, 'sample': sample}))",
      ].join("\n");

      const schemaRun = await this.withTimeout(
        e2b.runCode(sandboxId, schemaCode),
        15000, "schema detection"
      );

      let dataDescription = `CSV columns: ${csvContent.split('\n')[0]}`;
      try {
        const parsed = JSON.parse(schemaRun.stdout) as any;
        dataDescription = `Schema: ${JSON.stringify(parsed.schema)}\nSample: ${JSON.stringify(parsed.sample)}`;
        console.log(`[${sessionId}] Schema OK`);
      } catch {
        console.log(`[${sessionId}] Schema parse failed, using header`);
      }

      const executionOutputs: string[] = [];

      for (let i = 1; i <= maxIter; i++) {
        console.log(`[${sessionId}] Iteration ${i}/${maxIter} start`);
        await this.saveStatus({
          sessionId, iteration: i, total: maxIter,
          message: this.getIterationMessage(i, maxIter), status: "running", question,
        });

        let pythonCode = "";
        try {
          const prevResult = executionOutputs.length > 0
            ? executionOutputs[executionOutputs.length - 1]
            : undefined;
          pythonCode = await this.withTimeout(
            kimi.generatePython(dataDescription, question, prevResult, i),
            15000, `kimi iteration ${i}`
          );
          console.log(`[${sessionId}] Iter ${i}: Python generated (${pythonCode.length} chars)`);
        } catch (err) {
          console.error(`[${sessionId}] Kimi error iter ${i}:`, err);
          executionOutputs.push(`Kimi error: ${String(err)}`);
          break;
        }

        let execResult: any;
        try {
          execResult = await this.withTimeout(
            e2b.runCode(sandboxId, pythonCode),
            15000, `e2b iteration ${i}`
          );
          console.log(`[${sessionId}] Iter ${i}: stdout=${execResult.stdout.slice(0, 80)}, error=${execResult.error}`);
        } catch (err) {
          execResult = { stdout: "", stderr: String(err), error: String(err), executionTime: 0 };
          console.error(`[${sessionId}] E2B timeout iter ${i}:`, err);
        }

        const output = execResult.error
          ? `ERROR: ${execResult.error}\nSTDERR: ${execResult.stderr}`
          : execResult.stdout || execResult.stderr || "(no output)";

        executionOutputs.push(output);
        result.iterations.push({ n: i, output, executionTimeMs: execResult.executionTime || 0 });

        const parsed = formatter.parseExecutionResult(output);
        if (parsed.metrics.length > 0) result.metrics = parsed.metrics;
        if (parsed.charts.length > 0) result.charts = parsed.charts;
      }

      console.log(`[${sessionId}] Generating final summary...`);
      await this.saveStatus({
        sessionId, iteration: maxIter, total: maxIter,
        message: "Generating final summary...", status: "running", question,
      });

      try {
        result.summary = await this.withTimeout(
          kimi.generateFinalAnalysis(question, executionOutputs, language),
          20000, "final summary"
        );
        console.log(`[${sessionId}] Summary OK (${result.summary.length} chars)`);
      } catch (err) {
        console.error(`[${sessionId}] Summary timeout:`, err);
        result.summary = executionOutputs
          .filter(o => !o.startsWith("ERROR"))
          .slice(-2)
          .join("\n\n") || "Analysis completed. No summary available.";
      }

      result.durationMs = Date.now() - startTime;
      console.log(`[${sessionId}] COMPLETED in ${result.durationMs}ms`);

      await this.saveStatus({
        sessionId, iteration: maxIter, total: maxIter,
        message: "Analysis complete", status: "completed",
        result, completedAt: new Date().toISOString(), question,
      });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[${sessionId}] FATAL ERROR:`, errMsg);
      result.error = errMsg;
      result.durationMs = Date.now() - startTime;
      await this.saveStatus({
        sessionId, iteration: 0, total: maxIter,
        message: `Error: ${errMsg}`, status: "error",
        error: errMsg, result, question,
      });
    }
  }
}
