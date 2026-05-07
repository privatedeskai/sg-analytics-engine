// orchestrator.ts — AnalysisOrchestrator Durable Object
// Алгоритм Вариант 2: резюме между итерациями + ранний выход по enough=true
// TODO_TEMP TD-003: таймауты — оценить после 3 успешных тестов

import { runPlanner, runEvaluator, runFinalSummary } from './kimi';
import { E2BClient } from './e2b';
import { CSVConnector } from './connectors/csv';
import { OutputFormatter, AnalysisOutput } from './output';

const MAX_ITERATIONS = 10;
const KIMI_TIMEOUT_MS = 30000; // TODO_TEMP TD-003
const JUDGE0_TIMEOUT_MS = 15000; // TODO_TEMP TD-003

export interface Env {
  KV: KVNamespace;
  GONKA_PRIVATE_KEY: string;
  CLAUDE_API_KEY: string;
  MAX_ITERATIONS?: string;
}

interface SessionState {
  status: 'pending' | 'running' | 'completed' | 'error';
  iteration: number;
  maxIterations: number;
  summaries: string[];
  outputs: string[];
  progressMessage: string;
  result?: {
    summary: string;
    recommendations: string[];
    kpis: Record<string, string | number>;
    metrics: any[];
    charts: any[];
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

function progressMessage(iteration: number, max: number): string {
  const pct = Math.round((iteration / max) * 100);
  if (iteration <= 2) return `Загружаю данные, проверяю структуру... ${pct}%`;
  if (iteration <= 4) return `Группирую по периодам, ищу аномалии... ${pct}%`;
  if (iteration <= 7) return `Проверяю гипотезу по категориям... ${pct}%`;
  return `Формирую выводы и рекомендацию... ${pct}%`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms)
  );
  return Promise.race([promise, timeout]);
}

export class AnalysisOrchestrator {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST' && path === '/start') {
      return this.handleStart(request);
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json() as {
      sessionId: string;
      csvData: string;
      fileName: string;
      question: string;
    };

    const { sessionId, csvData, fileName, question } = body;
    const maxIter = parseInt(this.env.MAX_ITERATIONS ?? String(MAX_ITERATIONS), 10);

    const initialState: SessionState = {
      status: 'running',
      iteration: 0,
      maxIterations: maxIter,
      summaries: [],
      outputs: [],
      progressMessage: 'Инициализация анализа...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.saveSession(sessionId, initialState);

    this.state.waitUntil(this.runAnalysis(sessionId, csvData, fileName, question, maxIter));

    return new Response(JSON.stringify({ ok: true, sessionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async runAnalysis(
    sessionId: string,
    csvData: string,
    fileName: string,
    question: string,
    maxIter: number
  ): Promise<void> {
    const gonkaKey = this.env.GONKA_PRIVATE_KEY;
    const formatter = new OutputFormatter();

    try {
      // Парсим CSV
      const connector = new CSVConnector();
      const normalized = connector.parse(csvData, fileName);
      const description = normalized.description;

      // Инициализируем E2B клиент (Judge0 CE)
      const e2b = new E2BClient('');
      const sandboxId = await e2b.createSandbox();
      await e2b.uploadCSV(sandboxId, normalized.csvString);

      const summaries: string[] = [];
      const outputs: string[] = [];

      for (let i = 1; i <= maxIter; i++) {
        console.log(`[orchestrator] iteration ${i}/${maxIter}`);

        await this.updateSession(sessionId, {
          iteration: i,
          progressMessage: progressMessage(i, maxIter),
          summaries,
          outputs,
        });

        // 1. Planner: гипотеза + Python код
        let plannerResult;
        try {
          plannerResult = await withTimeout(
            runPlanner(gonkaKey, description, question, summaries, i),
            KIMI_TIMEOUT_MS,
            'planner'
          );
        } catch (e) {
          console.error(`[orchestrator] planner timeout/error iter ${i}:`, e);
          summaries.push(`Итерация ${i}: ошибка планировщика`);
          continue;
        }

        console.log(`[orchestrator] hypothesis: ${plannerResult.hypothesis}`);

        // 2. Execute Python через Judge0
        let execOutput = '';
        try {
          const execResult = await withTimeout(
            e2b.runCode(sandboxId, plannerResult.python_code),
            JUDGE0_TIMEOUT_MS,
            'judge0'
          );
          execOutput = execResult.stdout || execResult.stderr || '';
          if (execResult.error) {
            console.error(`[orchestrator] exec error iter ${i}:`, execResult.error);
          }
        } catch (e) {
          console.error(`[orchestrator] exec timeout iter ${i}:`, e);
          execOutput = `Ошибка выполнения: ${String(e).slice(0, 200)}`;
        }

        outputs.push(execOutput);

        // 3. Evaluator: резюме + сигнал enough
        let evalResult;
        try {
          evalResult = await withTimeout(
            runEvaluator(gonkaKey, question, execOutput, summaries, i, maxIter),
            KIMI_TIMEOUT_MS,
            'evaluator'
          );
        } catch (e) {
          console.error(`[orchestrator] evaluator timeout/error iter ${i}:`, e);
          summaries.push(`Итерация ${i}: данные получены`);
          continue;
        }

        summaries.push(evalResult.summary);
        console.log(`[orchestrator] enough=${evalResult.enough} summary="${evalResult.summary}"`);

        if (evalResult.enough) {
          console.log(`[orchestrator] early exit at iteration ${i}`);
          break;
        }
      }

      // 4. Финальный summary
      await this.updateSession(sessionId, {
        progressMessage: 'Формирую финальный отчёт...',
        summaries,
        outputs,
      });

      let finalResult;
      try {
        finalResult = await withTimeout(
          runFinalSummary(gonkaKey, question, summaries, outputs),
          KIMI_TIMEOUT_MS,
          'final-summary'
        );
      } catch (e) {
        console.error('[orchestrator] final summary error:', e);
        finalResult = {
          summary: summaries.join(' '),
          recommendations: ['Проверьте данные вручную'],
          kpis: {},
        };
      }

      // 5. Парсим метрики и графики из outputs
      const allOutputText = outputs.join('\n');
      const { metrics, charts } = formatter.parseExecutionResult(allOutputText);

      // 6. Сохраняем финальный результат
      const finalState = await this.loadSession(sessionId);
      await this.saveSession(sessionId, {
        ...finalState!,
        status: 'completed',
        iteration: summaries.length,
        summaries,
        outputs,
        progressMessage: 'Анализ завершён',
        result: {
          summary: finalResult.summary,
          recommendations: finalResult.recommendations,
          kpis: finalResult.kpis,
          metrics,
          charts,
        },
        updatedAt: Date.now(),
      });

      console.log(`[orchestrator] session ${sessionId} completed`);
    } catch (e) {
      console.error('[orchestrator] fatal error:', e);
      const state = await this.loadSession(sessionId);
      await this.saveSession(sessionId, {
        ...state!,
        status: 'error',
        error: String(e).slice(0, 500),
        progressMessage: 'Ошибка анализа',
        updatedAt: Date.now(),
      });
    }
  }

  private async loadSession(sessionId: string): Promise<SessionState | null> {
    const raw = await this.env.KV.get(`session:${sessionId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionState;
    } catch {
      return null;
    }
  }

  private async saveSession(sessionId: string, state: SessionState): Promise<void> {
    await this.env.KV.put(`session:${sessionId}`, JSON.stringify(state), {
      expirationTtl: 60 * 60 * 24,
    });
  }

  private async updateSession(
    sessionId: string,
    patch: Partial<SessionState>
  ): Promise<void> {
    const state = await this.loadSession(sessionId);
    if (!state) return;
    await this.saveSession(sessionId, {
      ...state,
      ...patch,
      updatedAt: Date.now(),
    });
  }
}
