'use strict';
const { buildSystem, load } = require('../lib/prompt');
const { checkLimits, pilotCodeOk, tooManyMisses, noteMiss } = require('../lib/limits');
const { loadOverrides } = require('../lib/store');
const { record } = require('../lib/analytics');
const { retrieve, renderKnowledge } = require('../lib/knowledge');
const { sanitizeProfile, mergeUpdate, detectLanguageStyle, telemetryEvent, cleanText } = require('../lib/profile');

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = parseInt(process.env.MAX_OUTPUT_TOKENS || '3000', 10);
const MAX_USER_CHARS = 1500;
const MAX_HISTORY = 8; // the profile carries long-term memory, so recent turns are enough
const LANGS = ['en', 'hi', 'hinglish'];

// Keep only well-formed, recent turns; first must be a user turn; alternate roles.
function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const m of raw.slice(-MAX_HISTORY)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, m.role === 'user' ? MAX_USER_CHARS : 4000);
    if (!content) continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += '\n' + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') return null;
  return out;
}

const EMPTY_UPDATE = {
  archetype_signal: { archetype: 'UNKNOWN', strength: 'none', clue: '' },
  ventures_upsert: [], ventures_remove: [],
  location: { village: '', district: '', state: '', region: '', terrain: '', climate: '', access: '' },
  assets_add: [], assets_remove: [], facts_add: [], facts_remove: [],
  experience_level: 'unchanged', log_entries: [], open_threads_add: [], open_threads_close: [],
};

function mockReply(journey, lang, ids) {
  const hi = lang === 'hi';
  return {
    reply_language: hi ? 'hi' : 'en',
    answer_markdown: hi
      ? 'यह एक **डेमो जवाब** है। असली जवाब के लिए Claude API कुंजी जोड़ें।\n\n- मेहमान के आने से पहले कमरा साफ़ करें।\n- पीने का साफ़ पानी रखें।\n- घर के नियम सरल शब्दों में बताएँ।'
      : 'This is a **demo answer**. Add your Claude API key for real answers.\n\n- Clean the room before guests arrive.\n- Keep clean drinking water ready.\n- Explain the house rules in simple words.',
    next_micro_step: hi ? 'आज अपने सबसे अच्छे कमरे की दिन की रोशनी में तीन फ़ोटो खींचें।' : 'Take three daylight photos of your best room today.',
    needs_human_verification: false,
    follow_ups: hi
      ? ['शौचालय की सफ़ाई की सूची दो', 'कमरे का दाम कैसे तय करूँ?', 'पहले मेहमान से क्या बोलूँ?']
      : ['Give me a washroom checklist', 'How do I set my room price?', 'What do I say to my first guest?'],
    profile_update: {
      ...EMPTY_UPDATE,
      archetype_signal: { archetype: journey === 'START' ? 'NEW_CREATOR' : 'EXISTING_PROVIDER', strength: 'weak', clue: 'demo' },
      assets_add: ['spare room (demo)'],
    },
    source_ids: (ids || []).slice(0, 2),
    sop: hi ? {
      title: 'शौचालय की सफ़ाई', subtitle: 'मेहमान के आने से पहले तैयार करें', purpose: 'हर मेहमान को साफ़, सूखा और सुरक्षित शौचालय देना।',
      required_items: ['रबर के दस्ताने', 'सफ़ाई का घोल और ब्रश', 'पोछा और कपड़ा', 'साबुन, तौलिया, टॉयलेट पेपर', 'ढकी हुई कूड़ेदानी', 'पानी का जग'],
      steps: [
        { heading: 'हवा आने दें', action: 'खिड़की खोलें या पंखा चलाएँ। काम करते समय चालू रखें।' },
        { heading: 'दस्ताने पहनें', action: 'दस्ताने पहनें और सारा सामान पास रखें।' },
        { heading: 'कूड़ा निकालें', action: 'कूड़ा निकालें और हैंडल, नल और फ़्लश बटन पोंछें।' },
        { heading: 'रगड़कर साफ़ करें', action: 'शौचालय, बेसिन और फ़र्श रगड़ें, पानी से धोएँ और पोछे से सुखाएँ।' },
        { heading: 'सामान रखें', action: 'साबुन, टॉयलेट पेपर, साफ़ तौलिया और पानी का जग रखें।' },
      ],
      safety_notes: ['अलग-अलग सफ़ाई के घोल कभी न मिलाएँ।', 'सफ़ाई का सामान बच्चों से दूर रखें।'],
      completion_checks: ['नल और हैंडल सूखे और चमकदार हैं।', 'फ़र्श सूखा है और बदबू नहीं है।', 'साबुन, तौलिया और पानी रखा है।'],
      next_action: 'आज ही करें और हर डिब्बे पर निशान लगाएँ।', filename_slug: 'washroom-cleaning',
    } : {
      title: 'Washroom Cleaning', subtitle: 'Get it ready before your guests arrive', purpose: 'Give every guest a washroom that is clean, dry and safe.',
      required_items: ['Rubber gloves', 'Toilet cleaner and brush', 'Cloth and mop', 'Soap, toilet paper, clean towel', 'Covered bin with bag', 'Jug or mug of water'],
      steps: [
        { heading: 'Let air in', action: 'Open the window or switch on the exhaust fan. Keep it on while you work.' },
        { heading: 'Put on gloves', action: 'Wear rubber gloves. Keep cleaner, brush, mop and a bin bag within reach.' },
        { heading: 'Empty the bin', action: 'Take out the waste. Wipe the door handle, tap, flush button and light switch.' },
        { heading: 'Scrub and rinse', action: 'Scrub the toilet, basin and floor, rinse well and mop the floor dry so nobody slips.' },
        { heading: 'Restock', action: 'Place toilet paper, soap, a clean towel, a covered bin and a jug of water.' },
        { heading: 'Last look', action: 'Remove gloves, wash hands with soap, then check the room from the door like a guest.' },
      ],
      safety_notes: ['Never mix cleaning liquids. Mixing can release harmful fumes.', 'Keep cleaners away from children and out of the guest area.'],
      completion_checks: ['Wipe the tap, handle and flush button until they are dry and shining.', 'Check that the floor is dry and has no bad smell.', 'Confirm that soap, toilet paper, a towel and water are in place.'],
      next_action: 'Do this today and tick each box. Then keep this page on the washroom door.', filename_slug: 'washroom-cleaning',
    },
  };
}

const MAX_BODY_BYTES = 60 * 1000;     // a normal turn is a few KB; this stops oversized or abusive posts
const UPSTREAM_TIMEOUT_MS = 24 * 1000; // Vercel stops the function at 30 s (vercel.json), so we give up first and answer cleanly
const RETRY_BEFORE_MS = 12 * 1000;     // retry a busy/overloaded API once, but only if there is still time

// Real client address. Vercel sets x-vercel-forwarded-for itself, so it cannot be faked by the visitor.
function clientIp(req) {
  const h = req.headers || {};
  const v = h['x-vercel-forwarded-for'] || h['x-real-ip'] || (h['x-forwarded-for'] ? String(h['x-forwarded-for']).split(',')[0] : '');
  return String(v || (req.socket && req.socket.remoteAddress) || 'unknown').trim().slice(0, 64);
}

async function callClaude(system, messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { const e = new Error('no key'); e.code = 'server_config'; throw e; }
  const started = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), Math.max(3000, UPSTREAM_TIMEOUT_MS - (Date.now() - started)));
    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...(process.env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID.trim() } : {}),
        },
        body: JSON.stringify({
          model: MODEL, max_tokens: MAX_TOKENS, system,
          tools: [load().tool], tool_choice: { type: 'tool', name: 'respond' }, messages,
        }),
      });
      if (!upstream.ok) {
        const retryable = [429, 500, 502, 503, 529].includes(upstream.status);
        console.error('Claude API error', upstream.status, (await upstream.text()).slice(0, 600));
        if (retryable && attempt === 0 && Date.now() - started < RETRY_BEFORE_MS) { await new Promise((r) => setTimeout(r, 900)); continue; }
        const e = new Error('upstream ' + upstream.status); e.code = 'upstream'; throw e;
      }
      const data = await upstream.json();
      if (data.stop_reason === 'max_tokens') console.error('Reply cut off at max_tokens');
      const block = (data.content || []).find((b) => b.type === 'tool_use');
      const u = data.usage || {};
      return {
        raw: block && block.input,
        usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 },
      };
    } catch (err) {
      if (err && err.code) throw err;
      const timedOut = err && err.name === 'AbortError';
      console.error(timedOut ? 'Claude API timeout' : 'Claude API network error', err && err.message);
      if (!timedOut && attempt === 0 && Date.now() - started < RETRY_BEFORE_MS) { await new Promise((r) => setTimeout(r, 600)); continue; }
      const e = new Error(timedOut ? 'timeout' : 'network'); e.code = 'upstream'; throw e;
    } finally { clearTimeout(timer); }
  }
  const e = new Error('exhausted'); e.code = 'upstream'; throw e;
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const declared = parseInt((req.headers && req.headers['content-length']) || '0', 10);
  if (declared > MAX_BODY_BYTES) return res.status(413).json({ ok: false, error: 'too_large' });
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const ip = clientIp(req);

  // Wrong codes are counted per address, so a pilot code cannot be guessed by trying again and again.
  if (tooManyMisses(ip)) return res.status(429).json({ ok: false, error: 'rate_limit' });
  if (!pilotCodeOk(req.headers['x-pilot-code'])) { noteMiss(ip); return res.status(401).json({ ok: false, error: 'code' }); }

  const lim = checkLimits(ip);
  if (!lim.ok) return res.status(429).json({ ok: false, error: lim.code });

  const messages = cleanMessages(body.messages);
  if (!messages) return res.status(400).json({ ok: false, error: 'bad_request' });

  await loadOverrides(); // journey settings saved from /admin.html (cached for 30 s; no-op without storage)

  const t0 = Date.now();
  const uiLanguage = body.uiLanguage === 'hi' ? 'hi' : 'en';
  const journeyCode = String(body.journey || '').slice(0, 30);
  // The profile lives in the browser and comes back each turn. It is untrusted: re-validate it.
  const profile = sanitizeProfile(body.profile);
  // Retrieve a few matching rows. Short follow-ups ("and in winter?") borrow the previous user turn.
  const userTurns = messages.filter((m) => m.role === 'user');
  const lastUser = userTurns[userTurns.length - 1].content;
  const prevUser = userTurns.length > 1 ? userTurns[userTurns.length - 2].content : '';
  const query = lastUser.length < 40 && prevUser ? prevUser + ' ' + lastUser : lastUser;
  const lc = profile.locationContext || {};
  let hits = [];
  try { hits = retrieve(query, { state: lc.state || lc.region || '' }); } catch (e) { console.error('retrieve failed', e && e.message); }
  const system = buildSystem({
    journeyCode, uiLanguage, region: body.region, profile,
    knowledge: hits.length ? renderKnowledge(hits) : undefined,
  });
  if (!system) return res.status(400).json({ ok: false, error: 'journey' });

  const fallbackLang = profile.languagePreference || detectLanguageStyle(lastUser) || uiLanguage;
  const kbIds = hits.map((h) => h.id);
  const fail = async (status, error) => {
    await record({ journey: journeyCode, lang: uiLanguage, ok: false, error, ms: Date.now() - t0, kb: kbIds, model: MODEL });
    return res.status(status).json({ ok: false, error });
  };

  let raw, usage;
  if (process.env.MOCK === '1') {
    await new Promise((r) => setTimeout(r, 400));
    raw = mockReply(journeyCode, uiLanguage, kbIds);
  } else {
    try { ({ raw, usage } = await callClaude(system, messages)); }
    catch (err) { return err && err.code === 'server_config' ? fail(500, 'server_config') : fail(502, 'upstream'); }
  }

  const reply = normalise(raw, fallbackLang);
  if (!reply) { console.error('Unusable reply'); return fail(502, 'upstream'); }
  const allowed = new Set(kbIds);
  reply.source_ids = reply.source_ids.filter((x) => allowed.has(x));

  // Memory: merge only the new clues into the stored profile with fixed rules.
  const { profile: nextProfile, changes } = mergeUpdate(profile, raw.profile_update, {
    replyLanguage: reply.reply_language, journey: journeyCode,
  });
  console.log(JSON.stringify(telemetryEvent(nextProfile, changes))); // content-free
  await record({ journey: journeyCode, lang: reply.reply_language, ok: true, ms: Date.now() - t0, kb: kbIds, sop: Boolean(reply.sop), verify: reply.needs_human_verification, usage, model: MODEL });

  return res.status(200).json({ ok: true, reply, profile: nextProfile });
}

// Whatever goes wrong inside, the visitor gets a clean JSON answer, never a raw server error page.
module.exports = async (req, res) => {
  try { await handle(req, res); }
  catch (err) {
    console.error('chat crashed', err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err);
    if (!res.headersSent) { try { res.status(500).json({ ok: false, error: 'default' }); } catch { /* connection already closed */ } }
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch { return {}; } }

// Defensive clean-up so a slightly malformed reply never breaks the page.
function normalise(input, fallbackLang) {
  if (!input || typeof input.answer_markdown !== 'string' || !input.answer_markdown.trim()) return null;
  const str = (v) => (typeof v === 'string' ? v : '');
  const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const lang = LANGS.find((l) => l === String(input.reply_language || '').toLowerCase()) || fallbackLang;
  const out = {
    reply_language: lang,
    answer_markdown: input.answer_markdown,
    next_micro_step: str(input.next_micro_step).trim(),
    needs_human_verification: Boolean(input.needs_human_verification),
    follow_ups: list(input.follow_ups).map((f) => f.trim().slice(0, 80)).slice(0, 3),
    source_ids: list(input.source_ids).map((s) => cleanText(s, 40)).filter(Boolean).slice(0, 10),
  };
  const s = input.sop;
  if (s && typeof s === 'object' && str(s.title) && Array.isArray(s.steps) && s.steps.length) {
    out.sop = {
      title: str(s.title), subtitle: str(s.subtitle), purpose: str(s.purpose),
      required_items: list(s.required_items),
      steps: s.steps.filter((x) => x && typeof x === 'object').map((x) => ({ heading: str(x.heading), action: str(x.action) })).filter((x) => x.action).slice(0, 15),
      safety_notes: list(s.safety_notes), completion_checks: list(s.completion_checks),
      next_action: str(s.next_action),
      filename_slug: (str(s.filename_slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'notonmap-guide').slice(0, 50),
    };
  }
  return out;
}

module.exports.normalise = normalise;
module.exports.cleanMessages = cleanMessages;
