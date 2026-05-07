export interface IterationResult {
  python: string; summary: string; enough: boolean; reason: string;
}
const GONKA_URL = 'https://web-app-liart-gamma.vercel.app/api/gonka';
const MODEL = 'moonshotai/Kimi-K2.6';
export class KimiClient {
  constructor(private key: string) {}
  async generateIteration(dd: string, q: string, sums: string[], i: number, max: number): Promise<IterationResult> {
    const sp = 'You are a Python data analyst. Write Python under 25 lines for ONE hypothesis. FORBIDDEN: pandas/numpy. CSV in CSV_DATA. Output: print(json.dumps({result:...})). Return JSON: {python:...,summary:...,enough:bool,reason:...}';
    const cb = sums.length > 0 ? '\n\nKnown: ' + sums.map((s,j)=>(j+1)+': '+s).join('; ') : '';
    const um = 'Schema:\n' + dd + '\n\nQuestion: ' + q + ' (iter ' + i + '/' + max + ')' + cb + '\n\nOne hypothesis only.';
    const t0 = Date.now();
    const raw = await this.call(sp, um, 2000, 'iter'+i);
    console.log('[KIMI] iter=' + i + ' elapsed=' + (Date.now()-t0) + 'ms');
    return this.parse(raw, i);
  }
  async generateFinalAnalysis(q: string, sums: string[], lang: string = 'ru'): Promise<string> {
    const l = lang === 'ru' ? 'Respond in Russian. Plain text.' : 'Respond in English.';
    const s = 'You are a business analyst. ' + l + ' Give summary, key findings, 1 recommendation.';
    const m = 'Question: ' + q + '\n\nFindings:\n' + sums.map((s,i)=>(i+1)+'. '+s).join('\n');
    return await this.call(s, m, 1000, 'final');
  }
  private async call(sys: string, usr: string, max: number, lbl: string): Promise<string> {
    const r = await fetch(GONKA_URL, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,max_tokens:max,messages:[{role:'system',content:sys},{role:'user',content:usr}],temperature:0.6})});
    if (!r.ok) { const e = await r.text(); throw new Error('Proxy ' + r.status + ': ' + e.slice(0,100)); }
    const d = await r.json() as any;
    console.log('[KIMI:API] ' + lbl + ' tokens=' + d.usage?.total_tokens);
    return (d.choices?.[0]?.message?.content || '').trim();
  }
  private parse(raw: string, i: number): IterationResult {
    try {
      const p = JSON.parse(raw.replace(/```(?:json)?\n?/g,'').replace(/```/g,'').trim());
      return {python:this.code(p.python||''),summary:(p.summary||'').slice(0,200),enough:Boolean(p.enough),reason:(p.reason||'').slice(0,100)};
    } catch(e) { return {python:this.code(raw),summary:'fallback',enough:false,reason:'parse failed'}; }
  }
  private code(t: string): string {
    const m = t.match(/```(?:python)?\n?([\s\S]*?)```/);
    return m ? m[1].trim() : t.trim();
  }
}