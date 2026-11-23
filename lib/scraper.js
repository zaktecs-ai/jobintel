/**
 * LinkedIn Guest Jobs API scraper — core engine.
 *
 * Design notes (why each piece exists):
 *  - Guest API returns 10 job cards per page (server-rendered HTML), 25 per page for some markets.
 *    Paging is `start=0,25,50,...` but LinkedIn sometimes returns an empty shell for a given offset
 *    (observed: start=25 came back empty while 50 returned fresh ids). So a "page" is an *offset
 *    probe*: we walk offsets and treat an empty response as "no more here", not as a fatal error.
 *  - 429 is real and per-IP. We keep an AIMD governor: on 429 halve the gate, then slowly recover.
 *    Every request is spaced by at least `minGapMs` plus jitter so bursts never happen.
 *  - Time budget: a Vercel Hobby request dies at 300s. We never plan past `budgetMs - reserve`.
 *    The caller (route) gets a resumable cursor back, so a run continues from where it stopped
 *    instead of restarting from zero.
 *  - Self-heal: three independent extraction strategies per field (data-entity-urn + known classes,
 *    then generic anchor/heading heuristics). If LinkedIn renames a class the run still returns data.
 *  - Dedupe: keyed on job id; content hash guards against LinkedIn returning the same card twice
 *    with different tracking ids.
 */

const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const SEARCH_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
const DETAIL_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting';

export const EXPERIENCE_LEVELS = {
  1: 'Internship',
  2: 'Entry level',
  3: 'Associate',
  4: 'Mid-Senior level',
  5: 'Director',
  6: 'Executive',
};

export const REMOTE_FILTER = { on_site: '1', remote: '2', hybrid: '3' };
export const DATE_FILTER = { any: '', day: 'r86400', week: 'r604800', month: 'r2592000' };

/* ------------------------------------------------------------------ HTML utils */

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function text(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMatch(html, regexes) {
  for (const re of regexes) {
    const m = html.match(re);
    if (m && m[1]) {
      const v = text(m[1]);
      if (v) return v;
    }
  }
  return '';
}

/* ------------------------------------------------------------------ card parser */

function splitCards(html) {
  // Cards are <li> blocks that each carry data-entity-urn. Split on the li boundary.
  const parts = html.split(/<li[^>]*>/i).slice(1);
  return parts.filter((p) => /urn:li:jobPosting:\d+/.test(p));
}

function parseCard(chunk) {
  const idMatch = chunk.match(/urn:li:jobPosting:(\d+)/);
  if (!idMatch) return null;
  const id = idMatch[1];

  const title = firstMatch(chunk, [
    /<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
    /<span[^>]*class="[^"]*sr-only[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);

  const company = firstMatch(chunk, [
    /<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([\s\S]*?)<\/h4>/i,
    /<a[^>]*class="[^"]*hidden-nested-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
  ]);

  const location = firstMatch(chunk, [
    /<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);

  const urlMatch = chunk.match(/href="(https:\/\/[a-z]{0,3}\.?linkedin\.com\/jobs\/view\/[^"?]+)/i);
  const url = urlMatch ? decodeEntities(urlMatch[1]) : `https://www.linkedin.com/jobs/view/${id}`;

  const postedMatch = chunk.match(/<time[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/i);
  const postedAt = postedMatch ? postedMatch[1] : '';
  const postedLabel = postedMatch ? text(postedMatch[2]) : '';

  const logo = (chunk.match(/data-delayed-url="(https:\/\/media\.licdn\.com[^"]+)"/) || [])[1] || '';

  const benefits = firstMatch(chunk, [
    /<span[^>]*class="[^"]*job-posting-benefits__text[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);

  if (!title) return null;

  return {
    id,
    title,
    company: company || 'Unknown company',
    location: decodeEntities(location) || 'Not specified',
    url,
    postedAt: postedAt ? postedAt.slice(0, 10) : '',
    postedLabel,
    logo: logo ? decodeEntities(logo) : '',
    earlyApplicant: /early applicant/i.test(benefits),
    description: '',
    seniority: '',
    employmentType: '',
    industry: '',
    applicants: '',
  };
}

export function parseSearchPage(html) {
  const cards = splitCards(html)
    .map(parseCard)
    .filter(Boolean);

  // dedupe within page by id
  const seen = new Set();
  const out = [];
  for (const c of cards) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/* ------------------------------------------------------------------ detail parser */

export function parseJobDetail(html) {
  const out = {};

  out.title = firstMatch(html, [
    /<h2[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i,
    /<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i,
  ]);

  out.company = firstMatch(html, [
    /<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([\s\S]*?)<\/a>/i,
    /<span[^>]*class="[^"]*topcard__flavor[^"]*topcard__flavor--black-link[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);

  out.location = firstMatch(html, [
    /<span[^>]*class="[^"]*topcard__flavor topcard__flavor--bullet[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);

  out.postedLabel = firstMatch(html, [
    /<span[^>]*class="[^"]*posted-time-ago__text[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);

  out.applicants = firstMatch(html, [
    /<figcaption[^>]*class="[^"]*num-applicants__caption[^"]*"[^>]*>([\s\S]*?)<\/figcaption>/i,
    /<span[^>]*class="[^"]*num-applicants__caption[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);

  // criteria list: seniority / employment type / industries.
  // LinkedIn ships class="description__job-criteria-*"; older builds used "job-criteria__*".
  // Match both, and tolerate the label/value whitespace quirks.
  const crit = {};
  const critRe =
    /<h3[^>]*class="[^"]*job-criteria-subheader[^"]*"[^>]*>([\s\S]*?)<\/h3>\s*<span[^>]*class="[^"]*(?:job-criteria-text|job-criteria__text)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = critRe.exec(html))) {
    crit[text(m[1]).toLowerCase()] = text(m[2]);
  }
  if (!Object.keys(crit).length) {
    // fallback: pair each <li class="...job-criteria-item"> header + text block
    const itemRe = /<li[^>]*class="[^"]*job-criteria-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    while ((m = itemRe.exec(html))) {
      const block = m[1];
      const label = firstMatch(block, [/<h3[^>]*>([\s\S]*?)<\/h3>/i]);
      const value = firstMatch(block, [/<span[^>]*>([\s\S]*?)<\/span>/i]);
      if (label) crit[label.toLowerCase()] = value;
    }
  }
  out.seniority = crit['seniority level'] || '';
  out.employmentType = crit['employment type'] || '';
  out.industry = crit['industries'] || crit['industry'] || '';
  out.jobFunction = crit['job function'] || '';

  // description markup -> clean text
  const descMatch = html.match(
    /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  out.description = descMatch ? text(descMatch[1]).slice(0, 12000) : '';
  out.descriptionHtml = descMatch ? descMatch[1].slice(0, 20000) : '';

  // salary sometimes appears in the top card flavor or in the description
  const salaryTop = firstMatch(html, [
    /<span[^>]*class="[^"]*topcard__flavor[^"]*salary[^"]*"[^>]*>([\s\S]*?)<\/span>/i,
  ]);
  out.salary = salaryTop || extractSalary(out.description);

  // external apply url
  const applyMatch = html.match(
    /<code[^>]*id="applyUrl"[^>]*>\s*(?:<[^>]+>\s*)*([^<]+?)\s*</i
  );
  out.applyUrl = applyMatch ? decodeEntities(applyMatch[1]).replace(/^\/\/apply\./, 'https://apply.') : '';

  return out;
}

const SALARY_RE =
  /((?:PKR|USD|EUR|GBP|AED|INR|CAD|AUD|\$|£|€|₨|Rs\.?)\s?[\d,.]{3,}(?:\s?[-–to]{1,2}\s?(?:PKR|USD|EUR|GBP|AED|INR|CAD|AUD|\$|£|€|₨|Rs\.?)?\s?[\d,.]{3,})?(?:\s?(?:per|a|\/)\s?(?:year|month|hour|annum|yr|mo|hr))?)/i;

export function extractSalary(desc) {
  if (!desc) return '';
  const m = desc.match(SALARY_RE);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 90) : '';
}

/* ------------------------------------------------------------------ governor / http */

export class Governor {
  constructor(opts = {}) {
    this.minGapMs = opts.minGapMs ?? 1400;
    this.jitterMs = opts.jitterMs ?? 900;
    this.gapMs = this.minGapMs;
    this.lastAt = 0;
    this.consecutive429 = 0;
    this.requests = 0;
    this.throttled = 0;
    this.cooldownUntil = 0;
  }

  nextDelay() {
    const now = Date.now();
    const gap = Math.max(this.gapMs, this.cooldownUntil - now) + Math.random() * this.jitterMs;
    const wait = Math.max(0, this.lastAt + gap - now);
    this.lastAt = Math.max(now, this.lastAt + gap);
    return Math.round(wait);
  }

  onSuccess() {
    this.consecutive429 = 0;
    // additive increase, capped
    this.gapMs = Math.max(this.minGapMs, this.gapMs - 120);
  }

  on429() {
    this.consecutive429 += 1;
    this.throttled += 1;
    this.gapMs = Math.min(20000, this.gapMs * 1.8);
    const backoff = Math.min(45000, 2500 * Math.pow(2, this.consecutive429 - 1));
    this.cooldownUntil = Date.now() + backoff + Math.random() * 1500;
    return backoff;
  }

  onBlock(status) {
    // 999 / 403 — LinkedIn nuked us; treat as long cooldown
    this.gapMs = Math.min(30000, this.gapMs * 2);
    this.cooldownUntil = Date.now() + 30000;
  }
}

function pickUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

function headers(extra = {}) {
  return {
    'User-Agent': pickUA(),
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: 'https://www.linkedin.com/jobs/',
    ...extra,
  };
}

export async function fetchWithRetry(url, gov, { attempts = 3, signal, budgetDeadline, timeoutMs = 15000 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    if (budgetDeadline && Date.now() > budgetDeadline) {
      return { ok: false, status: 0, html: '', error: 'budget exhausted', budgetExhausted: true };
    }
    const wait = gov.nextDelay();
    if (wait > 0) await sleep(wait, signal);
    if (budgetDeadline && Date.now() > budgetDeadline) {
      return { ok: false, status: 0, html: '', error: 'budget exhausted', budgetExhausted: true };
    }
    // A stalled upstream connection would otherwise hang the whole run forever: fetch() has no
    // default timeout in Node. Hard-cap every attempt and let the retry loop decide what to do.
    const perRequest = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, perRequest]) : perRequest;
    try {
      gov.requests += 1;
      const res = await fetch(url, {
        headers: headers(),
        signal: combined,
        redirect: 'follow',
      });
      const html = await res.text();
      if (res.ok) {
        gov.onSuccess();
        return { ok: true, status: res.status, html };
      }
      if (res.status === 429) {
        const backoff = gov.on429();
        lastErr = `429 rate limited (cooldown ${Math.round(backoff / 1000)}s)`;
        continue;
      }
      if (res.status === 403 || res.status === 999) {
        gov.onBlock(res.status);
        lastErr = `${res.status} blocked`;
        continue;
      }
      if (res.status >= 500) {
        lastErr = `${res.status} upstream`;
        await sleep(1200 * (i + 1), signal);
        continue;
      }
      // 404 / 400 -> not retryable, but not fatal for the whole run
      return { ok: false, status: res.status, html, error: `HTTP ${res.status}`, fatal: true };
    } catch (err) {
      if (signal?.aborted) return { ok: false, status: 0, html: '', error: 'aborted', aborted: true };
      if (err?.name === 'TimeoutError' || perRequest.aborted) {
        lastErr = `request timed out after ${timeoutMs}ms`;
        gov.gapMs = Math.min(12000, gov.gapMs * 1.3);
        await sleep(600 * (i + 1), signal);
        continue;
      }
      lastErr = err?.message || String(err);
      await sleep(800 * (i + 1), signal);
    }
  }
  return { ok: false, status: 0, html: '', error: lastErr || 'unknown' };
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

/* ------------------------------------------------------------------ search */

function buildSearchUrl({ keywords, location, experience = [], remote, datePosted, company, pageIndex }) {
  const params = new URLSearchParams();
  params.set('keywords', keywords);
  if (location) params.set('location', location);
  if (experience?.length) params.set('f_E', experience.join(','));
  if (remote && REMOTE_FILTER[remote]) params.set('f_WT', REMOTE_FILTER[remote]);
  if (datePosted && DATE_FILTER[datePosted]) params.set('f_TPR', DATE_FILTER[datePosted]);
  if (company) params.set('f_C', company);
  params.set('start', String(pageIndex * 25));
  return `${SEARCH_URL}?${params.toString()}`;
}

/**
 * Run a paginated search.
 * onBatch(cards, meta) is awaited per page so the caller can stream results out.
 */
export async function runSearch({
  query,
  maxResults = 50,
  onBatch = async () => {},
  onEvent = () => {},
  startedAt = Date.now(),
  budgetMs = 240000,
  cursor = { pageIndex: 0, seen: [] },
  signal,
}) {
  const gov = new Governor({ minGapMs: query.paceMs ?? 1400 });
  const deadline = startedAt + budgetMs;
  const seen = new Set(cursor.seen || []);
  let pageIndex = cursor.pageIndex || 0;
  let delivered = 0;
  let emptyPages = 0;
  const emptyRetries = new Set();
  let stopped = false;
  let stopReason = 'done';
  const pagesToFetch = Math.ceil(maxResults / 10) + 2; // +2 slack for the empty-offset quirk

  onEvent({ type: 'started', query, cursor, gap: gov.gapMs });

  for (let p = 0; p < pagesToFetch * 2 && delivered < maxResults; p++) {
    if (Date.now() > deadline - 3000) {
      stopReason = 'time_budget';
      break;
    }
    const url = buildSearchUrl({ ...query, pageIndex });
    const res = await fetchWithRetry(url, gov, { budgetDeadline: deadline - 3000, signal });
    if (res.aborted) { stopReason = 'aborted'; break; }
    if (res.budgetExhausted) { stopReason = 'time_budget'; break; }
    if (!res.ok) {
      emptyPages += 1;
      onEvent({ type: 'page_error', pageIndex, error: res.error, status: res.status, gap: Math.round(gov.gapMs) });
      if (res.fatal) {
        stopReason = emptyPages > 2 ? 'blocked_or_empty' : 'done';
        pageIndex += 1;
        continue;
      }
      if (emptyPages >= 3) { stopReason = 'blocked_or_empty'; break; }
      continue; // retry the same offset next loop
    }

    const cards = parseSearchPage(res.html);
    if (!cards.length) {
      // LinkedIn intermittently returns an empty shell for a valid offset (cache/edge variance).
      // Retrying the SAME offset once, after a pause, recovers those jobs instead of silently
      // skipping 10 real postings. Only after a confirmed second empty do we step forward.
      const retryKey = `${pageIndex}`;
      const alreadyRetried = emptyRetries.has(retryKey);
      onEvent({ type: 'page_empty', pageIndex, gap: Math.round(gov.gapMs), retry: !alreadyRetried, throttled: gov.throttled });
      if (!alreadyRetried) {
        emptyRetries.add(retryKey);
        await sleep(2200 + Math.random() * 1800, signal);
        if (Date.now() > deadline - 3000) { stopReason = 'time_budget'; break; }
        continue; // same offset, second attempt
      }
      emptyPages += 1;
      pageIndex += 1;
      await sleep(500 + Math.random() * 700, signal);
      if (emptyPages >= 6) { stopReason = 'no_more_results'; break; }
      continue;
    }

    emptyPages = 0;
    const fresh = [];
    for (const c of cards) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      fresh.push(c);
    }
    pageIndex += 1;
    delivered += fresh.length;

    if (fresh.length) {
      await onBatch(fresh.slice(0, Math.max(0, maxResults - (delivered - fresh.length))), {
        pageIndex: pageIndex - 1,
        gap: Math.round(gov.gapMs),
        requests: gov.requests,
        throttled: gov.throttled,
        delivered,
      });
      onEvent({
        type: 'progress',
        delivered,
        pageIndex,
        gap: Math.round(gov.gapMs),
        requests: gov.requests,
        throttled: gov.throttled,
        elapsed: Date.now() - startedAt,
      });
    } else {
      onEvent({ type: 'page_dup', pageIndex, delivered, gap: Math.round(gov.gapMs) });
    }
    if (delivered >= maxResults) { stopReason = 'max_results'; stopped = true; break; }
  }

  return {
    delivered,
    cursor: { pageIndex, seen: Array.from(seen).slice(-4000) },
    stopReason,
    stats: {
      requests: gov.requests,
      throttled: gov.throttled,
      finalGapMs: Math.round(gov.gapMs),
      elapsedMs: Date.now() - startedAt,
    },
  };
}

/* ------------------------------------------------------------------ detail fetch */

export async function fetchDetails(jobs, { onJob = async () => {}, startedAt = Date.now(), budgetMs = 200000, signal, paceMs = 1200 } = {}) {
  const gov = new Governor({ minGapMs: paceMs, jitterMs: 700 });
  const deadline = startedAt + budgetMs;
  const enriched = [];
  let stoppped = false;

  for (const job of jobs) {
    if (Date.now() > deadline - 2500) break;
    const res = await fetchWithRetry(`${DETAIL_URL}/${encodeURIComponent(job.id)}`, gov, {
      budgetDeadline: deadline - 2500,
      signal,
      attempts: 2,
    });
    if (res.aborted) break;
    if (res.budgetExhausted) break;
    let merged = { ...job };
    if (res.ok) {
      try {
        const d = parseJobDetail(res.html);
        merged = {
          ...job,
          title: d.title || job.title,
          company: d.company || job.company,
          location: d.location || job.location,
          postedLabel: d.postedLabel || job.postedLabel,
          applicants: d.applicants || '',
          seniority: d.seniority || '',
          employmentType: d.employmentType || '',
          industry: d.industry || '',
          jobFunction: d.jobFunction || '',
          description: d.description || '',
          salary: d.salary || '',
          applyUrl: d.applyUrl || '',
          detailStatus: 'ok',
        };
      } catch (err) {
        merged.detailStatus = 'parse_error';
      }
    } else {
      merged.detailStatus = res.status === 429 ? 'throttled' : 'error';
    }
    enriched.push(merged);
    await onJob(merged, { requests: gov.requests, throttled: gov.throttled, gap: Math.round(gov.gapMs) });
  }

  return {
    jobs: enriched,
    stats: {
      requests: gov.requests,
      throttled: gov.throttled,
      finalGapMs: Math.round(gov.gapMs),
      elapsedMs: Date.now() - startedAt,
    },
  };
}

export { buildSearchUrl, text as htmlToText, decodeEntities };
