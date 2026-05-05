export interface KimiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AnalysisPlan {
  pythonCode: string;
  hypothesis: string;
  expectedOutput: string;
}

const SYSTEM_ANALYST = `You are an expert data analyst. Write Python code to analyze CSV data.
Respond ONLY with a valid JSON object вЂ” no markdown fences, no text outside JSON:
{"pythonCode": "...", "hypothesis": "...", "expectedOutput": "..."}

Python rules:
- Data is always at /tmp/data.csv
- pandas, numpy, matplotlib, scipy are pre-installed
- Save charts: plt.savefig('/tmp/chart_N.png', dpi=100, bbox_inches='tight') then plt.close()
- Print ALL results as JSON: import json; print(json.dumps({"key": value}))
- Handle NaN, empty columns, wrong types gracefully
- Never invent numbers вЂ” compute everything from data`;

export class KimiClient {
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1";
  private model = "claude-sonnet-4-20250514";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete(
    messages: KimiMessage[],
    maxTokens = 4096
  ): Promise<{ content: string; tokens: number }> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        x-api-key": this.apiKey, "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Kimi API failed: ${response.status} вЂ” ${err}`);
    }
    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: data.choices[0].message.content,
      tokens: data.usage.prompt_tokens + data.usage.completion_tokens,
    };
  }

  private parseJSON(raw: string): AnalysisPlan {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`No JSON in Kimi response: ${raw.slice(0, 300)}`);
    return JSON.parse(match[0]) as AnalysisPlan;
  }

  async planAnalysis(
    question: string,
    schema: string,
    sample: string
  ): Promise<{ plan: AnalysisPlan; tokens: number }> {
    const resp = await this.complete([
      { role: "system", content: SYSTEM_ANALYST },
      {
        role: "user",
        content: `User question: "${question}"\n\nData schema:\n${schema}\n\nSample (first 5 rows):\n${sample}\n\nReturn JSON only.`,
      },
    ]);
    return { plan: this.parseJSON(resp.content), tokens: resp.tokens };
  }

  async iterate(
    question: string,
    history: Array<{ hypothesis: string; result: string }>,
    iteration: number,
    maxIterations: number
  ): Promise<{ plan: AnalysisPlan; tokens: number }> {
    const isFinal = iteration >= maxIterations - 1;
    const historyText = history
      .map((h, i) => `[Iter ${i + 1}] Hypothesis: ${h.hypothesis}\nResult: ${h.result.slice(0, 600)}`)
      .join("\n\n");
    const systemMsg =
      SYSTEM_ANALYST +
      (isFinal
        ? "\n\nFINAL ITERATION: Produce complete summary with all key findings and 2-3 actionable recommendations. Print as JSON."
        : `\n\nIteration ${iteration}/${maxIterations}: go deeper, verify findings, find root causes.`);
    const resp = await this.complete(
      [
        { role: "system", content: systemMsg },
        {
          role: "user",
          content: `Original question: "${question}"\n\nPrevious iterations:\n${historyText}\n\nWhat to investigate next? Return JSON only.`,
        },
      ],
      2048
    );
    return { plan: this.parseJSON(resp.content), tokens: resp.tokens };
  }

  async finalSummary(
    question: string,
    results: string[],
    lang: "ru" | "en" = "ru"
  ): Promise<string> {
    const resp = await this.complete(
      [
        {
          role: "system",
          content: `You are a business analyst. Write executive summary in ${lang === "ru" ? "Russian" : "English"}.
Structure:
1. Р“Р»Р°РІРЅС‹Р№ РІС‹РІРѕРґ (1-2 РїСЂРµРґР»РѕР¶РµРЅРёСЏ, РіР»Р°РІРЅР°СЏ С†РёС„СЂР°)
2. РљР»СЋС‡РµРІС‹Рµ РЅР°С…РѕРґРєРё (3-5 РїСѓРЅРєС‚РѕРІ СЃ РєРѕРЅРєСЂРµС‚РЅС‹РјРё С‡РёСЃР»Р°РјРё)
3. Р РµРєРѕРјРµРЅРґР°С†РёРё (2-3 РєРѕРЅРєСЂРµС‚РЅС‹С… РґРµР№СЃС‚РІРёСЏ)
Be specific. Use exact numbers. No vague statements.`,
        },
        {
          role: "user",
          content: `Question: "${question}"\n\nResults from ${results.length} iterations:\n${results.join("\n---\n")}\n\nWrite executive summary.`,
        },
      ],
      1024
    );
    return resp.content;
  }
}
