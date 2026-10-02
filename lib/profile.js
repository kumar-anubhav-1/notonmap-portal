'use strict';
/**
 * NotOnMap invisible user profile ("Learned Context").
 *
 * Design: Claude never rewrites the whole profile. Each turn it returns a small
 * `profile_update` (only what is new). This module merges that delta into the
 * stored profile with fixed, testable rules, and derives the archetype from
 * evidence. Memory therefore never drifts, never silently drops fields, and
 * a person is never locked into their first role.
 *
 * Everything here is pure (no I/O) so it can run on the server and be tested.
 * See docs/STATE-ARCHITECTURE.md for the full specification.
 */

const SCHEMA_VERSION = 1;

const ARCHETYPES = ['NEW_CREATOR', 'EXISTING_PROVIDER', 'HYBRID', 'UNKNOWN'];
const LANGS = ['en', 'hi', 'hinglish'];
const STAGES = ['idea', 'planning', 'running', 'paused'];
const KINDS = ['homestay', 'guesthouse', 'farmstay', 'food_experience', 'craft_experience', 'farm_experience',
  'nature_experience', 'culture_experience', 'guided_walk_or_tour', 'other'];
const FACT_CATS = ['guests', 'constraints', 'local_calendar', 'people', 'goals'];
const LOG_TYPES = ['insight', 'tried', 'worked', 'did_not_work', 'preference', 'correction'];
const EXP_LEVELS = ['unknown', 'new', 'some', 'experienced'];
const LOC_KEYS = ['village', 'district', 'state', 'region', 'terrain', 'climate', 'access'];

const RUNNING_STAGES = ['running', 'paused'];
const NEW_STAGES = ['idea', 'planning'];

// Size caps keep the profile small enough to send every turn (~1-2k tokens max).
const CAP = {
  str: 90, ventures: 6, assets: 25, factsPerCat: 8, logs: 24, logsPerTurn: 2,
  threads: 6, history: 12, json: 12000,
};
// Logs we keep longest: feedback on advice is the most valuable memory.
const LOG_KEEP_PRIORITY = ['worked', 'did_not_work', 'correction', 'preference', 'tried', 'insight'];

// ---------- helpers ----------

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const pick = (v, allowed, dflt) => {
  const s = typeof v === 'string' ? v.trim() : '';
  const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase()); // enum casing is not guaranteed
  return hit || dflt;
};
// Unicode-aware key for de-duplication (keeps Devanagari letters and matras).
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim();

// Personal identifiers we never store. An entry containing one is dropped entirely.
const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+(\.[\w-]+)*/,                 // email or UPI handle
  /\b\d{6}\b/,                                  // PIN code
  /\b[A-Z]{5}\d{4}[A-Z]\b/i,                    // PAN
  /\b[A-Z]{4}0[A-Z0-9]{6}\b/i,                  // IFSC
  /https?:\/\//i,                               // links
];
// Phone, Aadhaar, account numbers: any run of digits/separators holding 10+ digits.
// (Dates like 12-11-2026 have only 8 digits and are kept.)
const longNumber = (s) => (s.match(/[+\d][\d\s().-]*\d/g) || []).some((run) => run.replace(/\D/g, '').length >= 10);
const hasPII = (s) => longNumber(s) || PII_PATTERNS.some((re) => re.test(s));

/** Clean one free-text entry. Returns '' when it must not be stored. */
function cleanText(v, max = CAP.str) {
  if (typeof v !== 'string') return '';
  let s = v
    .replace(/[\u0000-\u001f\u007f]/g, ' ')  // control chars and newlines
    .replace(/[<>{}`]/g, '')                  // no tags, placeholders or code fences in stored text
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || hasPII(s)) return '';
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

function addUnique(list, text, cap) {
  const t = cleanText(text);
  if (!t) return false;
  const k = norm(t);
  if (!k || list.some((x) => norm(x) === k)) return false;
  list.push(t);
  while (list.length > cap) list.shift(); // oldest goes first
  return true;
}

/** Remove by exact (normalised) match, else by unique containment match. */
function removeFuzzy(list, text, keyOf = (x) => x) {
  const k = norm(text);
  if (!k) return false;
  let i = list.findIndex((x) => norm(keyOf(x)) === k);
  if (i < 0) {
    const hits = list.map((x, idx) => [norm(keyOf(x)), idx]).filter(([n]) => n.includes(k) || k.includes(n));
    if (hits.length === 1) i = hits[0][1];
  }
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

// ---------- empty profile ----------

function emptyProfile(now = new Date().toISOString()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    userArchetype: 'UNKNOWN',
    archetypeConfidence: 'low',
    archetypeReason: '',
    locationContext: Object.fromEntries(LOC_KEYS.map((k) => [k, ''])),
    activeAssets: [],
    ventures: [],
    facts: Object.fromEntries(FACT_CATS.map((c) => [c, []])),
    experienceLevel: 'unknown',
    languagePreference: null,
    dynamicLearningLogs: [],
    openThreads: [],
    meta: {
      turns: 0,
      createdAt: now,
      updatedAt: now,
      entryJourney: null,
      signalTally: { NEW_CREATOR: 0, EXISTING_PROVIDER: 0, HYBRID: 0 },
      archetypeHistory: [],
      languageSwitches: 0,
    },
  };
}

/**
 * Validate a profile that came back from the browser. It is untrusted input:
 * anything malformed is dropped, every string is re-cleaned, caps re-applied.
 */
function sanitizeProfile(raw) {
  const p = emptyProfile();
  if (!isObj(raw)) return p;
  try { if (JSON.stringify(raw).length > CAP.json * 2) return p; } catch { return p; }

  p.userArchetype = pick(raw.userArchetype, ARCHETYPES, 'UNKNOWN');
  p.archetypeConfidence = pick(raw.archetypeConfidence, ['low', 'medium', 'high'], 'low');
  p.archetypeReason = cleanText(raw.archetypeReason, 160);
  if (isObj(raw.locationContext)) for (const k of LOC_KEYS) p.locationContext[k] = cleanText(raw.locationContext[k]);
  for (const a of arr(raw.activeAssets)) addUnique(p.activeAssets, a, CAP.assets);
  for (const v of arr(raw.ventures).slice(-CAP.ventures)) {
    if (!isObj(v)) continue;
    const label = cleanText(v.label);
    if (!label) continue;
    p.ventures.push({
      label, kind: pick(v.kind, KINDS, 'other'), stage: pick(v.stage, STAGES, 'idea'),
      firstSeenTurn: int(v.firstSeenTurn), updatedTurn: int(v.updatedTurn),
    });
  }
  if (isObj(raw.facts)) for (const c of FACT_CATS) for (const f of arr(raw.facts[c])) addUnique(p.facts[c], f, CAP.factsPerCat);
  p.experienceLevel = pick(raw.experienceLevel, EXP_LEVELS, 'unknown');
  p.languagePreference = LANGS.includes(raw.languagePreference) ? raw.languagePreference : null;
  for (const l of arr(raw.dynamicLearningLogs).slice(-CAP.logs)) {
    if (!isObj(l)) continue;
    const text = cleanText(l.text);
    if (text) p.dynamicLearningLogs.push({ turn: int(l.turn), type: pick(l.type, LOG_TYPES, 'insight'), text });
  }
  for (const t of arr(raw.openThreads)) addUnique(p.openThreads, t, CAP.threads);

  const m = isObj(raw.meta) ? raw.meta : {};
  p.meta.turns = int(m.turns);
  p.meta.createdAt = isoOr(m.createdAt, p.meta.createdAt);
  p.meta.updatedAt = isoOr(m.updatedAt, p.meta.updatedAt);
  p.meta.entryJourney = ['START', 'IMPROVE'].includes(m.entryJourney) ? m.entryJourney : null;
  if (isObj(m.signalTally)) for (const k of Object.keys(p.meta.signalTally)) p.meta.signalTally[k] = Math.min(int(m.signalTally[k]), 99);
  for (const h of arr(m.archetypeHistory).slice(-CAP.history)) {
    if (isObj(h)) p.meta.archetypeHistory.push({
      turn: int(h.turn), from: pick(h.from, ARCHETYPES, 'UNKNOWN'), to: pick(h.to, ARCHETYPES, 'UNKNOWN'),
      reason: cleanText(h.reason, 160),
    });
  }
  p.meta.languageSwitches = int(m.languageSwitches);
  return p;
}

function arr(v) { return Array.isArray(v) ? v : []; }
function int(v) { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : 0; }
function isoOr(v, d) { return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : d; }

// ---------- merge ----------

/**
 * Merge one turn's profile_update into the profile.
 * @param {object} prev      sanitized profile from the previous turn
 * @param {object} update    `profile_update` from Claude (may be partial or malformed)
 * @param {object} ctx       { replyLanguage, journey, now }
 * @returns {{ profile: object, changes: object }}
 */
function mergeUpdate(prev, update, ctx = {}) {
  const p = JSON.parse(JSON.stringify(prev || emptyProfile()));
  const u = isObj(update) ? update : {};
  const turn = p.meta.turns + 1;
  const changes = { learned: 0, archetypeChanged: false, languageChanged: false, droppedForPrivacy: 0 };
  const count = (ok) => { if (ok) changes.learned++; };

  p.meta.turns = turn;
  p.meta.updatedAt = ctx.now || new Date().toISOString();
  if (!p.meta.entryJourney && ['START', 'IMPROVE'].includes(ctx.journey)) p.meta.entryJourney = ctx.journey;

  // 1. Language preference: follows what we actually replied in (which mirrors the person).
  const lang = LANGS.includes(ctx.replyLanguage) ? ctx.replyLanguage : null;
  if (lang && lang !== p.languagePreference) {
    if (p.languagePreference) { p.meta.languageSwitches++; changes.languageChanged = true; }
    p.languagePreference = lang;
  }

  // 2. Location: only fill parts that are newly mentioned; a new value replaces the old.
  if (isObj(u.location)) for (const k of LOC_KEYS) {
    const raw = u.location[k];
    const v = cleanText(raw);
    if (typeof raw === 'string' && raw.trim() && !v) changes.droppedForPrivacy++;
    if (v && norm(v) !== norm(p.locationContext[k])) { p.locationContext[k] = v; count(true); }
  }

  // 3. Assets: removals first, so a correction ("3 rooms, not 2") lands cleanly.
  for (const a of arr(u.assets_remove)) count(removeFuzzy(p.activeAssets, a));
  for (const a of arr(u.assets_add)) {
    if (typeof a === 'string' && a.trim() && !cleanText(a)) changes.droppedForPrivacy++;
    count(addUnique(p.activeAssets, a, CAP.assets));
  }

  // 4. Facts.
  for (const f of arr(u.facts_remove)) for (const c of FACT_CATS) if (removeFuzzy(p.facts[c], f)) { count(true); break; }
  for (const f of arr(u.facts_add)) {
    if (!isObj(f)) continue;
    const cat = pick(f.category, FACT_CATS, null);
    if (!cat) continue;
    if (typeof f.text === 'string' && f.text.trim() && !cleanText(f.text)) changes.droppedForPrivacy++;
    count(addUnique(p.facts[cat], f.text, CAP.factsPerCat));
  }

  // 5. Ventures (the evidence the archetype is derived from).
  for (const label of arr(u.ventures_remove)) count(removeFuzzy(p.ventures, label, (v) => v.label));
  for (const v of arr(u.ventures_upsert)) {
    if (!isObj(v)) continue;
    const label = cleanText(v.label);
    if (!label) continue;
    const kind = pick(v.kind, KINDS, 'other');
    const stage = pick(v.stage, STAGES, 'idea');
    let existing = p.ventures.find((x) => norm(x.label) === norm(label));
    // Same kind, different wording ("homestay" vs "2-room homestay"): treat as the same venture,
    // so a New Creator whose homestay goes live becomes a Provider, not a false HYBRID.
    if (!existing && kind !== 'other') {
      const sameKind = p.ventures.filter((x) => x.kind === kind);
      if (sameKind.length === 1) existing = sameKind[0];
    }
    if (existing) {
      if (existing.stage !== stage || existing.label !== label) {
        existing.stage = stage; existing.label = label; existing.kind = kind; existing.updatedTurn = turn; count(true);
      }
    } else {
      p.ventures.push({ label, kind, stage, firstSeenTurn: turn, updatedTurn: turn });
      while (p.ventures.length > CAP.ventures) p.ventures.shift();
      count(true);
    }
  }

  // 6. Experience level: only moves when the model sees a reason; "running" ventures imply at least "some".
  const exp = pick(u.experience_level, EXP_LEVELS.concat('unchanged'), 'unchanged');
  if (exp !== 'unchanged' && exp !== p.experienceLevel) { p.experienceLevel = exp; count(true); }
  if (p.experienceLevel === 'unknown' || p.experienceLevel === 'new') {
    if (p.ventures.some((v) => RUNNING_STAGES.includes(v.stage)) && p.experienceLevel !== 'some') {
      p.experienceLevel = 'some';
    }
  }

  // 7. Learning logs: max 2 per turn; evict low-value entries first when full.
  for (const l of arr(u.log_entries).slice(0, CAP.logsPerTurn)) {
    if (!isObj(l)) continue;
    const text = cleanText(l.text);
    if (!text || p.dynamicLearningLogs.some((x) => norm(x.text) === norm(text))) continue;
    p.dynamicLearningLogs.push({ turn, type: pick(l.type, LOG_TYPES, 'insight'), text });
    count(true);
  }
  evictLogs(p.dynamicLearningLogs);

  // 8. Open threads.
  for (const t of arr(u.open_threads_close)) count(removeFuzzy(p.openThreads, t));
  for (const t of arr(u.open_threads_add)) count(addUnique(p.openThreads, t, CAP.threads));

  // 9. Archetype: derived, never just copied from the model.
  const sig = isObj(u.archetype_signal) ? u.archetype_signal : {};
  const before = p.userArchetype;
  applySignal(p, sig, turn);
  const derived = deriveArchetype(p);
  p.userArchetype = derived.archetype;
  p.archetypeConfidence = derived.confidence;
  p.archetypeReason = cleanText(derived.reason, 160);
  if (before !== p.userArchetype) {
    changes.archetypeChanged = true;
    p.meta.archetypeHistory.push({ turn, from: before, to: p.userArchetype, reason: p.archetypeReason });
    while (p.meta.archetypeHistory.length > CAP.history) p.meta.archetypeHistory.shift();
  }

  // Final safety net on size.
  while (JSON.stringify(p).length > CAP.json && p.dynamicLearningLogs.length) p.dynamicLearningLogs.shift();
  return { profile: p, changes };
}

function evictLogs(logs) {
  while (logs.length > CAP.logs) {
    // Remove the oldest entry of the lowest-priority type present.
    for (let t = LOG_KEEP_PRIORITY.length - 1; t >= 0; t--) {
      const i = logs.findIndex((l) => l.type === LOG_KEEP_PRIORITY[t]);
      if (i >= 0) { logs.splice(i, 1); break; }
    }
  }
}

/** Signals only matter while there is no venture evidence. strong = 2 points, weak = 1. */
function applySignal(p, sig, turn) {
  const tally = p.meta.signalTally;
  // The button tapped at the start counts as one weak hint, once.
  if (turn === 1 && p.meta.entryJourney) {
    tally[p.meta.entryJourney === 'START' ? 'NEW_CREATOR' : 'EXISTING_PROVIDER'] += 1;
  }
  const a = pick(sig.archetype, ARCHETYPES, 'UNKNOWN');
  const s = pick(sig.strength, ['strong', 'weak', 'none'], 'none');
  if (a !== 'UNKNOWN' && s !== 'none') tally[a] = Math.min(tally[a] + (s === 'strong' ? 2 : 1), 99);
}

/**
 * Archetype rules, in priority order:
 * 1. Ventures are evidence. Running/paused + idea/planning => HYBRID.
 * 2. Only running/paused => EXISTING_PROVIDER. Only idea/planning => NEW_CREATOR.
 * 3. No ventures yet => the highest signal tally (ties keep the current archetype).
 */
function deriveArchetype(p) {
  const running = p.ventures.filter((v) => RUNNING_STAGES.includes(v.stage));
  const fresh = p.ventures.filter((v) => NEW_STAGES.includes(v.stage));
  const names = (vs) => vs.map((v) => `"${v.label}"`).join(', ');
  if (running.length && fresh.length) {
    return { archetype: 'HYBRID', confidence: 'high', reason: `runs ${names(running)}; starting ${names(fresh)}` };
  }
  if (running.length) return { archetype: 'EXISTING_PROVIDER', confidence: 'high', reason: `runs ${names(running)}` };
  if (fresh.length) return { archetype: 'NEW_CREATOR', confidence: 'high', reason: `starting ${names(fresh)}` };

  const t = p.meta.signalTally;
  const ranked = Object.entries(t).sort((a, b) => b[1] - a[1]);
  const [top, topScore] = ranked[0];
  if (topScore === 0) return { archetype: 'UNKNOWN', confidence: 'low', reason: 'no clues yet' };
  if (ranked[1][1] === topScore && p.userArchetype !== 'UNKNOWN' && t[p.userArchetype] === topScore) {
    return { archetype: p.userArchetype, confidence: 'low', reason: 'mixed clues; keeping current reading' };
  }
  return {
    archetype: top,
    confidence: topScore >= 3 ? 'medium' : 'low',
    reason: 'from what they said so far (no offer described yet)',
  };
}

// ---------- prompt rendering ----------

const PLAYBOOK = {
  NEW_CREATOR: 'New Creator playbook (section 7).',
  EXISTING_PROVIDER: 'Existing Provider playbook (section 8).',
  HYBRID: 'Existing Provider playbook for what already runs, New Creator playbook for the new idea.',
  UNKNOWN: 'Not clear yet: answer usefully and let it emerge.',
};

/** Compact, human-readable block that fills {{LEARNED_CONTEXT}}. */
function renderForPrompt(profile) {
  const p = profile || emptyProfile();
  const empty = !p.meta.turns && !p.ventures.length && !p.activeAssets.length;
  if (empty) return '<learned_context>\nNothing learned yet. This is the start of the conversation.\n</learned_context>';

  const lines = [];
  const add = (label, val) => { if (val && (!Array.isArray(val) || val.length)) lines.push(`${label}: ${Array.isArray(val) ? val.join('; ') : val}`); };

  add('Turns so far', String(p.meta.turns));
  add('Archetype', `${p.userArchetype} (${p.archetypeConfidence} confidence${p.archetypeReason ? `; ${p.archetypeReason}` : ''})`);
  add('How to guide them', PLAYBOOK[p.userArchetype]);
  add('Language they use', p.languagePreference);
  if (p.experienceLevel !== 'unknown') add('Experience', p.experienceLevel);
  const loc = LOC_KEYS.filter((k) => p.locationContext[k]).map((k) => `${k} ${p.locationContext[k]}`);
  add('Place', loc);
  if (p.ventures.length) lines.push('Ventures:\n' + p.ventures.map((v) => `- ${v.label} [${v.kind}, ${v.stage}]`).join('\n'));
  add('Assets they already have', p.activeAssets);
  add('Guests', p.facts.guests);
  add('Constraints', p.facts.constraints);
  add('Local calendar', p.facts.local_calendar);
  add('People involved', p.facts.people);
  add('Goals', p.facts.goals);
  const logsOf = (types) => p.dynamicLearningLogs.filter((l) => types.includes(l.type)).map((l) => l.text);
  add('Worked for them', logsOf(['worked']));
  add('Did not work', logsOf(['did_not_work']));
  add('Tried', logsOf(['tried']));
  add('Preferences', logsOf(['preference']));
  add('Corrections', logsOf(['correction']));
  add('Insights', logsOf(['insight']).slice(-8));
  add('Open threads', p.openThreads);

  return '<learned_context>\n' + lines.join('\n') + '\n</learned_context>';
}

// ---------- language and telemetry helpers ----------

const HINGLISH_MARKERS = new Set(('hai hain ho hoon tha thi kya kaise kaisa kyun kab kahan kitna kitne mera mere meri ' +
  'hamara hamare humara hum aap apna apne ka ke ki ko se mein me par nahi nahin karna karein karu karun chahiye ' +
  'chahta chahti bhi aur lekin agar toh to wala wale wali kuch bahut accha acha theek mehmaan ghar gaon kamra').split(' '));

/** Lightweight guess of the person's language style; used as a fallback and for telemetry only. */
function detectLanguageStyle(text) {
  const s = String(text || '');
  const letters = s.match(/\p{L}/gu) || [];
  if (!letters.length) return null;
  const deva = (s.match(/[ऀ-ॿ]/g) || []).length;
  if (deva / letters.length > 0.3) return 'hi';
  const words = norm(s).split(' ').filter(Boolean);
  const hits = words.filter((w) => HINGLISH_MARKERS.has(w)).length;
  if (hits >= 2 || (words.length <= 3 && hits >= 1)) return 'hinglish';
  return 'en';
}

/** Content-free event for logs/analytics: never includes what the person said. */
function telemetryEvent(profile, changes) {
  return {
    evt: 'turn',
    turn: profile.meta.turns,
    archetype: profile.userArchetype,
    confidence: profile.archetypeConfidence,
    archetypeChanged: changes.archetypeChanged,
    language: profile.languagePreference,
    languageChanged: changes.languageChanged,
    learned: changes.learned,
    droppedForPrivacy: changes.droppedForPrivacy,
    ventures: profile.ventures.map((v) => `${v.kind}:${v.stage}`),
    entryJourney: profile.meta.entryJourney,
  };
}

module.exports = {
  SCHEMA_VERSION, CAP, emptyProfile, sanitizeProfile, mergeUpdate, deriveArchetype,
  renderForPrompt, detectLanguageStyle, telemetryEvent, cleanText,
};
