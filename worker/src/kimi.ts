export interface KimiMessage {
  role: 'user' | 'assistant';
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
    // Временно: Claude API. После пополнения DeepInfra — сменить на:
    // baseUrl: 'https://api.deepinfra.com/v1/openai'
    // model: 'moonshotai/Kimi-K2-Instruct'
    this.baseUrl = 'https://api.anthropic.com/v1';
    this.model = 'claude-sonnet-4-20250514';
  }

  async generatePython(dataDescription: string, question: string, previousResult?: string): Promise<string> {
    const systemPrompt = `You are a Python data analyst. Write clean, executable Python code to analyze data and answer questions.
Always use pandas for data manipulation. Always print results clearly.
Return ONLY the Python code, no explanations, no markdown fences.`;

    const userMessage = previousResult
      ? `Data: ${dataDescription}\nQuestion: ${question}\nPrevious result:\n${previousResult}\n\nImprove the analysis based on the previous result. Return only Python code.`
      : `Data: ${dataDescription}\nQuestion: ${question}\n\nWrite Python code to analyze this data and answer the question. Return only Python code.`;

    const response = await this.callAPI(systemPrompt, userMessage);
    return this.extractCode(response);
  }

  async generateFinalText(question: string, analysisResults: string[], language: string = 'en'): Promise<string> {
    const langInstruction = language === 'ru'
      ? 'Respond in Russian. Be concise and business-focused.'
      : 'Respond in English. Be concise and business-focused.';

    const systemPrompt = `You are a business analyst. Synthesize data analysis results into clear insights and recommendations. ${langInstruction}
Format: 1-2 sentence summary, key findings as bullet points, 1 concrete recommendation.`;

    const userMessage = `Question: ${question}\n\nAnalysis results from ${analysisResults.length} iterations:\n${analysisResults.join('\n---\n')}`;

    return await this.callAPI(systemPrompt, userMessage);
  }

  private async callAPI(systemPrompt: string, userMessage: string): Promise<string> {
    const isAnthropic = this.baseUrl.includes('anthropic');

    if (isAnthropic) {
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Claude API error: ${response.status} — ${err}`);
      }

      const data: any = await response.json();
      return data.content[0].text;
    } else {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2000,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`DeepInfra API error: ${response.status} — ${err}`);
      }

      const data: any = await response.json();
      return data.choices[0].message.content;
    }
  }

  private extractCode(text: string): string {
    const fenceMatch = text.match(/```(?:python)?\n?([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();
    return text.trim();
  }
}
