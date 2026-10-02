# Rural Tourism Mentor portal

A phone-friendly guide for village hosts in India. Hosts pick a journey, ask questions in English, Hindi or Hinglish, and get short practical answers, print-ready guides (PDF), and WhatsApp sharing.

## What is inside
- `public/` the web page, styled like WhatsApp (chat-list home, bubbles, rounded type box with mic and send, avatar menu, thin yellow frame, teal shades, one orange action button)
- `api/chat.js` the chat backend; `api/config.js` the home-screen settings
- `lib/knowledge.js` finds the 0 to 5 best matching rows from `knowledge/` for each question
- `lib/profile.js` the invisible memory (stored only in the host's browser)
- `prompts/base.md` the master instructions; `prompts/modules/` one file per journey; `prompts/journeys.json` which journeys are live
- `knowledge/` 538 India-focused rows and 187 sources (unreviewed AI research: see `knowledge/README.md`)
- `test/` run with `npm test`

## Try it on your computer
1. Install Node 18 or newer.
2. `npm run dev:mock` and open http://localhost:3000 (demo answers, no key needed).
3. For real answers: set `ANTHROPIC_API_KEY` and run `npm run dev`.

## Put it online (GitHub + Vercel)
1. Upload this whole folder to a new GitHub repository (keep the folder structure).
2. In Vercel choose "Add New Project", pick the repository, keep the defaults.
3. Add `ANTHROPIC_API_KEY` (and optionally `PILOT_CODE`) under Environment Variables, then deploy.
4. Open the link on a phone, ask a question, and tap Download PDF on a guide.

## Admin page and usage numbers (optional, free)
1. Make a free Redis database at upstash.com and copy its "REST URL" and "REST Token".
2. In Vercel add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `ADMIN_TOKEN` (a long phrase you choose), then redeploy.
3. Open `your-site/admin.html`, enter the token. You can switch journeys on or off, rename them (English and Hindi), and see questions answered, errors, average time, guides made, how often the knowledge bank matched, and instruction-cache savings.
4. Without Upstash everything still works. Usage is printed as one JSON line per question in Vercel > Logs, and the admin page says storage is not connected. Only counts are kept: never what a host typed or what the guide replied.
5. A journey can only be switched on if its guidance exists (`"ready": true` in `prompts/journeys.json`).

## Safety built in
- 24-second limit on the Claude call, with one retry when the service is busy; clear messages instead of error pages.
- Wrong pilot codes or admin tokens are counted per visitor; after 10 misses in an hour that visitor is paused.
- Requests over 60 KB are refused; the memory profile is re-checked on every request; knowledge rows are cleaned before they reach the model; invented source IDs are dropped.
- Per-visitor hourly limit and a daily cap (`HOURLY_LIMIT_PER_IP`, `DAILY_REQUEST_CAP`). These counters reset when Vercel restarts a server instance, so also set a monthly spending limit in the Claude Console.
- Browser protections (no outside scripts, no framing) are set in `vercel.json`.
- Setting `CACHE_TTL=1h` keeps the large instruction block cached for an hour, which saves cost when visits are spread out.

## Things to know
- PDF buttons use the browser's print dialog ("Save as PDF"). The footer and page number need Chrome or Edge.
- Edit `prompts/base.md` to change how the guide talks. Edit `knowledge/rows_*.json` to correct facts, then redeploy.
- Rules, fees and forms in the knowledge bank change often. Have a local expert review the rows marked `needs_verification` before wide launch.
- The guide opens the browser's print dialog for Download PDF; hosts choose "Save as PDF". There is no separate Print button.
- Not included: the old `modules/` folder and the legacy backend test.
