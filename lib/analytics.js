'use strict';
// Content-free usage tracking. Never records what a person typed or what the guide answered.
// 1) Every event is printed as one JSON line (visible in Vercel > Logs, and can be sent on with a log drain).
// 2) If Upstash is connected, daily counters are kept so /admin.html can show them.
const store = require('./store');

const KEEP_SECONDS = 90 * 24 * 3600;
const day = (d = new Date()) => d.toISOString().slice(0, 10);
const safe = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30);

/** e: { journey, lang, ok, error, ms, kb: [ids], sop, verify, usage:{input,output,cacheRead,cacheWrite}, model } */
async function record(e) {
  const line = {
    evt: 'chat', ts: new Date().toISOString(), journey: safe(e.journey), lang: safe(e.lang), ok: Boolean(e.ok),
    error: e.error ? safe(e.error) : undefined, ms: Math.round(e.ms || 0), kb: (e.kb || []).map(safe),
    sop: Boolean(e.sop), verify: Boolean(e.verify), model: safe(e.model), usage: e.usage || undefined,
  };
  console.log(JSON.stringify(line));
  if (!store.enabled()) return;
  const k = `nom:stats:${day()}`;
  const inc = (f, n = 1) => ['HINCRBY', k, f, Math.round(n)];
  const cmds = [inc('turns'), inc(e.ok ? 'ok' : 'errors'), inc('ms_sum', e.ms || 0)];
  if (e.error) cmds.push(inc('err_' + safe(e.error)));
  if (e.journey) cmds.push(inc('j_' + safe(e.journey)));
  if (e.lang) cmds.push(inc('lang_' + safe(e.lang)));
  if (e.ok) {
    cmds.push(inc(line.kb.length ? 'kb_hit' : 'kb_miss'));
    for (const id of line.kb) cmds.push(inc('row_' + id));
    if (e.sop) cmds.push(inc('sop'));
    if (e.verify) cmds.push(inc('verify'));
    const u = e.usage || {};
    cmds.push(inc('tok_in', u.input || 0), inc('tok_out', u.output || 0), inc('cache_read', u.cacheRead || 0), inc('cache_write', u.cacheWrite || 0));
  }
  cmds.push(['EXPIRE', k, KEEP_SECONDS]);
  await store.pipeline(cmds);
}

/** Last N days of counters, newest first, plus totals and a few derived numbers. */
async function summary(days = 7) {
  const n = Math.max(1, Math.min(60, Number(days) || 7));
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(day(new Date(Date.now() - i * 86400000)));
  const res = await store.pipeline(keys.map((d) => ['HGETALL', `nom:stats:${d}`]), 4000);
  if (!res) return null;
  const perDay = keys.map((d, i) => {
    const arr = Array.isArray(res[i]) ? res[i] : [];
    const o = {};
    for (let j = 0; j + 1 < arr.length; j += 2) o[arr[j]] = Number(arr[j + 1]) || 0;
    return { day: d, ...o };
  });
  const total = {};
  for (const d of perDay) for (const [k, v] of Object.entries(d)) if (k !== 'day') total[k] = (total[k] || 0) + v;
  const cacheDen = (total.cache_read || 0) + (total.cache_write || 0) + (total.tok_in || 0);
  const answered = (total.kb_hit || 0) + (total.kb_miss || 0);
  const derived = {
    avgMs: total.turns ? Math.round((total.ms_sum || 0) / total.turns) : 0,
    errorRate: total.turns ? +((total.errors || 0) / total.turns).toFixed(3) : 0,
    cacheHitShare: cacheDen ? +((total.cache_read || 0) / cacheDen).toFixed(3) : 0,
    kbMatchShare: answered ? +((total.kb_hit || 0) / answered).toFixed(3) : 0,
  };
  const topRows = Object.entries(total).filter(([k]) => k.startsWith('row_')).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => ({ id: k.slice(4), n: v }));
  return { days: perDay, total, derived, topRows };
}

module.exports = { record, summary };
