// kimi.ts — Kimi K2.6 через gonka-openai TypeScript SDK
// TD-001: ЗАКРЫТ — DeepInfra заменён на Gonka SDK
// Instant mode: thinking disabled, temperature=0.6

import { GonkaOpenAI } from 'gonka-openai';

export interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface KimiResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface PlannerResult {
  hypothesis: string;
  python_code: string;
}

export interface EvaluatorResult {
  summary: string;
  enough: boolean;
  next_hypothesis?: string;
}

export interface FinalSummaryResult {
  summary: string;
  recommendations: string[];
  kpis: Record<string, string | number>;
}

function getClient(gonkaPrivateKey: string): GonkaOpenAI {
  return new GonkaOpenAI({
    gonkaPrivateKey,
    apiKey: 'mock-api-key',
  });
}

async function callKimi(
  client: GonkaOpenAI,
  messages: KimiMessage[],
  maxTokens: number = 2000
): Promise<KimiResponse> {
  const response = await client.chat.completions.create({
    model: 'kimi-k2',
    messages,
    max_tokens: maxTokens,
    temperature: 0.6,
    // Instant mode — no thinking parameter needed with gonka-openai SDK
  });

  const content = response.choices?.[0]?.message?.content ?? '';
  const usage = response.usage
    ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
      }
    : undefined;

  console.log(`[kimi] tokens: prompt=${usage?.prompt_tokens} completion=${usage?.completion_tokens} content_len=${content.length}`);

  return { content, usage };
}

// ── PLANNER+CODER ──────────────────────────────────────────────────────────────
// Принимает описание данных + предыдущие резюме, возвращает гипотезу и Python код

export async function runPlanner(
  gonkaPrivateKey: string,
  dataDescription: string,
  userQuestion: string,
  previousSummaries: string[],
  iteration: number
): Promise<PlannerResult> {
  const client = getClient(gonkaPrivateKey);

  const summariesBlock = previousSummaries.length > 0
    ? `\nПредыдущие итерации (краткие резюме):\n${previousSummaries.map((s, i) => `  [${i + 1}] ${s}`).join('\n')}`
    : '';

  const messages: KimiMessage[] = [
    {
      role: 'system',
      content: `Ты — аналитический агент. Твоя задача: написать Python код для анализа данных.
Отвечай СТРОГО в JSON формате без markdown, без пояснений:
{
  "hypothesis": "одно предложение — что именно проверяем",
  "python_code": "весь Python код одной строкой с \\n для переносов"
}

Правила для Python кода:
- Данные уже загружены как переменная df (pandas DataFrame)
- Используй только: pandas, numpy — они доступны
- Выводи результаты через print()
- Код должен быть самодостаточным и завершаться без ошибок
- НЕ читай файлы — df уже есть`,
    },
    {
      role: 'user',
      content: `Вопрос пользователя: ${userQuestion}

Описание данных:
${dataDescription}
${summariesBlock}

Итерация: ${iteration}
${iteration === 1 ? 'Начни с базовой статистики и структуры данных.' : 'Углубись в анализ на основе предыдущих резюме. Проверь новую гипотезу.'}

Напиши гипотезу и Python код для её проверки.`,
    },
  ];

  const result = await callKimi(client, messages, 2000);

  try {
    const clean = result.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      hypothesis: parsed.hypothesis ?? 'Анализ данных',
      python_code: parsed.python_code ?? 'print(df.describe())',
    };
  } catch (e) {
    console.error('[kimi] planner parse error:', e, 'raw:', result.content.slice(0, 200));
    // Fallback: извлечь код если JSON сломан
    return {
      hypothesis: `Итерация ${iteration}: базовый анализ`,
      python_code: 'print(df.head())\nprint(df.describe())\nprint(df.dtypes)',
    };
  }
}

// ── EVALUATOR ──────────────────────────────────────────────────────────────────
// Принимает вывод Python, решает достаточно ли данных для финального ответа

export async function runEvaluator(
  gonkaPrivateKey: string,
  userQuestion: string,
  executionOutput: string,
  previousSummaries: string[],
  iteration: number,
  maxIterations: number
): Promise<EvaluatorResult> {
  const client = getClient(gonkaPrivateKey);

  const messages: KimiMessage[] = [
    {
      role: 'system',
      content: `Ты — оценщик результатов анализа. Отвечай СТРОГО в JSON формате без markdown:
{
  "summary": "краткое резюме результата этой итерации, 20-40 слов",
  "enough": true или false,
  "next_hypothesis": "что проверить дальше (только если enough=false)"
}

enough=true если:
- Найден чёткий ответ на вопрос пользователя
- Выявлены конкретные паттерны/аномалии с числами
- Дальнейший анализ не даст новой информации`,
    },
    {
      role: 'user',
      content: `Вопрос пользователя: ${userQuestion}

Результат выполнения кода (итерация ${iteration}/${maxIterations}):
${executionOutput.slice(0, 2000)}

Предыдущие резюме:
${previousSummaries.map((s, i) => `[${i + 1}] ${s}`).join('\n') || 'нет'}

Оцени: достаточно ли данных для ответа пользователю?`,
    },
  ];

  const result = await callKimi(client, messages, 800);

  try {
    const clean = result.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      summary: parsed.summary ?? `Итерация ${iteration} завершена`,
      enough: parsed.enough === true,
      next_hypothesis: parsed.next_hypothesis,
    };
  } catch (e) {
    console.error('[kimi] evaluator parse error:', e);
    return {
      summary: `Итерация ${iteration}: данные получены`,
      enough: iteration >= maxIterations - 1,
    };
  }
}

// ── FINAL SUMMARY ──────────────────────────────────────────────────────────────
// Финальный отчёт на основе всех резюме итераций

export async function runFinalSummary(
  gonkaPrivateKey: string,
  userQuestion: string,
  allSummaries: string[],
  allOutputs: string[]
): Promise<FinalSummaryResult> {
  const client = getClient(gonkaPrivateKey);

  const combinedOutputs = allOutputs
    .map((o, i) => `[Итерация ${i + 1}]\n${o.slice(0, 500)}`)
    .join('\n\n');

  const messages: KimiMessage[] = [
    {
      role: 'system',
      content: `Ты — аналитик данных. Сформируй финальный отчёт по результатам анализа.
Отвечай СТРОГО в JSON формате без markdown:
{
  "summary": "связный текст 3-5 предложений с выводами и объяснением причин",
  "recommendations": ["рекомендация 1", "рекомендация 2", "рекомендация 3"],
  "kpis": {
    "ключевая метрика": "значение",
    "ещё метрика": "значение"
  }
}

Правила:
- Отвечай конкретно на вопрос пользователя
- Называй конкретные числа из данных
- Рекомендации — действия, не наблюдения
- KPIs — самые важные цифры из анализа (3-5 штук)`,
    },
    {
      role: 'user',
      content: `Вопрос пользователя: ${userQuestion}

Резюме итераций:
${allSummaries.map((s, i) => `[${i + 1}] ${s}`).join('\n')}

Сырые данные из анализа:
${combinedOutputs.slice(0, 3000)}

Сформируй финальный отчёт.`,
    },
  ];

  const result = await callKimi(client, messages, 1500);

  try {
    const clean = result.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      summary: parsed.summary ?? 'Анализ завершён.',
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      kpis: typeof parsed.kpis === 'object' ? parsed.kpis : {},
    };
  } catch (e) {
    console.error('[kimi] final summary parse error:', e);
    return {
      summary: allSummaries.join(' '),
      recommendations: ['Проверьте данные вручную'],
      kpis: {},
    };
  }
}
