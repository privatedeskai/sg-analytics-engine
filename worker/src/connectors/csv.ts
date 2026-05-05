export interface NormalizedData {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
  columnTypes: Record<string, "number" | "date" | "string">;
  description: string;
  csvString: string;
}

export class CSVConnector {
  parse(rawContent: string, filename?: string): NormalizedData {
    const content = rawContent.trim();
    const delimiter = this.detectDelimiter(content);
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error("CSV must have at least a header row and one data row");
    const headers = this.parseRow(lines[0], delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseRow(lines[i], delimiter);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = (values[idx] || "").trim().replace(/^["']|["']$/g, ""); });
      rows.push(row);
    }
    const columnTypes = this.detectColumnTypes(headers, rows);
    const description = this.buildDescription(headers, rows, columnTypes, filename);
    const normalizedLines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => { const val = r[h] || ""; return val.includes(",") ? `"${val}"` : val; }).join(",")),
    ];
    return { headers, rows, rowCount: rows.length, columnTypes, description, csvString: normalizedLines.join("\n") };
  }

  private detectDelimiter(content: string): string {
    const firstLine = content.split(/\r?\n/)[0];
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    if (tabs > commas && tabs > semicolons) return "\t";
    if (semicolons > commas) return ";";
    return ",";
  }

  private parseRow(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (char === delimiter && !inQuotes) { result.push(current); current = ""; }
      else { current += char; }
    }
    result.push(current);
    return result;
  }

  private detectColumnTypes(headers: string[], rows: Record<string, string>[]): Record<string, "number" | "date" | "string"> {
    const types: Record<string, "number" | "date" | "string"> = {};
    const sample = rows.slice(0, Math.min(20, rows.length));
    for (const header of headers) {
      const values = sample.map((r) => r[header]).filter((v) => v && v.trim() !== "");
      if (values.length === 0) { types[header] = "string"; continue; }
      const numericCount = values.filter((v) => !isNaN(Number(v.replace(/[$,%]/g, "")))).length;
      if (numericCount / values.length > 0.8) { types[header] = "number"; continue; }
      const dateCount = values.filter((v) => !isNaN(Date.parse(v))).length;
      if (dateCount / values.length > 0.8) { types[header] = "date"; continue; }
      types[header] = "string";
    }
    return types;
  }

  private buildDescription(headers: string[], rows: Record<string, string>[], types: Record<string, "number" | "date" | "string">, filename?: string): string {
    const numericCols = headers.filter((h) => types[h] === "number");
    const dateCols = headers.filter((h) => types[h] === "date");
    const stringCols = headers.filter((h) => types[h] === "string");
    return [
      filename ? `File: ${filename}.` : "",
      `Dataset: ${rows.length} rows, ${headers.length} columns.`,
      `Columns: ${headers.join(", ")}.`,
      numericCols.length > 0 ? `Numeric: ${numericCols.join(", ")}.` : "",
      dateCols.length > 0 ? `Date columns: ${dateCols.join(", ")}.` : "",
      stringCols.length > 0 ? `Categorical: ${stringCols.join(", ")}.` : "",
    ].filter(Boolean).join(" ");
  }
}