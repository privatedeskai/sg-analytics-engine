export interface KimiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface KimiResponse {
  content: string;
  iterations: number;
  pythonCode?: string;
}

export class KimiClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // DeepInfra (US серверы) — основной провайдер
    // Временно: Claude API как fallback пока нет баланса DeepInfra
    this.baseUrl = "https://api.anthropic.com/v1";
    this.model = "claude-sonnet-4-6";
  }

  async generatePython(
    dataDescription: string,
    question: string,
    previousResult?: string,
    iteration: number = 1
  ): Promise<string> {
    const systemPrompt = `You are a data analyst AI. Your job is to write Python code to analyze data and answer questions.
RULES:
- Write complete, runnable Python code
- Use only standard libraries: pandas, numpy, matplotlib, json, csv, io
- Always print results as JSON: print(json.dumps(result))
- For charts: save as 'chart.png' using matplotlib, then close plt
- Code must be self-contained
- The CSV data is available as a string in variable: csv_data (already defined before your code runs)
- Import pandas and read with: df = pd.read_csv(io.StringIO(csv_data))`;

    const userPrompt =
      iteration === 1
        ? `Data description: ${dataDescription}\n\nQuestion: ${question}\n\nWrite Python code to analyze this data and answer the question. Include statistical analysis and create a chart if relevant.`
        : `Previous iteration result:\n${previousResult}\n\nOriginal question: ${question}\n\nIteration ${iteration}: Improve the analysis. Look for deeper patterns, anomalies, or insights missed previously.`;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Kimi/Claude API error: ${response.status} — ${err}`);
    }

    const data = (await response.json()) as any;
    const text = data.content?.[0]?.text || "";

    // Извлекаем Python код из блока ```python ... ```
    const match = text.match(/```python\n([\s\S]*?)```/);
    return match ? match[1].trim() : text;
  }

  async generateFinalAnalysis(
    question: string,
    executionResults: string[],
    language: string = "en"
  ): Promise<string> {
    const systemPrompt =
      language === "ru"
        ? `Ты аналитик данных. На основе результатов Python-анализа дай конкретные выводы и рекомендации на русском языке. Будь конкретным: цифры, причины, действия. Формат: 2-3 абзаца без заголовков.`
        : `You are a data analyst. Based on Python analysis results, provide specific insights and recommendations in English. Be concrete: numbers, causes, actions. Format: 2-3 paragraphs without headers.`;

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Question: ${question}\n\nAnalysis results:\n${executionResults.slice(-3).join("\n---\n")}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Final analysis API error: ${response.status} — ${err}`);
    }

    const data = (await response.json()) as any;
    return data.content?.[0]?.text || "Analysis complete.";
  }

  // Переключение на DeepInfra после пополнения баланса:
  // 1. this.baseUrl = "https://api.deepinfra.com/v1/openai"
  // 2. this.model = "moonshotai/Kimi-K2-Instruct"
  // 3. Заменить headers на: { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json" }
  // 4. Изменить body.model на this.model
  // 5. Изменить KIMI_API_KEY secret на DeepInfra ключ
}
