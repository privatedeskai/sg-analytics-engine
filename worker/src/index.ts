import { Orchestrator } from './orchestrator';

export { Orchestrator };

export interface Env {
  CLAUDE_API_KEY: string;
  DEEPINFRA_API_KEY: string;
  E2B_API_KEY: string;
  ANALYTICS_KV: KVNamespace;
  ORCHESTRATOR: DurableObjectNamespace;
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

    // GET /status — проверка состояния worker
    if (request.method === 'GET' && url.pathname === '/status') {
      return Response.json({
        status: 'ok',
        version: '0.5.0',
        session: 5,
        timestamp: new Date().toISOString(),
        components: {
          worker: true,
          kv: true,
          orchestrator: true,
          e2b: 'piston-api',
          ai: 'claude-api-temp',
        },
        routes: ['/status', '/analyze', '/result/:sessionId'],
      }, { headers: corsHeaders });
    }

    // POST /analyze — запуск анализа
    if (request.method === 'POST' && url.pathname === '/analyze') {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: corsHeaders });
      }

      const { question, data, sessionId: existingSession } = body;

      if (!question) {
        return Response.json({ error: 'Missing required field: question' }, { status: 400, headers: corsHeaders });
      }

      const sessionId = existingSession || crypto.randomUUID();

      // Роутим в Durable Object Orchestrator
      const id = env.ORCHESTRATOR.idFromName(sessionId);
      const orchestrator = env.ORCHESTRATOR.get(id);

      const orchestratorRequest = new Request('https://internal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, data, sessionId, env: {
          CLAUDE_API_KEY: env.CLAUDE_API_KEY,
          DEEPINFRA_API_KEY: env.DEEPINFRA_API_KEY,
          E2B_API_KEY: env.E2B_API_KEY,
        }}),
      });

      // Запускаем асинхронно, возвращаем sessionId сразу
      orchestrator.fetch(orchestratorRequest).catch(() => {});

      return Response.json({
        sessionId,
        status: 'started',
        message: 'Analysis started. Poll /result/' + sessionId + ' for updates.',
      }, { headers: corsHeaders });
    }

    // GET /result/:sessionId — получение результата
    if (request.method === 'GET' && url.pathname.startsWith('/result/')) {
      const sessionId = url.pathname.replace('/result/', '');
      if (!sessionId) {
        return Response.json({ error: 'Missing sessionId' }, { status: 400, headers: corsHeaders });
      }

      const result = await env.ANALYTICS_KV.get(`result:${sessionId}`);
      const statusVal = await env.ANALYTICS_KV.get(`status:${sessionId}`);

      if (!result && !statusVal) {
        return Response.json({ error: 'Session not found', sessionId }, { status: 404, headers: corsHeaders });
      }

      return Response.json({
        sessionId,
        status: statusVal || 'unknown',
        result: result ? JSON.parse(result) : null,
      }, { headers: corsHeaders });
    }

    // 404
    return Response.json({
      error: 'Not found',
      available_routes: ['GET /status', 'POST /analyze', 'GET /result/:sessionId'],
    }, { status: 404, headers: corsHeaders });
  },
};
