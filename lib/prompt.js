'use strict';
// Builds the system prompt as two blocks:
//   1. the stable mentor instructions (cached by the Claude API), and
//   2. the per-turn context (portal settings + learned context + knowledge), not cached,
// so the changing profile never breaks the prompt cache.
const fs = require('fs');
const path = require('path');
const { renderForPrompt } = require('./profile');
const store = require('./store');

const ROOT = path.join(__dirname, '..', 'prompts');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CONTEXT_HEADING = '# Context from the portal';

// CACHE_TTL=1h keeps the big instruction block warm between slow, spread-out visits (costs a little more to write, far less to read).
const CACHE_CONTROL = process.env.CACHE_TTL === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };

let cache = null;
function load() {
  if (cache) return cache;
  const journeysFile = JSON.parse(read('journeys.json'));
  const baseRaw = read('base.md');
  // Everything above the first "---" line is notes for humans, not part of the prompt.
  const base = baseRaw.includes('\n---\n') ? baseRaw.split('\n---\n').slice(1).join('\n---\n') : baseRaw;
  const cut = base.indexOf(CONTEXT_HEADING);
  if (cut < 0) throw new Error(`prompts/base.md must contain "${CONTEXT_HEADING}"`);
  const schema = JSON.parse(read('output-schema.json'));
  const tool = { name: schema.name, description: schema.description, strict: schema.strict === true, input_schema: schema.input_schema };
  cache = { journeysFile, stable: base.slice(0, cut).trim(), contextTemplate: base.slice(cut).trim(), tool };
  return cache;
}

// journeys.json plus any settings saved from /admin.html. A journey can only be switched on if it is
// marked "ready": true (its guidance exists in the prompt), so a click can never launch half-built content.
function allJourneys() {
  const ov = store.getOverrides();
  return load().journeysFile.journeys.map((j) => {
    const o = ov[j.code];
    if (!o) return j;
    return {
      ...j,
      live: j.ready && typeof o.live === 'boolean' ? o.live : j.live,
      order: o.order !== undefined ? o.order : j.order,
      label: { ...j.label, ...(o.label || {}) },
      hint: { ...j.hint, ...(o.hint || {}) },
    };
  });
}
function liveJourneys() {
  return allJourneys().filter((j) => j.live);
}

/**
 * @returns {Array|null} Claude `system` blocks, or null for an unknown/non-live journey.
 */
function buildSystem({ journeyCode, uiLanguage, region, profile, knowledge }) {
  const { stable, contextTemplate } = load();
  const journey = liveJourneys().find((j) => j.code === journeyCode);
  if (!journey) return null;
  const lang = uiLanguage === 'hi' ? 'hi' : 'en';
  const regionText = region ? String(region).replace(/[<>{}\n\r]/g, ' ').slice(0, 60).trim() : '';
  const context = contextTemplate
    .replace(/\{\{UI_LANGUAGE\}\}/g, lang)
    .replace(/\{\{JOURNEY\}\}/g, journey.code)
    .replace(/\{\{REGION\}\}/g, regionText || 'not set')
    .replace(/\{\{KNOWLEDGE\}\}/g, () => knowledge || 'None for this message.')
    .replace(/\{\{LEARNED_CONTEXT\}\}/g, () => renderForPrompt(profile));
  return [
    { type: 'text', text: stable, cache_control: CACHE_CONTROL },
    { type: 'text', text: context },
  ];
}

function publicConfig() {
  const { journeysFile } = load();
  return {
    notSureGoesTo: journeysFile.not_sure_goes_to,
    journeys: allJourneys()
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(({ code, live, label, hint, icon, starters }) => ({ code, live, label, hint, icon, starters: live ? starters : [] })),
  };
}

module.exports = { load, buildSystem, publicConfig, liveJourneys, allJourneys };
