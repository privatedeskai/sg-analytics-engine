import { E2BClient } from "./e2b";
import { KimiClient } from "./kimi";

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
  status: "running" | "done" | "error";
  result?: AnalysisResult;
}

export interface AnalysisResult {
  sessionId: string;
  summary: string;
  iterations: Array<{
    n: number;
    hypothesis: string;
    output: string;
    executionTimeMs: number;
  }>;
  charts: string[];
  totalTokens: number;
  durationMs: number;
  error?: string;
}

const ITER_MSG: Record<number, string> = {
  1: "Загружаю данные, проверяю структуру...",
  2: "Изучаю распределение и качество данных...",
  3: "Ищу основные паттерны и тренды...",
  4: "Проверяю аномалии и выбросы...",
  5: "Анализирую корреляции...",
  6: "Углубляюсь в причины...",
  7: "Сегментирую данные...",
  8: "Верифицирую находки...",
  9: "Формирую рекомендации...",
  10: "Финализирую отчёт...",
};

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
    if (url.pathname === "/status" && request.method === "GET") {
      const sessionId = url.searchParams.get("sessionId") || "";
      const status = await this.state.storage.get<SessionStatus>(`status:${sessionId}`);
      if (!status) return Response.json({ error: "Session not found" }, { status: 404 });
      return Response.json(status);
    }
    return new Response("Not found", { status: 404 });
  }

  private async saveStatus(status: SessionStatus): Promise<void> {
    await this.state.storage.put(`status:${status.sessionId}`, status);
  }

  private async runAnalysis(req: AnalysisRequest): Promise<void> {
    const startTime = Date.now();
    const maxIter = req.maxIterations || 10;
    const { sessionId, question, csvContent, language = "ru" } = req;
    const e2b = new E2BClient(this.env.E2B_API_KEY);
    const kimi = new KimiClient(this.env.DEEPINFRA_API_KEY);
    const result: AnalysisResult = {
      sessionId, summary: "", iterations: [], charts: [],
      totalTokens: 0, durationMs: 0,
    };
    let sandboxId: string | null = null;

    try {
      await this.saveStatus({
        sessionId, iteration: 0, total: maxIter,
        message: "Инициализирую sandbox...", status: "running",
      });

      sandboxId = await e2b.createSandbox(180000);
      await e2b.installPackages(sandboxId, ["pandas", "numpy", "matplotlib", "scipy", "openpyxl"]);
      await e2b.uploadCSV(sandboxId, csvContent);

      const schemaRun = await e2b.runCode(sandboxId, `
import pandas as pd, json
df = pd.read_csv('/tmp/data.csv')
info = {
  "columns": list(df.columns),
  "dtypes": {c: str(df[c].dtype) for c in df.columns},
  "shape": list(df.shape),
  "nulls": {c: int(df[c].isnull().sum()) for c in df.columns}
}
sample = df.head(5).to_csv(index=False)
print(json.dumps({"schema": info, "sample": sample}))
`);

      let schema = "{}";
      let sample = "";
      try {
        const parsed = JSON.parse(schemaRun.stdout) as { schema: unknown; sample: string };
        schema = JSON.stringify(parsed.schema, null, 2);
        sample = parsed.sample;
      } catch {
        schema = schemaRun.stdout.slice(0, 500);
      }

      const history: Array<{ hypothesis: string; result: string }> = [];

      for (let i = 1; i <= maxIter; i++) {
        await this.saveStatus({
          sessionId, iteration: i, total: maxIter,
          message: ITER_MSG[i] || `Итерация ${i}...`, status: "running",
        });

        let plan;
        let tokens = 0;
        try {
          if (i === 1) {
            const r = await kimi.planAnalysis(question, schema, sample);
            plan = r.plan; tokens = r.tokens;
          } else {
            const r = await kimi.iterate(question, history, i, maxIter);
            plan = r.plan; tokens = r.tokens;
          }
          result.totalTokens += tokens;
        } catch (err) {
          console.error(`Kimi error iter ${i}:`, err);
          break;
        }

        let execResult;
        try {
          execResult = await e2b.runCode(sandboxId, plan.pythonCode);
        } catch (err) {
          execResult = { stdout: "", stderr: String(err), error: String(err), executionTime: 0 };
        }

        const output = execResult.error
          ? `ERROR: ${execResult.error}\nSTDERR: ${execResult.stderr}`
          : execResult.stdout || execResult.stderr || "(no output)";

        history.push({ hypothesis: plan.hypothesis, result: output });
        result.iterations.push({
          n: i, hypothesis: plan.hypothesis,
          output, executionTimeMs: execResult.executionTime,
        });

        for (let n = 1; n <= 5; n++) {
          try {
            const chart = await e2b.downloadFile(sandboxId, `/tmp/chart_${n}.png`);
            if (!result.charts.includes(chart)) result.charts.push(chart);
          } catch { break; }
        }
      }

      const allOutputs = result.iterations.map(it => `[Iter ${it.n}] ${it.output}`);
      result.summary = await kimi.finalSummary(question, allOutputs, language);
      result.durationMs = Date.now() - startTime;

      await this.saveStatus({
        sessionId, iteration: maxIter, total: maxIter,
        message: "Анализ завершён", status: "done", result,
      });

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      result.error = errMsg;
      result.durationMs = Date.now() - startTime;
      await this.saveStatus({
        sessionId, iteration: 0, total: maxIter,
        message: `Ошибка: ${errMsg}`, status: "error", result,
      });
    } finally {
      if (sandboxId) await e2b.closeSandbox(sandboxId);
    }
  }
}
