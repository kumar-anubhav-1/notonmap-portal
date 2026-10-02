# NotOnMap Guide: Invisible Profile & State Architecture (Step 2)

Status: implemented in `lib/profile.js`, wired into `lib/prompt.js` and `api/chat.js`, covered by 21 tests.
The frontend (Step 3) still needs to store and send the profile and show the new reply fields.

## 1. The core decision: Claude reports clues, code keeps the memory

A common design asks the model to rewrite the whole profile every turn. That fails quietly: the model drops fields it forgot to copy, invents details to "complete" the profile, and flips the archetype on a single ambiguous sentence.

So the work is split:

| Who | Does what |
|---|---|
| **Claude** (each turn) | Reads `<learned_context>`, answers, and returns a small `profile_update`: only what is **new or changed** in the latest message, plus an `archetype_signal`. |
| **Server** (`lib/profile.js`) | Validates the update, removes personal identifiers, de-duplicates, applies caps, merges it with fixed rules, and **derives** the archetype from evidence. |
| **Browser** | Stores the profile (localStorage) and sends it back with the next message. |

The person never fills a form, and the memory is predictable, testable and cheap.

## 2. The loop (one turn)

```
Browser ──(messages + profile)──▶ api/chat.js
                                   1. sanitizeProfile(profile)        untrusted input → clean
                                   2. buildSystem(...)                [cached mentor prompt] + [context: renderForPrompt(profile)]
                                   3. Claude (strict tool "respond")  → reply + profile_update
                                   4. normalise(reply)                language fallback, exactly ≤3 follow-ups, SOP clean-up
                                   5. mergeUpdate(profile, update)    rules in section 5
                                   6. log telemetryEvent(...)         no conversation content
Browser ◀──(reply + new profile)──
```

Why the profile lives in the browser for now: the app runs on Vercel serverless functions, which keep no memory between requests, and no database is set up yet. A browser profile costs nothing and keeps data on the person's own phone. Its limits (lost if they clear the browser or switch phones) are accepted for Wave 1. Moving it to a server store later (for example Upstash Redis keyed by an anonymous ID) needs no change to the merge logic.

Because the profile comes from the browser, the server treats it as untrusted: every field is re-validated, and the prompt wraps it in `<learned_context>` with an instruction that it is data, never instructions.

## 3. The stored profile object

```jsonc
{
  "schemaVersion": 1,
  "userArchetype": "HYBRID",              // NEW_CREATOR | EXISTING_PROVIDER | HYBRID | UNKNOWN  (derived)
  "archetypeConfidence": "high",          // low | medium | high
  "archetypeReason": "runs \"3-room homestay\"; starting \"pottery class\"",
  "locationContext": {                     // only what they said; "" = unknown
    "village": "Sitla", "district": "Nainital", "state": "", "region": "Kumaon",
    "terrain": "hills", "climate": "", "access": "road closes in monsoon"
  },
  "activeAssets": ["3 rooms", "kitchen garden"],     // what they ALREADY have (max 25)
  "ventures": [                                       // the evidence for the archetype (max 6)
    { "label": "3-room homestay", "kind": "homestay", "stage": "running", "firstSeenTurn": 1, "updatedTurn": 1 },
    { "label": "pottery class", "kind": "craft_experience", "stage": "idea", "firstSeenTurn": 3, "updatedTurn": 3 }
  ],
  "facts": {                                          // max 8 per category
    "guests": ["Delhi families, Oct-Jan"],
    "constraints": ["water short by April"],
    "local_calendar": [],
    "people": ["son handles WhatsApp", "mother makes clay pots"],   // roles only, never names
    "goals": []
  },
  "experienceLevel": "some",              // unknown | new | some | experienced
  "languagePreference": "hinglish",       // en | hi | hinglish
  "dynamicLearningLogs": [                // micro-insights (max 24, max 2 added per turn)
    { "turn": 2, "type": "worked",  "text": "washroom checklist on wall" },
    { "turn": 3, "type": "insight", "text": "prefers voice notes" }
  ],
  "openThreads": ["price for pottery class"],
  "meta": {                               // hidden telemetry, never shown to Claude except "turns"
    "turns": 3, "createdAt": "…", "updatedAt": "…", "entryJourney": "IMPROVE",
    "signalTally": { "NEW_CREATOR": 0, "EXISTING_PROVIDER": 3, "HYBRID": 2 },
    "archetypeHistory": [
      { "turn": 1, "from": "UNKNOWN", "to": "EXISTING_PROVIDER", "reason": "runs \"3-room homestay\"" },
      { "turn": 3, "from": "EXISTING_PROVIDER", "to": "HYBRID", "reason": "runs …; starting \"pottery class\"" }
    ],
    "languageSwitches": 0
  }
}
```

Your five requested fields are all there (`userArchetype`, `locationContext`, `activeAssets`, `languagePreference`, `dynamicLearningLogs`). Four additions make them work:

- **`ventures`**: each offer the person runs or plans, with a stage. This is what makes HYBRID detectable: an archetype label alone cannot hold "runs a homestay *and* is starting pottery".
- **`facts`**: guests, constraints, local calendar, people and goals, so logs are not a dumping ground.
- **`openThreads`**: things to come back to.
- **`meta`**: telemetry and the audit trail of every archetype change.

Typical size: 1–3 KB of JSON. Hard cap: 12 KB. What Claude reads (rendered text) stays under about 4,000 characters even when full.

## 4. What Claude returns each turn: `profile_update`

It is defined in `prompts/output-schema.json` and enforced with **strict tool use**, so the API guarantees the shape. Every key is always present; empty means "nothing new".

```jsonc
"profile_update": {
  "archetype_signal": { "archetype": "HYBRID", "strength": "strong", "clue": "pottery class shuru karni hai" },
  "ventures_upsert": [{ "label": "pottery class", "kind": "craft_experience", "stage": "idea" }],
  "ventures_remove": [],
  "location": { "village": "", "district": "", "state": "", "region": "", "terrain": "", "climate": "", "access": "" },
  "assets_add": [], "assets_remove": [],
  "facts_add": [{ "category": "people", "text": "mother makes clay pots" }], "facts_remove": [],
  "experience_level": "unchanged",
  "log_entries": [{ "type": "insight", "text": "prefers voice notes" }],
  "open_threads_add": ["price for pottery class"], "open_threads_close": []
}
```

Strict mode cannot enforce "exactly 3" or "at most 2", so the server enforces all counts and caps.

## 5. Merge rules (`mergeUpdate`)

1. **Language**: `languagePreference` follows `reply_language` (the prompt makes Claude mirror the person). Switches are counted.
2. **Location**: a newly mentioned part replaces the old one; empty strings never erase.
3. **Assets and facts**: removals run first, then additions, so a correction ("3 rooms, not 2") lands cleanly. De-duplication ignores case and punctuation and works for Devanagari. Removal matches exactly, or by unique partial match ("pottery" removes "pottery class").
4. **Ventures**: matched by label. If no label matches but exactly one venture has the same `kind`, it is treated as the same venture. This stops "homestay (planning)" plus "2-room homestay (running)" from becoming a false HYBRID when a New Creator goes live.
5. **Experience**: changes only when Claude reports a change, and it is raised to at least `some` once any venture is running.
6. **Logs**: at most 2 new entries per turn, no duplicates, 24 maximum. When full, the oldest low-value entries go first; feedback on advice (`worked`, `did_not_work`, `correction`) is kept longest.
7. **Privacy**: any entry containing a phone, Aadhaar or account number (10+ digits), email or UPI ID, PIN code, PAN, IFSC or a link is **dropped entirely**, and the drop is counted in telemetry. Dates such as 12-11-2026 are kept.
8. **Safety of stored text**: control characters and `< > { } \`` are stripped, and each entry is limited to 90 characters, so nothing stored can act as a prompt tag or placeholder.

## 6. Archetype derivation (the fluidity rules)

The archetype is **derived**, never copied from the model, in this priority order:

| Evidence | Result |
|---|---|
| A venture `running`/`paused` **and** a venture `idea`/`planning` | **HYBRID** (high) |
| Only `running`/`paused` ventures | **EXISTING_PROVIDER** (high) |
| Only `idea`/`planning` ventures | **NEW_CREATOR** (high) |
| No ventures yet | Highest **signal tally**: strong clue = 2 points, weak = 1, the button tapped at the start = 1 (once). Ties keep the current reading. Score ≥3 gives medium confidence, otherwise low. |
| Nothing at all | **UNKNOWN** |

What this gives you:

- **Provider → HYBRID**: the person launches a new, different offer, and the new venture is added while the running one is kept.
- **HYBRID → Provider**: they drop the idea ("pottery wala rehne do"), and the venture is removed.
- **Creator → Provider**: their venture's stage moves to `running` after the first real guests.
- **No flip-flopping**: one ambiguous sentence cannot override concrete evidence, because ventures outrank signals.
- **Not about them**: hypotheticals and "my brother wants to…" produce no venture, so nothing changes.
- **Audit trail**: every change is written to `meta.archetypeHistory` with the turn and reason.

## 7. Clue parser rules (for Claude, in `prompts/base.md` §5)

The full wording is in the prompt. In summary:

- **Running signals**: "my guests", "mere mehmaan", "last season", "booking aayi thi", "reviews", "we charge", "guest ne shikayat ki".
- **Starting signals**: "start karna hai", "shuru karna chahta hoon", "from scratch", "kya log aayenge?", "pehli baar".
- **Have vs want**: "we have a buffalo" is an asset; "we want solar lights" is a goal; "could maybe use the cowshed" is an asset marked "(likely)".
- **Expansion vs new venture**: one more room or better meals is improvement, not a new venture. A different kind of offer is a new venture.
- **Corrections** lead to remove + add + a `correction` log. **Feedback** leads to `worked` / `did_not_work`, then build on it.
- **Evidence only**: anything inferred is marked "(likely)"; nothing is invented to fill a field.
- **Never stored**: identifiers, religion, caste, health, politics, income figures, family conflicts.

## 8. What Claude sees (`renderForPrompt`)

It is compact, labelled plain text inside `<learned_context>`, sent in the **uncached** second system block so it never breaks the prompt cache:

```
<learned_context>
Turns so far: 3
Archetype: HYBRID (high confidence; runs "3-room homestay"; starting "pottery class")
How to guide them: Existing Provider playbook for what already runs, New Creator playbook for the new idea.
Language they use: hinglish
Experience: some
Place: village Sitla; district Nainital; region Kumaon; terrain hills; access road closes in monsoon
Ventures:
- 3-room homestay [homestay, running]
- pottery class [craft_experience, idea]
Assets they already have: 3 rooms; kitchen garden
Guests: Delhi families, Oct-Jan
Constraints: water short by April
People involved: son handles WhatsApp; mother makes clay pots
Worked for them: washroom checklist on wall
Insights: prefers voice notes
Open threads: price for pottery class
</learned_context>
```

## 9. Telemetry (content-free)

Each turn, one JSON line is logged, for example:

```json
{"evt":"turn","turn":3,"archetype":"HYBRID","confidence":"high","archetypeChanged":true,"language":"hinglish",
 "languageChanged":false,"learned":4,"droppedForPrivacy":0,"ventures":["homestay:running","craft_experience:idea"],"entryJourney":"IMPROVE"}
```

It never contains what the person said. It is enough to answer pilot questions such as: how many sessions turn HYBRID, how often people switch language, and whether the profile is learning (`learned` > 0).

## 10. Contract for the frontend (Step 3)

- **Request**: `{ journey, uiLanguage, region?, messages, profile? }`
- **Response**: `{ ok, reply: { reply_language, answer_markdown, next_micro_step, needs_human_verification, follow_ups[≤3], source_ids, sop? }, profile }`
- Save `profile` to `localStorage["nom_profile_v1"]` after every reply and send it with the next request. Wrap every read and write in try/catch: the app must work without storage.
- Show the micro-step heading in the reply language: `en` "Your Next Micro-Step", `hi` "आपका अगला छोटा कदम", `hinglish` "Aapka Agla Chhota Kadam".
- Add a small **"Start fresh / forget me"** control that deletes the stored profile. This is good practice under India's DPDP Act, and useful on shared family phones.
- This is a **breaking change**: `follow_ups_en`, `follow_ups_hi` and `suggest_journey` are gone. Deploy the backend and frontend together.

## 11. Known limits and next steps

- The profile is per browser. Cross-device memory needs a server store and an anonymous ID (later).
- Sensitive categories (religion, caste, health) are kept out by the prompt only; code cannot reliably detect them.
- The rule "same kind means same venture" can merge two genuinely separate homestays. This is rare, and the cost is low (the archetype is unaffected).
- Model choice: test Haiku 4.5 against a larger model on 15–20 scripted conversations before launch. Extraction quality is the main thing to check.

## Step 3 addition: knowledge retrieval and the guide buttons

- `lib/knowledge.js` reads `knowledge/rows_*.json` once per server start and scores rows against the person's last question (plus the previous question when the last one is very short). The best 0 to 5 rows are passed to Claude inside the uncached `<knowledge>` block. Claude treats them as one input among several, never as the only source.
- Rows for another state are down-weighted unless that state is named or matches the profile's `locationContext`.
- Sources stay behind the scenes: the answer never says "according to a report". `source_ids` returned to the browser are filtered to rows that were actually retrieved, and the server log records only row IDs (no conversation text).
- The guide (`sop`) is turned into a two-colour print layout by the browser. Download PDF and Print use the same routine (the print dialog's "Save as PDF"). WhatsApp shares the steps as plain text.
- Page number and the NOM footer use CSS page margin boxes, which Chrome and Edge support. Other browsers print the guide without those two items.
