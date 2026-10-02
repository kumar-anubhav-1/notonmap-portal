'use strict';
process.env.MOCK = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const limits = require('../lib/limits');
const store = require('../lib/store');
const analytics = require('../lib/analytics');
const prompt = require('../lib/prompt');

function call(handler, { method = 'POST', headers = {}, body, url } = {}) {
  return new Promise((resolve) => {
    const req = { method, url, headers: { 'x-vercel-forwarded-for': '9.9.9.' + Math.floor(Math.random() * 250), ...headers }, body };
    const res = { statusCode: 200, headersSent: false, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.headersSent = true; resolve({ status: this.statusCode, body: b }); } };
    handler(req, res);
  });
}
const msg = (t) => ({ journey: 'IMPROVE', uiLanguage: 'en', messages: [{ role: 'user', content: t }] });

test('oversized request is refused', async () => {
  const chat = require('../api/chat');
  const r = await call(chat, { headers: { 'content-length': '999999' }, body: msg('hi') });
  assert.equal(r.status, 413);
});

test('repeated wrong pilot codes get locked out', async () => {
  process.env.PILOT_CODE = 'secret1';
  limits._resetMisses();
  const chat = require('../api/chat');
  const ip = { 'x-vercel-forwarded-for': '7.7.7.7', 'x-pilot-code': 'nope' };
  for (let i = 0; i < 10; i++) assert.equal((await call(chat, { headers: ip, body: msg('hi') })).status, 401);
  assert.equal((await call(chat, { headers: ip, body: msg('hi') })).status, 429);
  const good = await call(chat, { headers: { 'x-vercel-forwarded-for': '7.7.7.8', 'x-pilot-code': 'secret1' }, body: msg('hello') });
  assert.equal(good.status, 200);
  delete process.env.PILOT_CODE; limits._resetMisses();
});

test('garbage bodies never crash the handler', async () => {
  const chat = require('../api/chat');
  for (const body of [null, '', '{bad', 42, { messages: 'x' }, { messages: [{ role: 'user', content: 5 }] }, { journey: 'NOPE', messages: [{ role: 'user', content: 'hi' }] }]) {
    const r = await call(chat, { body });
    assert.ok([200, 400].includes(r.status), String(r.status));
    assert.equal(typeof r.body.ok, 'boolean');
  }
});

test('an unexpected failure still returns clean JSON', async () => {
  const chat = require('../api/chat');
  const r = await call(chat, { body: { journey: 'IMPROVE', messages: [{ role: 'user', content: 'hi' }], profile: { get locationContext() { throw new Error('boom'); } } } });
  assert.ok(r.status === 200 || r.status === 500);
  assert.equal(typeof r.body.ok, 'boolean');
});

test('real API mode: timeout and busy API give a clean error, a good reply passes', async () => {
  delete process.env.MOCK; process.env.ANTHROPIC_API_KEY = 'k';
  const realFetch = global.fetch;
  const chat = require('../api/chat');
  try {
    let calls = 0;
    global.fetch = async () => { calls++; return { ok: false, status: 529, text: async () => 'overloaded' }; };
    const bad = await call(chat, { body: msg('hello there') });
    assert.equal(bad.status, 502); assert.equal(bad.body.error, 'upstream'); assert.equal(calls, 2); // one retry
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 8 }, content: [{ type: 'tool_use', input: { reply_language: 'en', answer_markdown: 'Hi', next_micro_step: '', needs_human_verification: false, follow_ups: [], source_ids: ['FAKE-1'], profile_update: {} } }] }) });
    const ok = await call(chat, { body: msg('hello there') });
    assert.equal(ok.status, 200); assert.deepEqual(ok.body.reply.source_ids, []); // invented source ids are dropped
    global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'no tool' }] }) });
    assert.equal((await call(chat, { body: msg('hello there') })).status, 502);
  } finally { global.fetch = realFetch; process.env.MOCK = '1'; delete process.env.ANTHROPIC_API_KEY; }
});

test('store cleans journey settings', () => {
  const c = store.cleanOverrides({ START: { live: false, order: 500, label: { en: '<b>Hi</b>', hi: '' } }, 'bad code': { live: true }, X: 5 });
  assert.deepEqual(c, { START: { live: false, order: 99, label: { en: 'bHi/b' } } });
});

test('a journey that is not ready cannot be switched on', () => {
  store._reset();
  const ov = store.cleanOverrides({ GROW_GREEN: { live: true }, START: { live: false } });
  Object.assign(store.getOverrides(), ov);
  const live = prompt.liveJourneys().map((j) => j.code);
  assert.ok(!live.includes('GROW_GREEN')); assert.ok(!live.includes('START')); assert.ok(live.includes('IMPROVE'));
  store._reset();
});

test('admin is off without a token, and needs the right one', async () => {
  const admin = require('../api/admin');
  delete process.env.ADMIN_TOKEN;
  assert.equal((await call(admin, { method: 'GET', url: '/api/admin?action=journeys', headers: {} })).status, 404);
  process.env.ADMIN_TOKEN = 'adm-long-token'; limits._resetMisses();
  assert.equal((await call(admin, { method: 'GET', url: '/api/admin?action=journeys', headers: { 'x-admin-token': 'x' } })).status, 401);
  const ok = await call(admin, { method: 'GET', url: '/api/admin?action=journeys', headers: { 'x-admin-token': 'adm-long-token' } });
  assert.equal(ok.status, 200); assert.equal(ok.body.storage, false); assert.ok(ok.body.journeys.length >= 2);
  const sv = await call(admin, { method: 'POST', body: { action: 'save', journeys: {} }, headers: { 'x-admin-token': 'adm-long-token' } });
  assert.equal(sv.status, 400); // no storage connected
  delete process.env.ADMIN_TOKEN; limits._resetMisses();
});

test('analytics counters and journey settings round-trip through a fake store', async () => {
  const db = new Map(); const sets = new Map();
  const realFetch = global.fetch;
  process.env.UPSTASH_REDIS_REST_URL = 'https://fake.upstash.io'; process.env.UPSTASH_REDIS_REST_TOKEN = 't';
  global.fetch = async (url, opt) => {
    const cmds = JSON.parse(opt.body);
    const result = cmds.map((c) => {
      const [op, key, a, b] = c;
      if (op === 'HINCRBY') { const h = db.get(key) || {}; h[a] = (h[a] || 0) + b; db.set(key, h); return { result: h[a] }; }
      if (op === 'HGETALL') { const h = db.get(key) || {}; return { result: Object.entries(h).flat().map(String) }; }
      if (op === 'SET') { sets.set(key, a); return { result: 'OK' }; }
      if (op === 'GET') return { result: sets.get(key) || null };
      return { result: 1 };
    });
    return { ok: true, json: async () => result };
  };
  try {
    const log = console.log; console.log = () => {};
    await analytics.record({ journey: 'IMPROVE', lang: 'en', ok: true, ms: 1000, kb: ['IN-FOOD-001'], sop: true, verify: true, usage: { input: 100, output: 50, cacheRead: 900, cacheWrite: 0 } });
    await analytics.record({ journey: 'START', lang: 'hi', ok: false, error: 'upstream', ms: 3000, kb: [] });
    console.log = log;
    const s = await analytics.summary(2);
    assert.equal(s.total.turns, 2); assert.equal(s.total.errors, 1); assert.equal(s.total.sop, 1); assert.equal(s.topRows[0].id, 'IN-FOOD-001');
    assert.equal(s.derived.cacheHitShare, 0.9);
    assert.ok(!JSON.stringify([...db.values()]).includes('hello')); // counters only
    store._reset();
    assert.ok(await store.saveOverrides({ IMPROVE: { label: { en: 'Better hosting' } } }));
    store._reset(); await store.loadOverrides(true);
    assert.equal(prompt.publicConfig().journeys.find((j) => j.code === 'IMPROVE').label.en, 'Better hosting');
  } finally { global.fetch = realFetch; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; store._reset(); }
});
