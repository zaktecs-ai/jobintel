/**
 * LIVE freshness audit — the one that matters.
 *
 * Asks LinkedIn with f_TPR=r86400 (last 24h) and r604800 (last week), then checks every returned
 * card's own postedAt against the requested window. A passing result means the filter is honoured
 * end-to-end, not just passed in the URL.
 */

import { buildSearchUrl, parseSearchPage, Governor } from './scraper.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(params, gov) {
  const url = buildSearchUrl(params);
  const wait = gov.nextDelay();
  if (wait) await sleep(wait);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Referer: 'https://www.linkedin.com/jobs/' },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 429) {
    gov.on429();
    return { status: 429, cards: [] };
  }
  if (!res.ok) return { status: res.status, cards: [] };
  gov.onSuccess();
  return { status: res.status, cards: parseSearchPage(await res.text()) };
}

function daysAgo(iso) {
  const t = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 86400000;
}

const gov = new Governor({ minGapMs: 1500, jitterMs: 700 });
const keyword = process.argv[2] || 'software engineer';
const location = process.argv[3] || 'United States';

console.log(`\nLive freshness audit — "${keyword}" in ${location}\n`);

const scenarios = [
  { key: 'day', windowDays: 1, pages: 3 },
  { key: 'week', windowDays: 7, pages: 3 },
  { key: 'any', windowDays: null, pages: 2 },
];

let totalChecks = 0;
let violations = 0;

for (const sc of scenarios) {
  const seen = new Map();
  for (let p = 0; p < sc.pages; p += 1) {
    const { status, cards } = await fetchPage(
      { keywords: keyword, location, datePosted: sc.key, experience: [], remote: '', pageIndex: p },
      gov
    );
    if (status !== 200) {
      console.log(`  [${sc.key}] page ${p}: HTTP ${status} (skipped)`);
      continue;
    }
    for (const c of cards) if (!seen.has(c.id)) seen.set(c.id, c);
  }

  const all = [...seen.values()];
  const dated = all.filter((c) => c.postedAt);
  const ages = dated.map((c) => daysAgo(c.postedAt)).filter((x) => x !== null);
  // "any" has no window: nothing can violate it.
  const window = sc.windowDays ?? Infinity;
  const inWindow = ages.filter((a) => a <= window).length;
  const outOfWindow = ages.length - inWindow;

  // LinkedIn uses whole-day buckets, so a "24h" filter can legitimately include yesterday's date.
  const tolerance = sc.windowDays === null ? Infinity : 1;
  const bad = ages.filter((a) => a > window + tolerance);

  totalChecks += ages.length;
  violations += bad.length;

  const oldest = ages.length ? Math.max(...ages).toFixed(1) : '—';
  const newest = ages.length ? Math.min(...ages).toFixed(1) : '—';
  console.log(
    `  [${String(sc.key).padEnd(5)}] cards=${String(all.length).padStart(3)}  dated=${String(dated.length).padStart(3)}  ` +
      `age ${newest}–${oldest} days  inWindow=${inWindow}  outside=${outOfWindow}`
  );
  if (bad.length) {
    console.log(`           ⚠ ${bad.length} card(s) older than ${sc.windowDays}d+1: ${bad.map((b) => b.toFixed(1)).join(', ')}`);
    for (const c of dated.filter((x) => daysAgo(x.postedAt) > window + tolerance).slice(0, 3)) {
      console.log(`             · ${c.postedAt} — ${c.title.slice(0, 46)}`);
    }
  }
}

console.log(`\nFreshness violations: ${violations} / ${totalChecks} dated cards`);
console.log(violations === 0 ? 'PASS — filter honoured on every returned card' : 'FAIL — filter leaked older postings');
process.exit(violations === 0 ? 0 : 1);
