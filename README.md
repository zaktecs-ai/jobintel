# JobIntel

Live LinkedIn job intelligence — a resumable, self-healing crawler with a streaming UI.

**Live:** https://jobintel-pi.vercel.app

## What it does

Give it a keyword, a location and a few filters; it streams live postings from LinkedIn's public
guest job index straight into the browser — ten at a time — then optionally reads every posting's
full detail page for description, seniority, employment type, industry and salary hints.

## Architecture

```
app/page.jsx            control panel + results rail (client)
app/api/scrape/route.js SSE endpoint; plans the run, owns the time budget
lib/scraper.js          parser, governor, pagination, resume, detail fetching
lib/freshness.js        one source of truth for "how old is this posting"
lib/useJobStream.js     EventSource client; merges, resumes, stops cleanly
lib/verify*.mjs         offline, freshness and live verification harnesses
```

## Reliability design

| Concern | How it is handled |
| --- | --- |
| LinkedIn 429 | AIMD governor: gap widens ×1.8 per throttle (cap 20s) and recovers −120ms per success, plus jitter and an exponential cooldown |
| Stalled connection | every request is capped by `AbortSignal.timeout(15s)`; a hang retries instead of freezing the run |
| Empty offset shell | the same offset is retried once after a pause; only a confirmed second empty steps forward |
| Vercel 300s cap | the run plans to 235s and returns a resumable cursor; the client reconnects automatically (max 6 passes) |
| Re-sent jobs | dedupe by job id across pages, resumes and detail upgrades |
| Parser drift | `job-criteria` and `description__job-criteria` both matched; a `<li>` fallback pairs header/value when classes change |
| Quiet stream | a `: ping` comment frame every 12s keeps proxies from cutting the connection |
| Missing fields | every field degrades to `''`, never `undefined`; cards render with a company initial when the logo 404s |

## Filters

`f_TPR` (any / 24h / week / month), `f_E` (six seniority tiers), `f_WT` (on-site / remote / hybrid),
plus client-side text, seniority, 3-day freshness and remote filters.

Freshness is verified against LinkedIn's own dates: a 24h filter returns only cards ≤1 day old, a
week filter ≤7 days — measured on real responses, not assumed.

## Verification

```bash
node lib/verify.mjs            # 40 parser / URL / salary / governor assertions
node lib/verify-freshness.mjs  # 30 date + label + window assertions
node lib/verify-live.mjs "software engineer" "United States"   # live filter audit
```

## Local development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

## Notes

LinkedIn's guest index is public and rate-limited. Pacing defaults to 1400 ms between requests;
raise it if you see sustained 429s. This project reads public postings only — it does not log in,
store personal data, or bypass an authentication wall.
