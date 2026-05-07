import { AnalysisOrchestrator } from './orchestrator';

export { AnalysisOrchestrator };

export interface Env {
  CLAUDE_API_KEY: string;
  DEEPINFRA_API_KEY: string;
  E2B_API_KEY: string;
  GONKA_PRIVATE_KEY: string;
  GONKA_ADDRESS: string;
  KV: KVNamespace;
  ORCHESTRATOR: DurableObjectNamespace;
  MAX_ITERATIONS: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json({
        status: 'ok',
        version: '0.9.0',
        session: 9,
        timestamp: new Date().toISOString(),
        components: {
          worker: true,
          kv: true,
          orchestrator: 'AnalysisOrchestrator',
          execution: 'judge0-ce',
          ai: 'kimi-k2-gonka',
        },
        routes: ['/status', '/analyze', '/result/:sessionId'],
      }, { headers: corsHeaders });
    }

    if (request.method === 'POST' && url.pathname === '/analyze') {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders });
      }

      const { question, data, csvContent, sessionId: existingSession, userId = 'anon' } = body;

      if (!question) {
        return Response.json({ error: 'Missing required field: question' }, { status: 400, headers: corsHeaders });
      }

      const sessionId = existingSession || crypto.randomUUID();
      const maxIterations = parseInt(env.MAX_ITERATIONS || '10');

      await env.KV.put(`session:${sessionId}`, JSON.stringify({
        sessionId,
        status: 'started',
        iteration: 0,
        total: maxIterations,
        message: 'Initializing analysis...',
        startedAt: new Date().toISOString(),
        question,
      }), { expirationTtl: 86400 });

      const id = env.ORCHESTRATOR.idFromName(sessionId);
      const orchestrator = env.ORCHESTRATOR.get(id);

      const orchestratorRequest = new Request('https://internal/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question,
          csvData: csvContent || data || '',
          fileName: body.fileName || 'data.csv',
          userId,
          maxIterations,
        }),
      });

      ctx.waitUntil(orchestrator.fetch(orchestratorRequest).catch((err) => {
        return env.KV.put(`session:${sessionId}`, JSON.stringify({
          sessionId,
          status: 'error',
          message: 'Orchestrator failed: ' + String(err),
          error: String(err),
        }), { expirationTtl: 86400 });
      }));

      return Response.json({
        sessionId,
        status: 'started',
        message: 'Analysis started. Poll /result/' + sessionId + ' for updates.',
      }, { headers: corsHeaders });
    }

    if (request.method === 'GET' && url.pathname.startsWith('/result/')) {
      const sessionId = url.pathname.replace('/result/', '').split('?')[0];
      if (!sessionId) {
        return Response.json({ error: 'Missing sessionId' }, { status: 400, headers: corsHeaders });
      }

      const raw = await env.KV.get(`session:${sessionId}`);
      if (!raw) {
        return Response.json({ error: 'Session not found', sessionId }, { status: 404, headers: corsHeaders });
      }

      try {
        const sessionData = JSON.parse(raw);
        return Response.json(sessionData, { headers: corsHeaders });
      } catch {
        return Response.json({ error: 'Malformed session data', sessionId }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({
      error: 'Not found',
      available_routes: ['GET /status', 'POST /analyze', 'GET /result/:sessionId'],
    }, { status: 404, headers: corsHeaders });
  },
};
