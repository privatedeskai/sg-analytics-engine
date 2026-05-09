export interface Metric {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
}

export interface ChartData {
  type: "bar" | "line" | "pie";
  title: string;
  labels: string[];
  datasets: { label: string; data: number[]; color?: string }[];
}

export interface AnalysisOutput {
  sessionId: string;
  question: string;
  summary: string;
  metrics: Metric[];
  charts: ChartData[];
  iterationsUsed: number;
  executionTimeMs: number;
  language: string;
}

export class OutputFormatter {
  parseExecutionResult(rawOutput: string): { metrics: Metric[]; charts: ChartData[]; rawData: any } {
    // Ищем JSON объект в выводе — пробуем все вхождения, берём первый валидный
    const jsonMatches = rawOutput.match(/\{[\s\S]*?\}/g) || [];
    for (const match of jsonMatches) {
      try {
        // Фикс: одинарные кавычки → двойные (Python dict в stdout)
        const normalized = match.replace(/'/g, '"');
        const data = JSON.parse(normalized);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          return { metrics: this.extractMetrics(data), charts: this.extractCharts(data), rawData: data };
        }
      } catch (_) {}
    }
    return { metrics: [], charts: [], rawData: { raw: rawOutput } };
  }

  private extractMetrics(data: any): Metric[] {
    const metrics: Metric[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number") {
        metrics.push({ label: this.humanizeKey(key), value: this.formatNumber(value), trend: "neutral" });
      } else if (typeof value === "string" && value.length < 50) {
        // Строковые метрики тоже показываем (напр. trend: 'growth')
        metrics.push({ label: this.humanizeKey(key), value: String(value), trend: "neutral" });
      }
    }
    return metrics.slice(0, 6);
  }

  private extractCharts(data: any): ChartData[] {
    const charts: ChartData[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const entries = Object.entries(value as Record<string, any>);
        if (entries.length < 2 || entries.length > 20) continue;

        const allNumeric = entries.every(([, v]) => typeof v === "number");
        const mixed = !allNumeric && entries.some(([, v]) => typeof v === "number" || typeof v === "string");

        if (allNumeric) {
          // Чистые числа — bar chart как раньше
          charts.push({
            type: "bar",
            title: this.humanizeKey(key),
            labels: entries.map(([k]) => k),
            datasets: [{ label: this.humanizeKey(key), data: entries.map(([, v]) => v as number), color: "#378ADD" }],
          });
        } else if (mixed) {
          // Смешанные: строки конвертируем в +1/-1 для визуализации тренда
          const numericData = entries.map(([, v]) => {
            if (typeof v === "number") return v;
            const s = String(v).toLowerCase();
            if (s.includes('growth') || s.includes('up') || s.includes('positive') || s.includes('рост')) return 1;
            if (s.includes('decline') || s.includes('down') || s.includes('negative') || s.includes('падение')) return -1;
            return 0;
          });
          const colors = numericData.map(v => v >= 0 ? "#1D9E75" : "#E24B4A");
          charts.push({
            type: "bar",
            title: this.humanizeKey(key) + ' (trend)',
            labels: entries.map(([k]) => k),
            datasets: [{ label: this.humanizeKey(key), data: numericData, color: colors[0] }],
          });
        }
      }

      // Массив объектов → таблица-бар
      if (Array.isArray(value) && value.length >= 2 && value.length <= 20) {
        const first = value[0];
        if (typeof first === "object" && first !== null) {
          const numKeys = Object.keys(first).filter(k => typeof first[k] === "number");
          const labelKey = Object.keys(first).find(k => typeof first[k] === "string");
          if (numKeys.length > 0 && labelKey) {
            charts.push({
              type: "bar",
              title: this.humanizeKey(key),
              labels: value.map(row => String(row[labelKey])),
              datasets: numKeys.slice(0, 2).map(nk => ({
                label: this.humanizeKey(nk),
                data: value.map(row => Number(row[nk]) || 0),
                color: "#378ADD",
              })),
            });
          }
        }
      }
    }
    return charts.slice(0, 3);
  }

  private humanizeKey(key: string): string {
    return key.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim().replace(/^\w/, c => c.toUpperCase());
  }

  private formatNumber(n: number): string {
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    if (n % 1 !== 0) return n.toFixed(2);
    return n.toString();
  }

  getIterationStatus(iteration: number): string {
    if (iteration <= 2) return `Loading data, checking structure... (${Math.round(iteration / 10 * 100)}%)`;
    if (iteration <= 4) return `Grouping by periods, searching for anomalies... (${Math.round(iteration / 10 * 100)}%)`;
    if (iteration <= 7) return `Testing hypotheses, deepening analysis... (${Math.round(iteration / 10 * 100)}%)`;
    return `Forming conclusions and recommendations... (${Math.round(iteration / 10 * 100)}%)`;
  }
}
