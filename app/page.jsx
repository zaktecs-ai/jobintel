'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SearchPanel from '@/components/SearchPanel';
import StatusBar from '@/components/StatusBar';
import JobCard from '@/components/JobCard';
import { SkeletonList } from '@/components/Skeleton';
import { Toolbar, FilterBar } from '@/components/ResultsToolbar';
import { useJobStream } from '@/lib/useJobStream';
import { downloadCSV, downloadJSON } from '@/lib/export';

const DEFAULT_FORM = {
  keywords: '',
  location: 'Pakistan',
  experience: [],
  remote: '',
  datePosted: '',
  maxResults: 50,
  details: true,
  pace: 1400,
};

const SORTS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'newest', label: 'Newest' },
  { id: 'company', label: 'Company' },
];

function useFreshFilter(job) {
  if (!job.postedAt) return false;
  const d = new Date(`${job.postedAt}T00:00:00Z`).getTime();
  return Date.now() - d < 3 * 86400000;
}

export default function Page() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [query, setQuery] = useState('');
  const [seniority, setSeniority] = useState('');
  const [onlyFresh, setOnlyFresh] = useState(false);
  const [onlyRemote, setOnlyRemote] = useState(false);
  const [sort, setSort] = useState('relevance');

  const { status, jobs, stats, error, log, progress, start, stop } = useJobStream();
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = jobs.filter((j) => {
      if (q && !`${j.title} ${j.company}`.toLowerCase().includes(q)) return false;
      if (seniority && j.seniority !== seniority) return false;
      if (onlyFresh && !useFreshFilter(j)) return false;
      if (onlyRemote && !/remote/i.test(`${j.location} ${j.workplaceType || ''}`)) return false;
      return true;
    });
    if (sort === 'newest') {
      out = out.slice().sort((a, b) => String(b.postedAt || '').localeCompare(String(a.postedAt || '')));
    } else if (sort === 'company') {
      out = out.slice().sort((a, b) => String(a.company || '').localeCompare(String(b.company || '')));
    }
    return out;
  }, [jobs, query, seniority, onlyFresh, onlyRemote, sort]);

  const busy = status === 'running' || status === 'paused';
  const showSkeleton = busy && jobs.length < Math.min(form.maxResults, 10);

  const onExport = (kind) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const safe = (form.keywords || 'jobs').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    if (kind === 'csv') downloadCSV(filtered, `jobintel-${safe}-${stamp}.csv`);
    else downloadJSON(filtered, `jobintel-${safe}-${stamp}.json`);
  };

  // keyboard: "/" focuses filter, Esc stops a run
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && busy) stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, stop]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-4 sm:px-6">
      {/* ---- header ---- */}
      <header className="flex items-center justify-between py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-ink-900 shadow-card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 18V8l5 6 5-6v10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="19" cy="7" r="2.2" fill="#5b8cf5" />
            </svg>
          </div>
          <div>
            <p className="text-[0.9375rem] font-semibold leading-none tracking-[-0.01em] text-ink-900">JobIntel</p>
            <p className="mt-1 font-mono text-2xs uppercase tracking-[0.18em] text-ink-300">live job crawler</p>
          </div>
        </div>
        <div className="hidden items-center gap-4 font-mono text-2xs text-ink-400 sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'bg-moss-500 animate-pulsedot' : 'bg-ink-300'}`} />
            {busy ? 'streaming' : 'idle'}
          </span>
          <span>v1.0</span>
        </div>
      </header>

      {/* ---- hero ---- */}
      <section className="pb-6 pt-5">
        <h1 className="max-w-[22ch] text-[1.75rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink-900 sm:text-[2.25rem]">
          Every live posting, <span className="text-ink-400">read in seconds.</span>
        </h1>
        <p className="mt-3 max-w-[58ch] text-sm leading-relaxed text-ink-500">
          JobIntel streams LinkedIn&apos;s public job index straight into your browser — filter by seniority,
          workplace and recency, then export the whole set. No account, no queue, no refresh.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ---- left rail ---- */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <SearchPanel
            form={form}
            setForm={setForm}
            onRun={(q) => {
              setQuery('');
              setSeniority('');
              start(q);
              setTimeout(() => listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
            }}
            onStop={stop}
            status={status}
            running={busy}
          />
        </aside>

        {/* ---- results ---- */}
        <main ref={listRef} className="min-w-0 space-y-3">
          <StatusBar status={status} progress={progress} stats={stats} jobs={jobs.length} onStop={stop} />

          {error ? (
            <div className="card border-ember-100 bg-ember-100/40 px-4 py-3">
              <p className="text-sm font-medium text-ember-500">{error}</p>
              <p className="mt-1 text-xs text-ink-500">
                The crawler keeps what it already collected. Press “Scrape jobs” to run again — it starts fresh.
              </p>
            </div>
          ) : null}

          {jobs.length ? (
            <>
              <Toolbar jobs={filtered} total={form.maxResults} keyword={form.keywords} onExport={onExport} />
              <FilterBar
                jobs={jobs}
                filtered={filtered.length}
                query={query}
                setQuery={setQuery}
                seniority={seniority}
                setSeniority={setSeniority}
                onlyFresh={onlyFresh}
                setOnlyFresh={setOnlyFresh}
                onlyRemote={onlyRemote}
                setOnlyRemote={setOnlyRemote}
              />
              <div className="flex items-center gap-2 px-1">
                <span className="label">Sort</span>
                {SORTS.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSort(s.id)}
                    className={`text-2xs font-medium transition ${
                      sort === s.id ? 'text-ink-900 underline decoration-ink-300 underline-offset-4' : 'text-ink-400 hover:text-ink-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {filtered.map((job, i) => (
                  <JobCard key={job.id} job={job} index={i} keyword={form.keywords} />
                ))}
              </div>
              {!filtered.length ? (
                <div className="card px-4 py-10 text-center">
                  <p className="text-sm font-medium text-ink-900">No jobs match those filters</p>
                  <p className="mt-1 text-xs text-ink-400">Clear the filter chips to see all {jobs.length} results.</p>
                </div>
              ) : null}
            </>
          ) : showSkeleton ? (
            <>
              <div className="flex items-center gap-2 px-1 text-2xs text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full bg-moss-500 animate-pulsedot" />
                Crawling page 1 · results stream in as they arrive
              </div>
              <SkeletonList count={4} />
            </>
          ) : (
            <EmptyState onDemo={() => start({ ...DEFAULT_FORM, keywords: 'python developer', maxResults: 25 })} />
          )}

          {log.length && status !== 'idle' ? (
            <details className="card px-4 py-3">
              <summary className="cursor-pointer text-2xs font-medium uppercase tracking-[0.14em] text-ink-400">
                Crawler log · {log.length}
              </summary>
              <ul className="mt-2 space-y-1 font-mono text-2xs text-ink-400">
                {log.slice(-14).map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className={
                        l.kind === 'err'
                          ? 'text-ember-500'
                          : l.kind === 'warn'
                            ? 'text-accent-600'
                            : l.kind === 'ok'
                              ? 'text-moss-500'
                              : 'text-ink-300'
                      }
                    >
                      ●
                    </span>
                    <span className="text-ink-500">{l.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </main>
      </div>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-5 text-2xs text-ink-300">
        <p>
          JobIntel reads LinkedIn&apos;s public guest job index. Rate-limited, resumable, self-healing crawl — be
          considerate with pacing.
        </p>
        <p className="font-mono">built for job hunters</p>
      </footer>
    </div>
  );
}

function EmptyState({ onDemo }) {
  return (
    <div className="card relative overflow-hidden px-6 py-12 text-center">
      <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-accent-100/50 blur-3xl" />
      <div className="relative">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-surface-200 bg-white shadow-card">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="#333844" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="#333844" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className="mt-4 text-[0.9375rem] font-semibold text-ink-900">Nothing crawled yet</h3>
        <p className="mx-auto mt-1.5 max-w-[42ch] text-sm leading-relaxed text-ink-400">
          Enter a role and a location on the left, then hit <span className="font-medium text-ink-700">Scrape jobs</span>.
          Results stream in live, ten at a time.
        </p>
        <button type="button" onClick={onDemo} className="btn-ghost mx-auto mt-5 text-xs">
          Try a sample search ↗
        </button>
      </div>
    </div>
  );
}
