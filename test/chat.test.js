'use strict';
// Run: node --test test/chat.test.js   (uses MOCK mode; no API key needed)
process.env.MOCK = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/chat');
const { buildSystem, load } = require('../lib/prompt');

function call(body) {
  return new Promise((resolve) => {
    const req = { method: 'POST', headers: { 'x-forwarded-for': '10.1.1.' + Math.floor(Math.random() * 200) }, body };
    const res = {
      statusCode: 200, setHeader() {},
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); },
    };
    handler(req, res);
  });
}

test('schema meets strict-mode limits', () => {
  const tool = load().tool;
  assert.equal(tool.strict, true);
  let optional = 0;
  (function walk(s, where) {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false, `${where} needs additionalProperties:false`);
      const props = Object.keys(s.properties || {});
      optional += props.filter((p) => !(s.required || []).includes(p)).length;
      props.forEach((p) => walk(s.properties[p], `${where}.${p}`));
    }
    if (s.type === 'array') {
      assert.ok(!(s.minItems > 1), `${where}: minItems > 1 not supported`);
      assert.ok(s.maxItems === undefined, `${where}: maxItems not supported`);
      walk(s.items, `${where}[]`);
    }
  })(tool.input_schema, 'root');
  assert.ok(optional <= 24, `optional params ${optional}`);
});

test('system prompt: stable cached block + per-turn context block, all placeholders filled', () => {
  const sys = buildSystem({ journeyCode: 'START', uiLanguage: 'hi', region: 'Kumaon<script>' });
  assert.equal(sys.length, 2);
  assert.ok(sys[0].cache_control);
  assert.ok(!sys[1].cache_control);
  assert.ok(!sys[0].text.includes('HUMAN NOTES'));
  assert.ok(!sys[0].text.includes('{{'), 'stable block must not contain per-turn placeholders');
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(sys[1].text), 'unfilled placeholder');
  assert.match(sys[1].text, /Nothing learned yet/);
  assert.ok(!sys[1].text.includes('<script>'));
  assert.equal(buildSystem({ journeyCode: 'GROW_GREEN' }), null);
});

test('chat returns reply + updated profile; profile round-trips across turns', async () => {
  const msgs = [{ role: 'user', content: 'Mere paas ek extra room hai' }];
  const r1 = await call({ journey: 'START', uiLanguage: 'en', messages: msgs });
  assert.equal(r1.status, 200);
  const { reply, profile } = r1.body;
  assert.equal(reply.follow_ups.length, 3);
  assert.ok(reply.next_micro_step);
  assert.equal(profile.meta.turns, 1);
  assert.equal(profile.userArchetype, 'NEW_CREATOR');
  assert.equal(profile.meta.entryJourney, 'START');

  const r2 = await call({
    journey: 'START', uiLanguage: 'en', profile,
    messages: [...msgs, { role: 'assistant', content: reply.answer_markdown }, { role: 'user', content: 'aur?' }],
  });
  assert.equal(r2.body.profile.meta.turns, 2);
  assert.deepEqual(r2.body.profile.activeAssets, ['spare room (demo)']); // de-duplicated
});

test('garbage profile from the browser is ignored, not fatal', async () => {
  const r = await call({ journey: 'IMPROVE', messages: [{ role: 'user', content: 'hi' }], profile: { userArchetype: 'ROOT', meta: 'x' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.meta.turns, 1);
});

test('normalise: wrong language code falls back; follow-ups trimmed to 3', () => {
  const out = handler.normalise({ answer_markdown: 'x', reply_language: 'hi-Latn', follow_ups: ['a', 'b', 'c', 'd', ''] }, 'hinglish');
  assert.equal(out.reply_language, 'hinglish');
  assert.deepEqual(out.follow_ups, ['a', 'b', 'c']);
  assert.equal(handler.normalise({ answer_markdown: '  ' }, 'en'), null);
});
