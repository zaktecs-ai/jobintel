'use client';

import { useMemo } from 'react';

const LEVELS = [
  { id: 1, label: 'Internship' },
  { id: 2, label: 'Entry' },
  { id: 3, label: 'Associate' },
  { id: 4, label: 'Mid-Senior' },
  { id: 5, label: 'Director' },
  { id: 6, label: 'Executive' },
];

const REMOTE = [
  { id: '', label: 'Any' },
  { id: 'on_site', label: 'On-site' },
  { id: 'remote', label: 'Remote' },
  { id: 'hybrid', label: 'Hybrid' },
];

const DATES = [
  { id: '', label: 'Any time' },
  { id: 'day', label: '24 hours' },
  { id: 'week', label: '1 week' },
  { id: 'month', label: '1 month' },
];

const COUNTS = [25, 50, 100, 200];

const POPULAR = ['Lahore, Pakistan', 'Karachi, Pakistan', 'Islamabad, Pakistan', 'Dubai, United Arab Emirates', 'Remote', 'London, United Kingdom', 'United States'];

function Section({ step, title, hint, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-2xs text-ink-300">{step}</span>
        <div>
          <h3 className="text-[0.9375rem] font-semibold leading-none text-ink-900">{title}</h3>
          {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function SearchPanel({ form, setForm, onRun, onStop, status, running }) {
  const busy = status === 'running' || status === 'paused';

  const toggleLevel = (id) => {
    setForm((f) => ({
      ...f,
      experience: f.experience.includes(id) ? f.experience.filter((x) => x !== id) : [...f.experience, id].sort(),
    }));
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) {
      onStop();
      return;
    }
    if (!form.keywords.trim()) return;
    onRun({ ...form, keywords: form.keywords.trim(), location: form.location.trim() });
  };

  const paceLabel = useMemo(() => {
    if (form.pace <= 1100) return 'Fast · higher block risk';
    if (form.pace <= 1800) return 'Balanced · recommended';
    if (form.pace <= 3000) return 'Careful · low risk';
    return 'Very slow · safest';
  }, [form.pace]);

  return (
    <form onSubmit={submit} className="card overflow-hidden">
      <div className="border-b border-surface-200 bg-gradient-to-b from-white to-surface-50/60 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${busy ? 'bg-moss-500 animate-pulsedot' : 'bg-ink-300'}`} />
            <span className="label">{busy ? 'Crawler active' : 'Control panel'}</span>
          </div>
          <span className="font-mono text-2xs text-ink-300">LinkedIn guest index</span>
        </div>
      </div>

      <div className="space-y-6 p-5">
        <Section step="01" title="What are you looking for?" hint="Job title, skill, or a boolean-ish phrase.">
          <input
            className="field"
            placeholder="e.g. python backend engineer"
            value={form.keywords}
            onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
          />
        </Section>

        <Section step="02" title="Where?" hint="City, country, or “Remote” for worldwide.">
          <input
            className="field"
            placeholder="e.g. Lahore, Pakistan"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            maxLength={100}
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {POPULAR.slice(0, 5).map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setForm((f) => ({ ...f, location: p }))}
                className={`chip ${form.location === p ? 'chip-on' : ''}`}
              >
                {p.split(',')[0]}
              </button>
            ))}
          </div>
        </Section>

        <Section step="03" title="Seniority" hint="Leave empty to include every level.">
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <button
                type="button"
                key={l.id}
                onClick={() => toggleLevel(l.id)}
                aria-pressed={form.experience.includes(l.id)}
                className={`chip ${form.experience.includes(l.id) ? 'chip-on' : ''}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Section>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Section step="04" title="Workplace">
            <div className="flex flex-wrap gap-1.5">
              {REMOTE.map((r) => (
                <button
                  type="button"
                  key={r.id || 'any'}
                  onClick={() => setForm((f) => ({ ...f, remote: r.id }))}
                  aria-pressed={form.remote === r.id}
                  className={`chip ${form.remote === r.id ? 'chip-on' : ''}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Section>

          <Section step="05" title="Posted within">
            <div className="flex flex-wrap gap-1.5">
              {DATES.map((d) => (
                <button
                  type="button"
                  key={d.id || 'any'}
                  onClick={() => setForm((f) => ({ ...f, datePosted: d.id }))}
                  aria-pressed={form.datePosted === d.id}
                  className={`chip ${form.datePosted === d.id ? 'chip-on' : ''}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Section>
        </div>

        <Section step="06" title="How many results?" hint="10 per page. 200+ resumes automatically.">
          <div className="flex flex-wrap gap-1.5">
            {COUNTS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm((f) => ({ ...f, maxResults: c }))}
                aria-pressed={form.maxResults === c}
                className={`chip tabular-nums ${form.maxResults === c ? 'chip-on' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>
        </Section>

        <Section step="07" title="Crawl settings" hint="Slower pacing means LinkedIn is far less likely to throttle you.">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-500">Pacing</span>
                <span className="font-mono text-2xs text-ink-400">{form.pace} ms · {paceLabel}</span>
              </div>
              <input
                type="range"
                min="800"
                max="4000"
                step="100"
                value={form.pace}
                onChange={(e) => setForm((f) => ({ ...f, pace: Number(e.target.value) }))}
                className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-200 accent-accent-500"
                aria-label="Request pacing in milliseconds"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-surface-200 bg-surface-50/60 p-3 transition hover:border-ink-300">
              <input
                type="checkbox"
                checked={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-surface-300 text-accent-500 accent-accent-500"
              />
              <span>
                <span className="block text-sm font-medium text-ink-900">Deep detail</span>
                <span className="block text-xs leading-relaxed text-ink-400">
                  Fetch each posting&apos;s full description, seniority, industry and salary hint. Slower, richer.
                </span>
              </span>
            </label>
          </div>
        </Section>
      </div>

      <div className="sticky bottom-0 border-t border-surface-200 bg-white/95 px-5 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={!busy && !form.keywords.trim()}
          className={`w-full ${busy ? 'btn-ghost' : 'btn-primary'}`}
        >
          {busy ? (
            <>
              <span className="h-3.5 w-3.5 rounded-sm bg-ink-700" />
              Stop crawler
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Scrape jobs
            </>
          )}
          {!busy && <span className="ml-1 font-mono text-2xs opacity-60">↵</span>}
        </button>
        <p className="mt-2 text-center text-2xs text-ink-300">
          Streaming live · resumable on time-out · no account needed
        </p>
      </div>
    </form>
  );
}
