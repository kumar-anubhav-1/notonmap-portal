'use strict';
// Optional shared storage through Upstash Redis (REST). It needs no npm package.
// Without UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN every call quietly does nothing,
// so the portal still works. Used for (1) usage counters and (2) journey settings edited in /admin.html.
const URL_ = () => (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || '';
const enabled = () => Boolean(URL_() && TOKEN());

async function pipeline(commands, timeoutMs = 1500) {
  if (!enabled() || !commands.length) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${URL_()}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN()}`, 'content-type': 'application/json' },
      body: JSON.stringify(commands),
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const out = await r.json();
    return Array.isArray(out) ? out.map((x) => (x && x.error ? null : x && x.result)) : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// ---- journey settings (small override file kept in the store) ----
const OVERRIDE_KEY = 'nom:journeys';
let overrides = {};
let fetchedAt = 0;
const TTL_MS = 30 * 1000;

function cleanOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const s = (v, n) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, n) : undefined);
  for (const [code, o] of Object.entries(raw)) {
    if (!/^[A-Z_]{2,20}$/.test(code) || !o || typeof o !== 'object') continue;
    const c = {};
    if (typeof o.live === 'boolean') c.live = o.live;
    if (Number.isFinite(o.order)) c.order = Math.max(0, Math.min(99, Math.round(o.order)));
    for (const f of ['label', 'hint']) {
      if (o[f] && typeof o[f] === 'object') {
        const v = {};
        const en = s(o[f].en, 120), hi = s(o[f].hi, 120);
        if (en) v.en = en;
        if (hi) v.hi = hi;
        if (Object.keys(v).length) c[f] = v;
      }
    }
    if (Object.keys(c).length) out[code] = c;
  }
  return out;
}

async function loadOverrides(force) {
  if (!enabled()) return overrides;
  if (!force && Date.now() - fetchedAt < TTL_MS) return overrides;
  const res = await pipeline([['GET', OVERRIDE_KEY]]);
  fetchedAt = Date.now();
  if (res && typeof res[0] === 'string') { try { overrides = cleanOverrides(JSON.parse(res[0])); } catch { /* keep previous */ } }
  return overrides;
}
async function saveOverrides(raw) {
  const clean = cleanOverrides(raw);
  const res = await pipeline([['SET', OVERRIDE_KEY, JSON.stringify(clean)]]);
  if (!res) return null;
  overrides = clean; fetchedAt = Date.now();
  return clean;
}
const getOverrides = () => overrides;
function _reset() { overrides = {}; fetchedAt = 0; }

module.exports = { enabled, pipeline, loadOverrides, saveOverrides, getOverrides, cleanOverrides, _reset };
