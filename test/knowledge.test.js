'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { retrieve, renderKnowledge, info, scopeKey } = require('../lib/knowledge');

const ids = (q, o) => retrieve(q, o || {}).map((r) => r.id);

test('bank loads', () => assert.ok(info().rows >= 500));
test('FSSAI question finds the food licence row', () => assert.ok(ids('Do I need FSSAI licence to serve breakfast to guests?').includes('IN-FOOD-001')));
test('Hindi question finds food rows', () => assert.ok(ids('मेहमानों को खाना खिलाने के लिए लाइसेंस चाहिए?').includes('IN-FOOD-001')));
test('Hinglish registration question finds homestay classification', () => assert.ok(ids('homestay registration kaise karein').includes('IN-STAY-002')));
test('foreign guest question finds Form C', () => assert.ok(ids('Police verification of foreign guests Form C').includes('IN-LAW-001')));
test('named state boosts its own rows', () => assert.ok(ids('homestay registration in Himachal', { state: 'Himachal Pradesh' }).includes('IN-STAY-015')));
test('small talk returns nothing', () => { assert.deepStrictEqual(ids('hello'), []); assert.deepStrictEqual(ids('tell me a joke'), []); });
test('never more than 5 rows', () => assert.ok(ids('homestay guest food water waste').length <= 5));
test('scopeKey', () => { assert.strictEqual(scopeKey('India (national)'), null); assert.strictEqual(scopeKey('Kerala'), 'kerala'); });
test('render is tagged, safe, and empty-safe', () => {
  const out = renderKnowledge(retrieve('FSSAI homestay breakfast'));
  assert.match(out, /<knowledge>/); assert.ok(!/<script/i.test(out));
  assert.ok(typeof renderKnowledge([]) === 'string');
});
