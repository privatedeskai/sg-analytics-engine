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
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { metrics: [], charts: [], rawData: { raw: rawOutput } };
    let data: any;
    try { data = JSON.parse(jsonMatch[0]); }
    catch { return { metrics: [], charts: [], rawData: { raw: rawOutput } }; }
    return { metrics: this.extractMetrics(data), charts: this.extractCharts(data), rawData: data };
  }

  private extractMetrics(data: any): Metric[] {
    const metrics: Metric[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "number") {
        metrics.push({ label: this.humanizeKey(key), value: this.formatNumber(value), trend: "neutral" });
      }
    }
    return metrics.slice(0, 6);
  }

  private extractCharts(data: any): ChartData[] {
    const charts: ChartData[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const entries = Object.entries(value as Record<string, any>);
        const allNumeric = entries.every(([, v]) => typeof v === "number");
        if (allNumeric && entries.length >= 2 && entries.length <= 20) {
          charts.push({
            type: "bar",
            title: this.humanizeKey(key),
            labels: entries.map(([k]) => k),
            datasets: [{ label: this.humanizeKey(key), data: entries.map(([, v]) => v as number), color: "#378ADD" }],
          });
        }
      }
    }
    return charts.slice(0, 3);
  }

  private humanizeKey(key: string): string {
    return key.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim().replace(/^\w/, (c) => c.toUpperCase());
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