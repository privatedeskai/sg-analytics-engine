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
  MAX_ITERATIONS: string;
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
      // Запускаем анализ через waitUntil чтобы DO жил до завершения
      this.state.waitUntil(this.runAnalysis(body));
      return Response.json({ sessionId: body.sessionId, status: "started" });
    }

    return new Response("Not found", { status: 404 });
  }

  private async saveStatus(status: SessionStatus): Promise<void> {
    // Пишем в KV — чтобы index.ts мог читать через /result
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
    if (i <= 2) return `Loading data, checking structure... (${pct}%)`;
    if (i <= 4) return `Grouping by periods, searching for anomalies... (${pct}%)`;
    if (i <= 7) return `Testing hypotheses, deepening analysis... (${pct}%)`;
    return `Forming conclusions and recommendations... (${pct}%)`;
  }

  private async runAnalysis(req: AnalysisRequest): Promise<void> {
    const startTime = Date.now();
    const maxIter = req.maxIterations || 3;
    const { sessionId, question, csvContent, language = "en" } = req;

    const e2b = new E2BClient(this.env.E2B_API_KEY);
    const kimi = new KimiClient(this.env.CLAUDE_API_KEY);
    const formatter = new OutputFormatter();

    const result: AnalysisResult = {
      sessionId, summary: "", metrics: [], charts: [], iterations: [], durationMs: 0,
    };

    try {
      await this.saveStatus({
        sessionId, iteration: 0, total: maxIter,
        message: "Initializing sandbox...", status: "running",
        startedAt: new Date().toISOString(), question,
      });

      const sandboxId = await e2b.createSandbox(180000);
      await e2b.installPackages(sandboxId, ["pandas", "numpy", "matplotlib"]);
      await e2b.uploadCSV(sandboxId, csvContent);

      // Получаем схему данных
      const schemaCode = [
        "import pandas as pd, json, io",
        "df = pd.read_csv(io.StringIO(CSV_DATA))",
        "info = {'columns': list(df.columns), 'dtypes': {c: str(df[c].dtype) for c in df.columns}, 'shape': list(df.shape)}",
        "sample = df.head(3).to_dict(orient='records')",
        "print(json.dumps({'schema': info, 'sample': sample}))",
      ].join("\n");

      const schemaRun = await e2b.runCode(sandboxId, schemaCode);

      let dataDescription = `CSV data with columns: ${csvContent.split('\n')[0]}`;
      try {
        const parsed = JSON.parse(schemaRun.stdout) as any;
        dataDescription = `Schema: ${JSON.stringify(parsed.schema)}\nSample rows: ${JSON.stringify(parsed.sample)}`;
      } catch { /* use default */ }

      const executionOutputs: string[] = [];

      for (let i = 1; i <= maxIter; i++) {
        await this.saveStatus({
          sessionId, iteration: i, total: maxIter,
          message: this.getIterationMessage(i, maxIter), status: "running", question,
        });

        let pythonCode = "";
        try {
          const prevResult = executionOutputs.length > 0 ? executionOutputs[executionOutputs.length - 1] : undefined;
          pythonCode = await kimi.generatePython(dataDescription, question, prevResult, i);
        } catch (err) {
          console.error(`Kimi error iter ${i}:`, err);
          await this.saveStatus({
            sessionId, iteration: i, total: maxIter,
            message: `AI error on iteration ${i}: ${String(err)}`, status: "error",
            error: String(err), question,
          });
          break;
        }

        let execResult: any;
        try {
          execResult = await e2b.runCode(sandboxId, pythonCode);
        } catch (err) {
          execResult = { stdout: "", stderr: String(err), error: String(err), executionTime: 0 };
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

      await this.saveStatus({
        sessionId, iteration: maxIter, total: maxIter,
        message: "Generating final summary...", status: "running", question,
      });

      result.summary = await kimi.generateFinalAnalysis(question, executionOutputs, language);
      result.durationMs = Date.now() - startTime;

      await this.saveStatus({
        sessionId, iteration: maxIter, total: maxIter,
        message: "Analysis complete", status: "completed",
        result, completedAt: new Date().toISOString(), question,
      });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
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
