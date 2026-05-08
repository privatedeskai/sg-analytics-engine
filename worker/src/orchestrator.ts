import { KimiClient } from './kimi';
import { E2BClient } from './e2b';
import { CSVConnector } from './connectors/csv';
import { OutputFormatter } from './output';

const MAX_ITERATIONS = 10;
// Потолок ожидания — страховка от зависания, не жёсткий таймаут
const KIMI_CEILING_MS = 60000;
const JUDGE0_CEILING_MS = 12000;

export interface Env {
  KV: KVNamespace;
  GONKA_PRIVATE_KEY: string;
  GONKA_ADDRESS: string;
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
    metrics: unknown[];
    charts: unknown[];
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

function getProgressMessage(iteration: number, max: number): string {
  const pct = Math.round((iteration / max) * 100);
  if (iteration <= 2) return 'Loading data, checking structure... ' + pct + '%';
  if (iteration <= 4) return 'Grouping by periods, searching anomalies... ' + pct + '%';
  if (iteration <= 7) return 'Testing hypotheses... ' + pct + '%';
  return 'Forming conclusions... ' + pct + '%';
}

function withCeiling<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Ceiling reached: ' + label + ' (' + ms + 'ms)')), ms)
    ),
  ]);
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
    if (request.method === 'POST' && url.pathname === '/start') {
      return this.handleStart(request);
    }
    return new Response('Not found', { status: 404 });
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json() as {
      sessionId: string; csvData?: unknown; csvContent?: unknown;
      fileName?: string; question?: string; maxIterations?: number;
    };
    const sessionId = String(body.sessionId || '');
    const csvRaw = String(body.csvData || body.csvContent || '');
    const fileName = String(body.fileName || 'data.csv');
    const question = String(body.question || '');
    const maxIter = Number(body.maxIterations) || parseInt(this.env.MAX_ITERATIONS ?? String(MAX_ITERATIONS), 10);

    console.log('[orchestrator] start sessionId=' + sessionId + ' question=' + question.slice(0, 50));

    const initialState: SessionState = {
      status: 'running', iteration: 0, maxIterations: maxIter,
      summaries: [], outputs: [], progressMessage: 'Initializing...',
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    await this.saveSession(sessionId, initialState);
    this.state.waitUntil(this.runAnalysis(sessionId, csvRaw, fileName, question, maxIter));
    return new Response(JSON.stringify({ ok: true, sessionId }), { headers: { 'Content-Type': 'application/json' } });
  }

  private async runAnalysis(
    sessionId: string, csvRaw: string, fileName: string, question: string, maxIter: number
  ): Promise<void> {
    const kimi = new KimiClient(this.env.GONKA_PRIVATE_KEY, this.env.GONKA_ADDRESS);
    const formatter = new OutputFormatter();
    try {
      const connector = new CSVConnector();
      const normalized = connector.parse(csvRaw, fileName);
      const description = normalized.description;
      const e2b = new E2BClient('');
      const sandboxId = await e2b.createSandbox();
      await e2b.uploadCSV(sandboxId, normalized.csvString);

      const summaries: string[] = [];
      const outputs: string[] = [];

      for (let i = 1; i <= maxIter; i++) {
        console.log('[orchestrator] iteration ' + i + '/' + maxIter);
        await this.updateSession(sessionId, {
          iteration: i, progressMessage: getProgressMessage(i, maxIter), summaries, outputs,
        });

        // Kimi — потолок как страховка
        let iterResult;
        try {
          iterResult = await withCeiling(
            kimi.generateIteration(description, question, summaries, i, maxIter),
            KIMI_CEILING_MS, 'kimi'
          );
        } catch (e) {
          console.error('[orchestrator] kimi error iter ' + i + ': ' + String(e));
          summaries.push('Iteration ' + i + ': kimi error');
          continue;
        }

        // Judge0 — polling внутри e2b.ts, потолок как страховка
        let execOutput = '';
        try {
          const execResult = await withCeiling(
            e2b.runCode(sandboxId, iterResult.python),
            JUDGE0_CEILING_MS, 'judge0'
          );
          execOutput = execResult.stdout || execResult.stderr || '';
          console.log('[orchestrator] exec time=' + execResult.executionTime + 'ms output=' + execOutput.slice(0, 100));
        } catch (e) {
          execOutput = 'Execution error: ' + String(e).slice(0, 200);
        }

        outputs.push(execOutput);
        summaries.push(iterResult.summary);
        console.log('[orchestrator] enough=' + iterResult.enough + ' summary=' + iterResult.summary);
        if (iterResult.enough) { console.log('[orchestrator] early exit at ' + i); break; }
      }

      await this.updateSession(sessionId, { progressMessage: 'Forming final report...', summaries, outputs });

      let finalSummary = '';
      try {
        finalSummary = await withCeiling(
          kimi.generateFinalAnalysis(question, summaries),
          KIMI_CEILING_MS, 'final'
        );
      } catch (e) {
        finalSummary = summaries.join(' ');
      }

      const { metrics, charts } = formatter.parseExecutionResult(outputs.join('\n'));
      const finalState = await this.loadSession(sessionId);
      await this.saveSession(sessionId, {
        ...finalState!, status: 'completed', iteration: summaries.length,
        summaries, outputs, progressMessage: 'Analysis completed',
        result: { summary: finalSummary, metrics, charts }, updatedAt: Date.now(),
      });
      console.log('[orchestrator] completed sessionId=' + sessionId);

    } catch (e) {
      console.error('[orchestrator] fatal: ' + String(e));
      const state = await this.loadSession(sessionId);
      await this.saveSession(sessionId, {
        ...state!, status: 'error', error: String(e).slice(0, 500),
        progressMessage: 'Error', updatedAt: Date.now(),
      });
    }
  }

  private async loadSession(sessionId: string): Promise<SessionState | null> {
    const raw = await this.env.KV.get('session:' + sessionId);
    if (!raw) return null;
    try { return JSON.parse(raw) as SessionState; } catch { return null; }
  }

  private async saveSession(sessionId: string, state: SessionState): Promise<void> {
    await this.env.KV.put('session:' + sessionId, JSON.stringify(state), { expirationTtl: 86400 });
  }

  private async updateSession(sessionId: string, patch: Partial<SessionState>): Promise<void> {
    const state = await this.loadSession(sessionId);
    if (!state) return;
    await this.saveSession(sessionId, { ...state, ...patch, updatedAt: Date.now() });
  }
}
