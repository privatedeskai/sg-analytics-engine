import { createGonkaSignature } from './gonka-signature';

export interface PlannerResult {
  hypothesis: string;
  python_code: string;
}

export interface EvaluatorResult {
  summary: string;
  enough: boolean;
}

export interface FinalSummaryResult {
  summary: string;
  recommendations: string[];
  kpis: Record<string, string | number>;
}

const GONKA_NODES = [
  'http://node1.gonka.ai:8000',
  'http://node2.gonka.ai:8000',
  'http://node3.gonka.ai:8000',
];

const MODEL = 'moonshotai/Kimi-K2-Instruct';

async function getActiveNode(): Promise<{ url: string; providerAddress: string }> {
  for (const node of GONKA_NODES) {
    try {
      const resp = await fetch(`${node}/v1/epochs/current/participants`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) continue;
      const participants = await resp.json() as Array<{
        inference_url?: string;
        index?: string;
      }>;
      if (!Array.isArray(participants) || participants.length === 0) continue;
      const active = participants.filter(p => p.inference_url);
      if (active.length === 0) continue;
      const chosen = active[Math.floor(Math.random() * active.length)];
      return {
        url: chosen.inference_url!,
        providerAddress: chosen.index ?? '',
      };
    } catch {
      continue;
    }
  }
  throw new Error('No active Gonka nodes found');
}

async function callKimi(
  privateKeyHex: string,
  gonkaAddress: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 2000
): Promise<string> {
  const { url: nodeUrl, providerAddress } = await getActiveNode();
  const targetUrl = `${nodeUrl}/v1/chat/completions`;
  const requestBody = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.6,
    stream: false,
  };
  const timestampNs = BigInt(Date.now()) * 1_000_000n;
  const signature = await createGonkaSignature(privateKeyHex, requestBody, timestampNs, providerAddress);
  const resp = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': signature,
      'X-Requester-Address': gonkaAddress,
      'X-Requester-Timestamp': timestampNs.toString(),
    },
    body: JSON.stringify(requestBody),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gonka API error ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = await resp.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  console.log(`[kimi] tokens: prompt=${data.usage?.prompt_tokens} completion=${data.usage?.completion_tokens} content_len=${content.length}`);
  return content;
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(clean) as T;
  } catch {
    console.error('[kimi] JSON parse error, raw:', raw.slice(0, 200));
    return fallback;
  }
}

export async function runPlanner(
  privateKeyHex: string,
  gonkaAddress: string,
  dataDescription: string,
  userQuestion: string,
  previousSummaries: string[],
  iteration: number
): Promise<PlannerResult> {
  const summariesBlock = previousSummaries.length > 0
    ? `\nПредыдущие итерации:\n${previousSummaries.map((s, i) => `  [${i + 1}] ${s}`).join('\n')}`
    : '';
  const system = `Ты — аналитический агент. Пиши Python код для анализа данных.
Отвечай СТРОГО в JSON без markdown:
{"hypothesis": "одно предложение что проверяем", "python_code": "весь код строкой с \\n"}
Правила кода:
- df (pandas DataFrame) уже загружен
- CSV_DATA (строка) уже доступна
- Используй только pandas, numpy
- Выводи через print()
- Не читай файлы`;
  const user = `Вопрос: ${userQuestion}
Данные: ${dataDescription}${summariesBlock}
Итерация: ${iteration}
${iteration === 1 ? 'Начни с базовой статистики.' : 'Углубись, проверь новую гипотезу.'}`;
  const raw = await callKimi(privateKeyHex, gonkaAddress, system, user, 2000);
  return parseJSON<PlannerResult>(raw, {
    hypothesis: `Итерация ${iteration}: базовый анализ`,
    python_code: 'print(df.head())\nprint(df.describe())',
  });
}

export async function runEvaluator(
  privateKeyHex: string,
  gonkaAddress: string,
  userQuestion: string,
  executionOutput: string,
  previousSummaries: string[],
  iteration: number,
  maxIterations: number
): Promise<EvaluatorResult> {
  const system = `Ты — оценщик анализа. Отвечай СТРОГО в JSON без markdown:
{"summary": "резюме 20-40 слов", "enough": true или false}
enough=true если найден чёткий ответ с конкретными числами.`;
  const user = `Вопрос: ${userQuestion}
Результат итерации ${iteration}/${maxIterations}:
${executionOutput.slice(0, 2000)}
Предыдущие резюме:
${previousSummaries.map((s, i) => `[${i + 1}] ${s}`).join('\n') || 'нет'}`;
  const raw = await callKimi(privateKeyHex, gonkaAddress, system, user, 800);
  return parseJSON<EvaluatorResult>(raw, {
    summary: `Итерация ${iteration}: данные получены`,
    enough: iteration >= maxIterations - 1,
  });
}

export async function runFinalSummary(
  privateKeyHex: string,
  gonkaAddress: string,
  userQuestion: string,
  allSummaries: string[],
  allOutputs: string[]
): Promise<FinalSummaryResult> {
  const system = `Ты — аналитик данных. Сформируй финальный отчёт.
Отвечай СТРОГО в JSON без markdown:
{"summary": "3-5 предложений с выводами", "recommendations": ["действие 1", "действие 2", "действие 3"], "kpis": {"метрика": "значение"}}`;
  const user = `Вопрос: ${userQuestion}
Резюме итераций:
${allSummaries.map((s, i) => `[${i + 1}] ${s}`).join('\n')}
Данные из анализа:
${allOutputs.map((o, i) => `[${i + 1}]\n${o.slice(0, 500)}`).join('\n\n').slice(0, 3000)}`;
  const raw = await callKimi(privateKeyHex, gonkaAddress, system, user, 1500);
  return parseJSON<FinalSummaryResult>(raw, {
    summary: allSummaries.join(' '),
    recommendations: ['Проверьте данные вручную'],
    kpis: {},
  });
}
