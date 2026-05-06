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
    // TODO_TEMP TD-001: temporarily using Claude API instead of Kimi K2.6
    // REVERT: baseUrl = 'https://api.deepinfra.com/v1/openai', model = 'moonshotai/Kimi-K2-Instruct'
    // TRIGGER: top up DeepInfra balance (~$10), verify DEEPINFRA_API_KEY in Cloudflare secrets
    this.baseUrl = 'https://api.anthropic.com/v1';
    this.model = 'claude-sonnet-4-5';
  }

  async generatePython(dataDescription: string, question: string, previousResult?: string, iteration?: number): Promise<string> {
    const systemPrompt = `You are a Python data analyst. Write clean, executable Python code to analyze data and answer questions.

CRITICAL CONSTRAINTS - Judge0 CE sandbox has NO third-party libraries:
- FORBIDDEN: pandas, numpy, matplotlib, scipy, sklearn, or ANY import not in Python stdlib
- ALLOWED: csv, json, io, math, statistics, collections, itertools, functools, datetime, re, operator

The CSV data is available as a string in the variable CSV_DATA (already defined before your code runs).

Parse CSV like this:
import csv, json, io
reader = csv.DictReader(io.StringIO(CSV_DATA))
rows = list(reader)

Always output results as JSON:
print(json.dumps({"result": ...}))

Return ONLY executable Python code. No explanations. No markdown fences. No import pandas.`;

    const iterNote = iteration ? ` (iteration ${iteration})` : '';
    const userMessage = previousResult
      ? `Data schema: ${dataDescription}\nQuestion: ${question}${iterNote}\nPrevious result:\n${previousResult}\n\nImprove the analysis. Deeper insights. Return only Python code. No pandas.`
      : `Data schema: ${dataDescription}\nQuestion: ${question}${iterNote}\n\nWrite Python code to analyze this data. Return only Python code. No pandas.`;

    const response = await this.callAPI(systemPrompt, userMessage);
    return this.extractCode(response);
  }

  async generateFinalAnalysis(question: string, analysisResults: string[], language: string = 'en'): Promise<string> {
    return this.generateFinalText(question, analysisResults, language);
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
        throw new Error(`Claude API error: ${response.status} - ${err}`);
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
        throw new Error(`DeepInfra API error: ${response.status} - ${err}`);
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
