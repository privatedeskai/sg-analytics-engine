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

const MAX_ITERATIONS = 10;

// Kimi K2.6 on DeepInfra: cold start 15-20s, warm 2-3s
// 30s covers cold start with margin
const KIMI_TIMEOUT_MS    = 30000;
const JUDGE0_TIMEOUT_MS  = 15000;
const SUMMARY_TIMEOUT_MS = 30000;

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
      console.log(`[ORCHESTRATOR] fetch /analyze — sessionId=${body.sessionId} USING_maxIter=${MAX_ITERATIONS}`);
      this.state.waitUntil(this.runAnalysis(body));
      return Response.json({ sessionId: body.sessionId, status: "started" });
    }
    return new Response("Not found", { status: 404 });
  }

  private async saveStatus(status: SessionStatus): Promise<void> {
    try {
      console.log(`[KV:write] session=${status.sessionId} status=${status.status} iter=${status.iteration}/${status.total} msg="${status.message}"`);
      await this.env.KV.put(`session:${status.sessionId}`, JSON.stringify(status), { expirationTtl: 86400 });
    } catch (err) {
      console.error(`[KV:write:ERROR]`, err);
    }
  }

  private getIterationMessage(i: number, total: number): string {
    const pct = Math.round(i / total * 100);
    if (i === 1) return `Loading data, detecting schema... (${pct}%)`;
    if (i === 2) return `Grouping by periods, searching anomalies... (${pct}%)`;
    if (i <= 4)  return `Testing hypotheses... (${pct}%)`;
    if (i <= 7)  return `Deepening analysis... (${pct}%)`;
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
    const maxIter = MAX_ITERATIONS;
    const { sessionId, question, csvContent, language = "ru" } = req;

    console.log(`[ANALYSIS:START] session=${sessionId} maxIter=${maxIter} kimi_timeout=${KIMI_TIMEOUT_MS}ms question="${question.slice(0,60)}"`);

    const e2b       = new E2BClient(this.env.E2B_API_KEY);
    const kimi      = new KimiClient(this.env.DEEPINFRA_API_KEY);
    const formatter = new OutputFormatter();

    const result: AnalysisResult = {
      sessionId, summary: "", metrics: [], charts: [], iterations: [], durationMs: 0,
    };

    try {
      await this.saveStatus({ sessionId, iteration: 0, total: maxIter, message: "Initializing...", status: "running", startedAt: new Date().toISOString(), question });

      const sandboxId = await e2b.createSandbox(180000);
      console.log(`[E2B] Sandbox created: ${sandboxId}`);
      await e2b.uploadCSV(sandboxId, csvContent);
      console.log(`[E2B] CSV uploaded (${csvContent.length} bytes)`);

      const schemaCode = [
        "import csv, json, io",
        "reader = csv.DictReader(io.StringIO(CSV_DATA))",
        "rows = list(reader)",
        "columns = list(rows[0].keys()) if rows else []",
        "sample = rows[:3]",
        "print(json.dumps({'schema': {'columns': columns, 'shape': [len(rows), len(columns)]}, 'sample': sample}))",
      ].join("\n");

      const schemaRun = await this.withTimeout(e2b.runCode(sandboxId, schemaCode), 15000, "schema detection");
      let dataDescription = `CSV columns: ${csvContent.split('\n')[0]}`;
      try {
        const parsed = JSON.parse(schemaRun.stdout) as any;
        dataDescription = `Schema: ${JSON.stringify(parsed.schema)}\nSample: ${JSON.stringify(parsed.sample)}`;
        console.log(`[SCHEMA] OK — columns=${JSON.stringify(parsed.schema?.columns)} rows=${parsed.schema?.shape?.[0]}`);
      } catch {
        console.log(`[SCHEMA] Parse failed — using CSV header fallback`);
      }

      const iterationSummaries: string[] = [];
      let converged = false;

      for (let i = 1; i <= maxIter; i++) {
        const iterStart = Date.now();
        console.log(`[ITER:${i}/${maxIter}] ===== START ===== elapsed=${Date.now()-startTime}ms`);

        await this.saveStatus({ sessionId, iteration: i, total: maxIter, message: this.getIterationMessage(i, maxIter), status: "running", question });

        let iterResult: any;
        try {
          console.log(`[ITER:${i}] Calling Kimi K2.6 (timeout=${KIMI_TIMEOUT_MS}ms)...`);
          iterResult = await this.withTimeout(
            kimi.generateIteration(dataDescription, question, iterationSummaries, i, maxIter),
            KIMI_TIMEOUT_MS, `kimi iteration ${i}`
          );
          console.log(`[ITER:${i}] Kimi OK — python=${iterResult.python.length}chars enough=${iterResult.enough} elapsed=${Date.now()-iterStart}ms`);
        } catch (err) {
          console.error(`[ITER:${i}] Kimi TIMEOUT/ERROR: ${String(err)}`);
          iterationSummaries.push(`Iteration ${i} skipped: ${String(err)}`);
          continue;
        }

        let execResult: any;
        try {
          console.log(`[ITER:${i}] Running code in Judge0...`);
          execResult = await this.withTimeout(e2b.runCode(sandboxId, iterResult.python), JUDGE0_TIMEOUT_MS, `judge0 iteration ${i}`);
          console.log(`[ITER:${i}] Judge0 done — stdout=${execResult.stdout.slice(0,100)} error=${execResult.error} execTime=${execResult.executionTime}ms total_elapsed=${Date.now()-iterStart}ms`);
        } catch (err) {
          execResult = { stdout: "", stderr: String(err), error: String(err), executionTime: 0 };
          console.error(`[ITER:${i}] Judge0 TIMEOUT/ERROR: ${String(err)}`);
        }

        const output = execResult.error
          ? `ERROR: ${execResult.error}\nSTDERR: ${execResult.stderr}`
          : execResult.stdout || execResult.stderr || "(no output)";

        iterationSummaries.push(iterResult.summary);
        result.iterations.push({ n: i, output, executionTimeMs: execResult.executionTime || 0 });

        const parsed = formatter.parseExecutionResult(output);
        if (parsed.metrics.length > 0) result.metrics = parsed.metrics;
        if (parsed.charts.length > 0)  result.charts  = parsed.charts;

        console.log(`[ITER:${i}/${maxIter}] ===== END ===== iter_elapsed=${Date.now()-iterStart}ms total_elapsed=${Date.now()-startTime}ms`);

        if (iterResult.enough) {
          converged = true;
          console.log(`[CONVERGENCE] Kimi signaled enough at iteration ${i}/${maxIter}: "${iterResult.reason}"`);
          break;
        }
      }

      console.log(`[SUMMARY] Generating final summary (converged=${converged}, iterations=${result.iterations.length})... elapsed=${Date.now()-startTime}ms`);
      await this.saveStatus({ sessionId, iteration: maxIter, total: maxIter, message: "Generating final summary...", status: "running", question });

      try {
        result.summary = await this.withTimeout(
          kimi.generateFinalAnalysis(question, iterationSummaries, language),
          SUMMARY_TIMEOUT_MS, "final summary"
        );
        console.log(`[SUMMARY] OK — ${result.summary.length} chars`);
      } catch (err) {
        console.error(`[SUMMARY] TIMEOUT/ERROR: ${String(err)}`);
        result.summary = iterationSummaries.filter(s => !s.startsWith("Iteration")).join("\n\n") || "Analysis completed.";
      }

      result.durationMs = Date.now() - startTime;
      console.log(`[ANALYSIS:COMPLETE] session=${sessionId} durationMs=${result.durationMs} iterations=${result.iterations.length} converged=${converged}`);

      await this.saveStatus({ sessionId, iteration: maxIter, total: maxIter, message: "Analysis complete", status: "completed", result, completedAt: new Date().toISOString(), question });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ANALYSIS:FATAL] session=${sessionId} error="${errMsg}" elapsed=${Date.now()-startTime}ms`);
      result.error = errMsg;
      result.durationMs = Date.now() - startTime;
      await this.saveStatus({ sessionId, iteration: 0, total: maxIter, message: `Error: ${errMsg}`, status: "error", error: errMsg, result, question });
    }
  }
}
