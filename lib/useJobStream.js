'use client';

/**
 * useJobStream — drives the SSE crawl.
 *
 * Responsibilities:
 *  - open EventSource to /api/scrape with the form as query params
 *  - merge streamed jobs by id (last write wins, so a detail event upgrades the card)
 *  - auto-resume when the server pauses on the time budget, bounded by `maxResumes`
 *  - never leave a dangling connection: close on done / error / unmount / stop
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_RESUMES = 6;

export function useJobStream() {
  const [status, setStatus] = useState('idle'); // idle | running | paused | done | error | stopped
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState({ delivered: 0, goal: 0, gap: 0, requests: 0, throttled: 0 });

  const esRef = useRef(null);
  const stopRef = useRef(false);
  const resumeCount = useRef(0);
  const queryRef = useRef(null);
  const goalRef = useRef(0);

  const pushLog = useCallback((entry) => {
    setLog((prev) => [...prev.slice(-40), { ...entry, at: Date.now() }]);
  }, []);

  const close = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }, []);

  const merge = useCallback((incoming) => {
    setJobs((prev) => {
      if (!incoming?.length) return prev;
      const index = new Map(prev.map((j, i) => [j.id, i]));
      const next = prev.slice();
      for (const job of incoming) {
        const at = index.get(job.id);
        if (at === undefined) {
          index.set(job.id, next.length);
          next.push(job);
        } else {
          next[at] = { ...next[at], ...job };
        }
      }
      return next;
    });
  }, []);

  const open = useCallback(
    (query, cursor = null, isResume = false) => {
      close();
      const params = new URLSearchParams({
        keywords: query.keywords || '',
        location: query.location || '',
        maxResults: String(query.maxResults || 50),
        details: query.details ? '1' : '0',
        remote: query.remote || '',
        datePosted: query.datePosted || '',
        experience: (query.experience || []).join(','),
        pace: String(query.pace || 1400),
      });
      if (cursor) params.set('cursor', cursor);

      setStatus(isResume ? 'running' : 'running');
      if (!isResume) {
        setJobs([]);
        setStats(null);
        setError(null);
        setLog([]);
        resumeCount.current = 0;
        setProgress({ delivered: 0, goal: goalRef.current, gap: 0, requests: 0, throttled: 0 });
      }

      const es = new EventSource(`/api/scrape?${params.toString()}`);
      esRef.current = es;

      es.onmessage = (evt) => {
        let msg;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case 'init':
            setProgress((p) => ({ ...p, goal: msg.query.maxResults }));
            pushLog({ kind: 'start', text: `Search started · ${msg.query.keywords} · ${msg.query.location}` });
            break;
          case 'jobs':
            merge(msg.jobs);
            setProgress((p) => ({
              ...p,
              delivered: msg.meta?.delivered ?? p.delivered,
              gap: msg.meta?.gap ?? p.gap,
              requests: msg.meta?.requests ?? p.requests,
              throttled: msg.meta?.throttled ?? p.throttled,
            }));
            pushLog({ kind: 'page', text: `Page ${(msg.meta?.pageIndex ?? 0) + 1} · +${msg.jobs.length} jobs` });
            break;
          case 'progress':
            setProgress((p) => ({
              ...p,
              delivered: msg.delivered,
              gap: msg.gap,
              requests: msg.requests,
              throttled: msg.throttled,
            }));
            break;
          case 'page_error':
            pushLog({ kind: 'warn', text: `Page ${msg.pageIndex} ${msg.status || ''} ${msg.error || ''} — governor slowing to ${msg.gap}ms` });
            break;
          case 'page_empty':
            pushLog({ kind: 'warn', text: `Offset ${msg.pageIndex} returned no cards — skipping forward` });
            break;
          case 'detail':
            merge([msg.job]);
            setProgress((p) => ({
              ...p,
              enriched: (p.enriched || 0) + 1,
              gap: msg.meta?.gap ?? p.gap,
              requests: msg.meta?.requests ?? p.requests,
              throttled: msg.meta?.throttled ?? p.throttled,
            }));
            break;
          case 'enrich_start':
            setProgress((p) => ({ ...p, phase: 'detail', enrichTotal: msg.total, enriched: 0 }));
            pushLog({ kind: 'page', text: `Enriching ${msg.total} postings with full detail` });
            break;
          case 'enrich_skipped':
            pushLog({ kind: 'warn', text: `Detail skipped: ${msg.reason}` });
            break;
          case 'done': {
            close();
            setStats({ ...msg.stats, stopReason: msg.stopReason, delivered: msg.delivered });
            if (msg.resumable && !stopRef.current && resumeCount.current < MAX_RESUMES) {
              resumeCount.current += 1;
              setStatus('paused');
              pushLog({ kind: 'warn', text: `Time budget reached — resuming automatically (pass ${resumeCount.current})` });
              setTimeout(() => {
                if (!stopRef.current) open(queryRef.current, msg.cursor, true);
              }, 900);
            } else {
              setStatus('done');
              pushLog({ kind: 'ok', text: `Finished · ${msg.delivered} jobs · ${msg.stopReason}` });
            }
            break;
          }
          case 'error':
            close();
            setError(msg.message || 'Stream error');
            setStatus(msg.recovered ? 'done' : 'error');
            pushLog({ kind: 'err', text: msg.message || 'Stream error' });
            break;
          default:
            break;
        }
      };

      es.onerror = () => {
        close();
        if (stopRef.current) {
          setStatus('stopped');
          return;
        }
        setError('Connection dropped. LinkedIn or the network interrupted the stream.');
        setStatus('error');
        pushLog({ kind: 'err', text: 'Stream connection dropped' });
      };
    },
    [close, merge, pushLog]
  );

  const start = useCallback(
    (query) => {
      stopRef.current = false;
      queryRef.current = query;
      goalRef.current = query.maxResults || 50;
      open(query, null, false);
    },
    [open]
  );

  const stop = useCallback(() => {
    stopRef.current = true;
    close();
    setStatus('stopped');
    pushLog({ kind: 'warn', text: 'Stopped by user — results kept' });
  }, [close, pushLog]);

  useEffect(() => () => close(), [close]);

  return { status, jobs, stats, error, log, progress, start, stop };
}
