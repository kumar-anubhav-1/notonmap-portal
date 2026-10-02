'use strict';
// Admin API for /admin.html. Switched off unless ADMIN_TOKEN is set. Needs the Upstash storage to save settings.
const { safeEqual, tooManyMisses, noteMiss } = require('../lib/limits');
const store = require('../lib/store');
const { summary } = require('../lib/analytics');
const { allJourneys } = require('../lib/prompt');

function ipOf(req) {
  const h = req.headers || {};
  return String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'unknown').trim().slice(0, 64);
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!process.env.ADMIN_TOKEN) return res.status(404).json({ ok: false, error: 'disabled' });
  const ip = ipOf(req);
  if (tooManyMisses(ip)) return res.status(429).json({ ok: false, error: 'rate_limit' });
  if (!safeEqual(req.headers['x-admin-token'], process.env.ADMIN_TOKEN)) { noteMiss(ip); return res.status(401).json({ ok: false, error: 'auth' }); }

  const url = new URL(req.url || '/', 'http://x');
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {};
  const action = req.method === 'POST' ? body.action : url.searchParams.get('action');

  if (action === 'stats') {
    if (!store.enabled()) return res.status(200).json({ ok: true, storage: false });
    const s = await summary(url.searchParams.get('days'));
    return res.status(200).json({ ok: true, storage: true, stats: s });
  }
  if (action === 'journeys') {
    await store.loadOverrides(true);
    return res.status(200).json({ ok: true, storage: store.enabled(), journeys: allJourneys().map(({ code, live, ready, order, label, hint }) => ({ code, live, ready: Boolean(ready), order, label, hint })) });
  }
  if (action === 'save' && req.method === 'POST') {
    if (!store.enabled()) return res.status(400).json({ ok: false, error: 'no_storage' });
    const saved = await store.saveOverrides(body.journeys);
    if (!saved) return res.status(502).json({ ok: false, error: 'save_failed' });
    return res.status(200).json({ ok: true, saved });
  }
  return res.status(400).json({ ok: false, error: 'bad_request' });
}

module.exports = async (req, res) => {
  try { await handle(req, res); }
  catch (err) { console.error('admin failed', err && err.message); if (!res.headersSent) res.status(500).json({ ok: false, error: 'default' }); }
};
