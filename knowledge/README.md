# Rural Tourism Mentor: Knowledge Bank v1.0-draft (built 2 Oct 2026)

One trusted source among several. The AI mentor consults it first, then adds its own knowledge and research. It is NOT the only universe of answers.

## What is in it
- **538 rows** (question, plain-language answer, 1-3 actions, caution, context to ask, sources) and **187 sources** (30 original international sources S01-S30 + 157 new, mostly Indian official sources).
- Seven domains (files `knowledge/rows_*.json`):

| Domain | Rows | What it covers |
|---|---|---|
| food_safety (IN-FOOD) | 74 | FSSAI registration/licence bands, hygiene, handlers, labelling, home kitchens, food poisoning |
| homestay_and_schemes (IN-STAY) | 57 | Homestay registration (16 states), Ministry of Tourism schemes, rural tourism programmes, guides |
| legal_safety_guest_rules (IN-LAW) | 85 | Foreign-guest reporting, ID/registers, privacy (DPDP), GST, fire/electrical/LPG safety, emergencies, child and women safety, permits, land and wildlife law |
| environment_water_waste_energy (IN-ENV) | 75 | Waste rules (SWM Rules 2026), plastic, water quality/testing, sanitation, energy, eco-tourism, hazards |
| livelihood_enterprise_finance (IN-LIV) | 70 | Udyam, SHGs, MUDRA, PM Vishwakarma, skills, markets, digital basics, fair benefit-sharing |
| experience_design_practice (RT-DES) | 101 | From asset to product, pricing method, marketing, guest types, operations, community design |
| activity_experiences (RT-ACT) | 76 | Farm, cooking, craft, walks, folk culture, nature, trekking/adventure, wellness, volunteering, events, seasons |

Also: `sources.json` (all 187 sources with URL, issuer, what it covers, how it was read).

## IMPORTANT: status and limits (read before using)
1. **AI-researched, no human expert has reviewed any row.** Every row has `review_status: ai_researched_unreviewed`.
2. **Pages were read through a summarising fetch tool.** Most government sites blocked direct download, so original gazette/PDF text was not fully reviewed for most sources. "official page read" means "read via summary of an official page".
3. **Confidence:** high 98, medium 294, low 146. `low` rows teach the method and refer the host to the authority; they must not be presented as verified rules.
4. **Volatile figures:** 80 rows contain fees, limits, subsidies or percentages (`volatile_figures: true`). Show them only with the as-of date and "confirm the current figure".
5. **State rules are not national rules.** Check `scope`.
6. Maintainer spot-check on 2 Oct 2026 against primary pages: FSSAI reform of 13 Mar 2026 (registration limit Rs 12 lakh -> Rs 1.5 crore, State licence up to Rs 50 crore, no renewal, from 1 Apr 2026): CONFIRMED in the FSSAI press release. SWM Rules 2026 (in force 1 Apr 2026; bulk generator thresholds; four-stream segregation): CONFIRMED in the PIB release. Form-III within 24 hours for foreign guests under the Immigration and Foreigners Act 2025: corroborated by a state-government notice and a news article citing MHA notification F.No.25022/11/2025-F.I dated 1 Sep 2025; the Gazette text itself was NOT read. The reported Rs 50,000 penalty rests on one news article: do not state it to hosts. GST (5% up to Rs 7,500 per room per night, 18% above): secondary sources only. No national "July 2025 homestay guideline" was found: the Ministry document read is a NITI Aayog report recommending a model state policy.

## Row fields
id, domain, topic, entity (homestay/farmstay/kitchen/guide/experience/craft/village_enterprise/transport/community/trainer), question_en, search_terms (English + Hindi in Devanagari + Roman Hindi, for retrieval), answer, actions, caution, context_needed (ask the host first), scope, source_ids, evidence, verified_how, needs_verification, verify_with, confidence, volatile_figures, figures_as_of, review_status, last_checked.

## How the app/AI should use it (decided 2 Oct 2026)
- Retrieve the 3-5 closest rows per question (match on question_en + search_terms + topic) and give them to the AI as a checked starting point. The AI uses them first where they fit, then adds its own knowledge for the host's own situation. The bank is a helper, not the universe.
- **Keep sources behind the scenes.** The host sees mentor-style practical guidance, like the training manual. No "based on" lines, report names, row IDs or "government data" wording. `source_ids` are stored for the team's records only.
- Name an official rule or office in plain words ONLY when the host must act on it (licence, registration, reporting, permit), e.g. "report foreign guests on the FRRO portal within 24 hours". Name a standard or source only if the host asks where it comes from.
- `confidence` high/medium rows can be used as facts. `low` rows give the method and who to ask, never a stated rule. `scope` must be respected (state rules are not national rules).
- `volatile_figures: true` rows: give the figure only when the host needs it to decide, with the as-of date and "please confirm the current figure with [office]". Never quote penalties unless a row states them with a source.
- If `context_needed` decides the answer (state, turnover, guest nationality), ask at most one short question after giving something useful.
- Do not repeat internal wording about what was or was not verified; say it naturally ("rules differ by state, please check with your district tourism office").
- The matching instructions are in `prompts/base.md` v3.2, section 11 and section 7 step 4.

## Known gaps (from the research notes, `knowledge/RESEARCH_NOTES.md`)
- FSSAI: homestay/cooking-class/farm-meal categories not confirmed; penalty amounts disputed between sources; FoSTaC applicability and fees; packaged water, raw milk, honey/pickle standards.
- Homestay registration: current Ministry of Tourism guideline text not read; Odisha, Telangana, J&K, Assam, Tripura, Manipur, Nagaland, Arunachal, MP, Chhattisgarh, Rajasthan, Mizoram, Tamil Nadu, Jharkhand have no row of their own; Himachal, Uttarakhand, UP, Sikkim, Meghalaya, Bihar, West Bengal rest on news/aggregator pages.
- Law: Form-III and penalties (Gazette), Protected/Restricted Area and Inner Line Permit status, POCSO and child-labour wording, DPDP applicability to micro hosts, state fire NOC and alcohol rules, helplines 181/1098/108.
- Environment: whether SWM Rules 2026 ban open burning and set fines for small hosts; CGWA groundwater NOC for small homestays; IS 10500 limits; Sikkim/Goa/Kerala/Meghalaya plastic and bottled-water rules.
- Livelihood: whether PMEGP, PMFME, Stand-Up India are open to new applications; PM Vishwakarma eligibility; Craftmark/Handloom Mark process; legal forms for community groups.
- Activities: no national group-size/age/guide-ratio numbers for adventure; rafting/camping/caving norms; orphanage-visit law; tiger-reserve tourism orders.

## Expert review plan
`expert_review_queue.csv` (438 rows needing verification, lowest-confidence and figure-bearing rows first, with source URLs and columns for reviewer, verdict, correction, date). Suggested reviewers: a food-safety officer or FSSAI-trained consultant (food), a tourism-department officer or experienced registered homestay owner (stay, experience design), a lawyer with hospitality/immigration experience (law), an environment/waste officer (env), a bank/DAY-NRLM/MSME officer (livelihood), a certified mountaineering/adventure instructor and wilderness first-aid trainer (activities). After review: set `review_status` to `expert_reviewed`, record reviewer and date, correct the row.

## Keeping it current
Rules in this bank changed in 2024-2026 and will change again. Re-check every 3 months: FSSAI notices, SWM Rules, Immigration/Form-III rules, GST rates, DPDP phase dates (main duties reported for mid-May 2027), scheme status, state homestay policies, helpline numbers.
