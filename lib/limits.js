'use strict';
// Best-effort protection against runaway cost. In-memory, so it resets when the
// serverless instance restarts. The real hard cap is the spending limit you set
// in the Claude Console. For stronger limits later, move these counters to a
// shared store (for example Upstash Redis).
const crypto = require('crypto');

const perIp = new Map();
let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;

const HOURLY_PER_IP = parseInt(process.env.HOURLY_LIMIT_PER_IP || '40', 10);
const DAILY_CAP = parseInt(process.env.DAILY_REQUEST_CAP || '1500', 10);

function checkLimits(ip) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; perIp.clear(); }
  if (dayCount >= DAILY_CAP) return { ok: false, code: 'daily_cap' };
  const now = Date.now();
  const hits = (perIp.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  if (hits.length >= HOURLY_PER_IP) { perIp.set(ip, hits); return { ok: false, code: 'rate_limit' }; }
  hits.push(now);
  perIp.set(ip, hits);
  dayCount += 1;
  if (perIp.size > 5000) perIp.clear();
  return { ok: true };
}

// Wrong pilot code or admin token: after a few misses from one address, stop answering for an hour.
const misses = new Map();
const MAX_MISSES = parseInt(process.env.MAX_CODE_MISSES || '10', 10);
function tooManyMisses(ip) {
  const now = Date.now();
  const m = (misses.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  misses.set(ip, m);
  return m.length >= MAX_MISSES;
}
function noteMiss(ip) {
  const m = misses.get(ip) || [];
  m.push(Date.now());
  misses.set(ip, m);
  if (misses.size > 5000) misses.clear();
}
function _resetMisses() { misses.clear(); }

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function pilotCodeOk(provided) {
  const required = process.env.PILOT_CODE;
  if (!required) return true;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(required);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { checkLimits, pilotCodeOk, tooManyMisses, noteMiss, safeEqual, _resetMisses };
