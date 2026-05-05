import { AnalysisOrchestrator } from "./orchestrator";

export { AnalysisOrchestrator };

export interface Env {
  ORCHESTRATOR: DurableObjectNamespace;
  KV: KVNamespace;
  E2B_API_KEY: string;
  DEEPINFRA_API_KEY: string;
  CLAUDE_API_KEY: string;
  MAX_ITERATIONS: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsJson(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: CORS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return corsJson({ ok: true, version: "1.0.0", timestamp: Date.now() });
    }

    if (url.pathname === "/analyze" && request.method === "POST") {
      try {
        const body = await request.json() as {
          question?: string;
          csvContent?: string;
          userId?: string;
          maxIterations?: number;
          language?: "ru" | "en";
        };

        if (!body.question || !body.csvContent) {
          return corsJson({ error: "Missing required fields: question, csvContent" }, 400);
        }

        const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const userId = body.userId || "anonymous";

        const doId = env.ORCHESTRATOR.idFromName(userId);
        const stub = env.ORCHESTRATOR.get(doId);

        const doResp = await stub.fetch(new Request("https://do/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            question: body.question,
            csvContent: body.csvContent,
            userId,
            maxIterations: body.maxIterations || parseInt(env.MAX_ITERATIONS),
            language: body.language || "ru",
          }),
        }));

        return corsJson(await doResp.json());

      } catch (err) {
        return corsJson({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    if (url.pathname === "/status" && request.method === "GET") {
      try {
        const sessionId = url.searchParams.get("sessionId");
        const userId = url.searchParams.get("userId") || "anonymous";
        if (!sessionId) return corsJson({ error: "Missing sessionId" }, 400);

        const doId = env.ORCHESTRATOR.idFromName(userId);
        const stub = env.ORCHESTRATOR.get(doId);

        const doResp = await stub.fetch(
          new Request(`https://do/status?sessionId=${sessionId}`)
        );
        return corsJson(await doResp.json());

      } catch (err) {
        return corsJson({ error: err instanceof Error ? err.message : String(err) }, 500);
      }
    }

    return corsJson({ error: "Not found" }, 404);
  },
};
