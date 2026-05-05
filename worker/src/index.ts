import { AnalysisOrchestrator } from './orchestrator';

export { AnalysisOrchestrator };

export interface Env {
  CLAUDE_API_KEY: string;
  DEEPINFRA_API_KEY: string;
  E2B_API_KEY: string;
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
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // GET /status
    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json({
        status: 'ok',
        version: '0.5.0',
        session: 5,
        timestamp: new Date().toISOString(),
        components: {
          worker: true,
          kv: true,
          orchestrator: 'AnalysisOrchestrator',
          e2b: 'piston-api',
          ai: 'claude-api-temp',
        },
        routes: ['/status', '/analyze', '/result/:sessionId'],
      }, { headers: corsHeaders });
    }

    // POST /analyze
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
      const maxIterations = parseInt(env.MAX_ITERATIONS || '3');

      const id = env.ORCHESTRATOR.idFromName(sessionId);
      const orchestrator = env.ORCHESTRATOR.get(id);

      const orchestratorRequest = new Request('https://internal/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question,
          csvContent: csvContent || data || '',
          userId,
          maxIterations,
          language: 'en',
        }),
      });

      orchestrator.fetch(orchestratorRequest).catch(() => {});

      return Response.json({
        sessionId,
        status: 'started',
        message: 'Analysis started. Poll /result/' + sessionId + ' for updates.',
      }, { headers: corsHeaders });
    }

    // GET /result/:sessionId
    if (request.method === 'GET' && url.pathname.startsWith('/result/')) {
      const sessionId = url.pathname.replace('/result/', '').split('?')[0];
      if (!sessionId) {
        return Response.json({ error: 'Missing sessionId' }, { status: 400, headers: corsHeaders });
      }

      const id = env.ORCHESTRATOR.idFromName(sessionId);
      const orchestrator = env.ORCHESTRATOR.get(id);

      const statusRequest = new Request('https://internal/status?sessionId=' + sessionId, {
        method: 'GET',
      });

      try {
        const statusResponse = await orchestrator.fetch(statusRequest);
        const statusData = await statusResponse.json();
        return Response.json(statusData, { headers: corsHeaders });
      } catch {
        return Response.json({ error: 'Session not found', sessionId }, { status: 404, headers: corsHeaders });
      }
    }

    return Response.json({
      error: 'Not found',
      available_routes: ['GET /status', 'POST /analyze', 'GET /result/:sessionId'],
    }, { status: 404, headers: corsHeaders });
  },
};
