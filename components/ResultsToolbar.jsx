'use client';

import { useMemo, useState } from 'react';


export function Toolbar({ jobs, total, keyword, onExport }) {
  return (
    <div className="card flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="mr-auto flex min-w-0 items-baseline gap-2">
        <h2 className="text-sm font-semibold text-ink-900">Results</h2>
        <span className="font-mono text-2xs text-ink-400">
          {jobs.length}
          {total ? ` / ${total}` : ''}
        </span>
        {keyword ? (
          <span className="hidden max-w-[220px] truncate rounded-full bg-surface-100 px-2 py-0.5 text-2xs text-ink-500 sm:inline">
            {keyword}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onExport('csv')}
        disabled={!jobs.length}
        className="btn-ghost !min-h-[34px] !px-3 text-2xs disabled:opacity-40"
      >
        CSV
      </button>
      <button
        type="button"
        onClick={() => onExport('json')}
        disabled={!jobs.length}
        className="btn-ghost !min-h-[34px] !px-3 text-2xs disabled:opacity-40"
      >
        JSON
      </button>
    </div>
  );
}

export function FilterBar({ jobs, filtered, query, setQuery, seniority, setSeniority, onlyFresh, setOnlyFresh, onlyRemote, setOnlyRemote }) {
  const levels = useMemo(() => {
    const s = new Set();
    for (const j of jobs) if (j.seniority) s.add(j.seniority);
    return Array.from(s).slice(0, 8);
  }, [jobs]);

  return (
    <div className="card space-y-2.5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter results by title or company"
            className="field !py-1.5 !pl-8 text-xs"
          />
        </div>
        <span className="font-mono text-2xs text-ink-400">{filtered} shown</span>
      </div>

      {levels.length ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSeniority('')}
            className={`chip !text-2xs ${seniority === '' ? 'chip-on' : ''}`}
          >
            All levels
          </button>
          {levels.map((l) => (
            <button
              type="button"
              key={l}
              onClick={() => setSeniority(seniority === l ? '' : l)}
              className={`chip !text-2xs ${seniority === l ? 'chip-on' : ''}`}
            >
              {l}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOnlyFresh(!onlyFresh)}
          aria-pressed={onlyFresh}
          className={`chip !text-2xs ${onlyFresh ? 'chip-on' : ''}`}
        >
          Posted last 3 days
        </button>
        <button
          type="button"
          onClick={() => setOnlyRemote(!onlyRemote)}
          aria-pressed={onlyRemote}
          className={`chip !text-2xs ${onlyRemote ? 'chip-on' : ''}`}
        >
          Remote only
        </button>
      </div>
    </div>
  );
}
