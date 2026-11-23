/**
 * GET /api/scrape — Server-Sent Events job stream.
 *
 * Why SSE and not a single JSON response:
 *   Vercel Hobby kills a function at 300s and caps the response body at 4.5 MB. A streaming
 *   response starts sending immediately (so no gateway timeout), keeps the connection warm, and
 *   lets the browser render cards while the crawler is still working.
 *
 * Resumability:
 *   If the run hits the time budget, we emit { type: "paused", cursor } and the client reconnects
 *   with the same query + cursor. `cursor.pageIndex` is where to continue; `cursor.seen` is the
 *   set of job ids already delivered, so nothing is re-sent and nothing is re-fetched blindly.
 *
 * Self-healing:
 *   - 429 -> governor backoff, retried in place (never loses position)
 *   - upstream 5xx -> retried
 *   - LinkedIn returning an empty shell for an offset -> skip forward, don't abort
 *   - parser failure on a card -> card skipped, run continues
 */

import { runSearch, fetchDetails, EXPERIENCE_LEVELS } from '@/lib/scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_RESULTS_CAP = 300;
const BASE_BUDGET_MS = 235_000; // leave headroom under the 300s cap

function int(v, fallback, min, max) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clean(s, max = 120) {
  return String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

export async function GET(request) {
  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);

  const keywords = clean(searchParams.get('keywords'), 100);
  const location = clean(searchParams.get('location'), 100) || 'Pakistan';
  const maxResults = int(searchParams.get('maxResults'), 50, 10, MAX_RESULTS_CAP);
  const details = searchParams.get('details') === '1' || searchParams.get('details') === 'true';
  const remote = searchParams.get('remote') || '';
  const datePosted = searchParams.get('datePosted') || '';
  const pace = int(searchParams.get('pace'), 1400, 700, 6000);
  const experience = (searchParams.get('experience') || '')
    .split(',')
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);

  let cursor = { pageIndex: 0, seen: [] };
  const rawCursor = searchParams.get('cursor');
  if (rawCursor) {
    try {
      const parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'));
      cursor = {
        pageIndex: Math.max(0, Math.min(400, Number(parsed.pageIndex) || 0)),
        seen: Array.isArray(parsed.seen) ? parsed.seen.filter((x) => /^\d{6,}$/.test(String(x))).slice(-4000) : [],
      };
    } catch {
      /* bad cursor -> start clean, never crash the run */
    }
  }

  if (!keywords) {
    return new Response(JSON.stringify({ error: 'keywords required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const ac = new AbortController();
      request.signal?.addEventListener?.('abort', () => ac.abort(), { once: true });

      // Heartbeat: an SSE stream that goes quiet during a governor cooldown looks dead to proxies
      // and to the user. A comment frame every 12s keeps the connection warm without polluting
      // the event stream (comment frames are ignored by EventSource).
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          closed = true;
        }
      }, 12000);

      const collected = [];

      try {
        send({
          type: 'init',
          query: { keywords, location, maxResults, details, remote, datePosted, experience },
          levels: EXPERIENCE_LEVELS,
          budgetMs: BASE_BUDGET_MS,
        });

        const searchRes = await runSearch({
          query: { keywords, location, experience, remote, datePosted, paceMs: pace },
          maxResults,
          startedAt,
          budgetMs: BASE_BUDGET_MS - (details ? 90_000 : 10_000),
          cursor,
          signal: ac.signal,
          onEvent: (e) => send(e),
          onBatch: async (cards, meta) => {
            // When we asked LinkedIn for f_WT=2 every card is remote by definition; carry that
            // signal so the client filter does not throw away cards whose text lacks the word.
            const tagged = remote === 'remote' ? cards.map((c) => ({ ...c, matchedRemoteFilter: true })) : cards;
            collected.push(...tagged);
            send({ type: 'jobs', jobs: tagged, meta });
          },
        });

        const needsResume =
          searchRes.delivered < maxResults &&
          (searchRes.stopReason === 'time_budget' || searchRes.stopReason === 'blocked_or_empty');

        // Detail enrichment only when asked, and only for the time we have left.
        if (details && collected.length) {
          const remaining = BASE_BUDGET_MS - (Date.now() - startedAt) - 4000;
          if (remaining > 8000) {
            send({ type: 'enrich_start', total: collected.length, budgetMs: remaining });
            const enriched = await fetchDetails(collected, {
              startedAt: Date.now(),
              budgetMs: remaining,
              paceMs: Math.max(900, pace - 200),
              signal: ac.signal,
              onJob: async (job, meta) => {
                send({ type: 'detail', job, meta });
              },
            });
            send({ type: 'enrich_done', done: enriched.jobs.length, total: collected.length, stats: enriched.stats });
          } else {
            send({ type: 'enrich_skipped', reason: 'not enough time budget left' });
          }
        }

        const cursorOut = Buffer.from(
          JSON.stringify({
            pageIndex: searchRes.cursor.pageIndex,
            seen: searchRes.cursor.seen.slice(-800),
          })
        ).toString('base64url');

        send({
          type: 'done',
          delivered: searchRes.delivered,
          stopReason: searchRes.stopReason,
          stats: { ...searchRes.stats, elapsedMs: Date.now() - startedAt },
          cursor: cursorOut,
          resumable: needsResume && searchRes.delivered < maxResults,
        });
      } catch (err) {
        send({
          type: 'error',
          message: err?.message || 'Unexpected server error',
          recovered: collected.length > 0,
          collected: collected.length,
        });
      } finally {
        clearInterval(heartbeat);
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
