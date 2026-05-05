import { AnalysisOrchestrator } from './orchestrator';

export interface Env {
  ORCHESTRATOR: DurableObjectNamespace;
  KV: KVNamespace;
  CLAUDE_API_KEY: string;
  KIMI_API_KEY: string;
  E2B_API_KEY: string;
  MAX_ITERATIONS: string;
}

export { AnalysisOrchestrator };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    // POST /analyze — запуск анализа
    if (request.method === 'POST' && url.pathname === '/analyze') {
      try {
        const body: any = await request.json();
        const { question, csvContent, userId, language } = body;

        if (!question || !csvContent || !userId) {
          return new Response(JSON.stringify({ error: 'Missing required fields: question, csvContent, userId' }), {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' },
          });
        }

        const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Сохранить начальный статус в KV
        await env.KV.put(`session:${sessionId}`, JSON.stringify({
          status: 'processing',
          question,
          userId,
          language: language || 'en',
          startedAt: Date.now(),
        }), { expirationTtl: 3600 });

        // Запустить Durable Object
        const id = env.ORCHESTRATOR.idFromName(sessionId);
        const stub = env.ORCHESTRATOR.get(id);

        // Запускаем анализ асинхронно
        const analyzeRequest = new Request('https://internal/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, question, csvContent, userId, language: language || 'en' }),
        });

        // Не ждём завершения — возвращаем sessionId сразу
        stub.fetch(analyzeRequest).then(async (res) => {
          const result = await res.json() as any;
          await env.KV.put(`session:${sessionId}`, JSON.stringify({
            status: 'completed',
            question,
            userId,
            language: language || 'en',
            result,
            completedAt: Date.now(),
          }), { expirationTtl: 86400 });
        }).catch(async (err) => {
          await env.KV.put(`session:${sessionId}`, JSON.stringify({
            status: 'error',
            error: err.message,
          }), { expirationTtl: 3600 });
        });

        return new Response(JSON.stringify({ sessionId, status: 'started' }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });

      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /status/:sessionId — получить результат
    if (request.method === 'GET' && url.pathname.startsWith('/status/')) {
      const sessionId = url.pathname.replace('/status/', '');

      const raw = await env.KV.get(`session:${sessionId}`);
      if (!raw) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      return new Response(raw, {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // GET /health
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
