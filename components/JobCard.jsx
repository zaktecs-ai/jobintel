'use client';

import { useState } from 'react';
import { formatAge } from '@/lib/freshness';

function highlight(snippet, term) {
  if (!term || term.length < 2) return snippet;
  const words = term.split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
  if (!words.length) return snippet;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return snippet.split(re).map((part, i) =>
    re.test(part) ? (
      <mark key={i} className="rounded bg-accent-50 px-0.5 text-accent-700">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export default function JobCard({ job, index, keyword }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(job.description);

  return (
    <article
      className="card group animate-rise overflow-hidden transition duration-200 hover:shadow-lift"
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
    >
      <div className="flex gap-3.5 p-4">
        <div className="shrink-0">
          {job.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.logo}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-lg border border-surface-200 bg-white object-contain p-1"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.style.setProperty('display', 'flex');
              }}
            />
          ) : null}
          <div
            className="h-10 w-10 items-center justify-center rounded-lg border border-surface-200 bg-surface-50 text-sm font-semibold text-ink-400"
            style={{ display: job.logo ? 'none' : 'flex' }}
            aria-hidden="true"
          >
            {(job.company || '?').slice(0, 1).toUpperCase()}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[0.9375rem] font-semibold leading-snug text-ink-900">
                {highlight(job.title, keyword)}
              </h3>
              <p className="mt-0.5 truncate text-sm text-ink-500">{job.company}</p>
            </div>
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-surface-300 px-2 py-1 text-2xs font-medium text-ink-500 transition hover:border-ink-300 hover:text-ink-900"
            >
              LinkedIn ↗
            </a>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-400">
            <span className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" stroke="currentColor" strokeWidth="2" />
                <circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="truncate">{job.location}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {formatAge(job)}
            </span>
            {job.earlyApplicant ? (
              <span className="rounded-full bg-moss-100 px-2 py-0.5 text-2xs font-medium text-moss-500">
                Early applicant
              </span>
            ) : null}
            {job.salary ? (
              <span className="rounded-full bg-accent-50 px-2 py-0.5 text-2xs font-medium text-accent-700">{job.salary}</span>
            ) : null}
          </div>

          {(job.seniority || job.employmentType || job.industry) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {job.seniority ? (
                <span className="rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 font-mono text-2xs text-ink-500">
                  {job.seniority}
                </span>
              ) : null}
              {job.employmentType ? (
                <span className="rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 font-mono text-2xs text-ink-500">
                  {job.employmentType}
                </span>
              ) : null}
              {job.industry ? (
                <span className="truncate rounded border border-surface-200 bg-surface-50 px-1.5 py-0.5 font-mono text-2xs text-ink-500">
                  {job.industry}
                </span>
              ) : null}
            </div>
          )}

          {hasDetail ? (
            <div className="mt-3">
              <p className={`whitespace-pre-line text-[0.8125rem] leading-relaxed text-ink-500 ${open ? '' : 'line-clamp-3'}`}>
                {job.description}
              </p>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-1.5 text-2xs font-medium text-accent-600 transition hover:text-accent-700"
              >
                {open ? 'Show less' : 'Show full description'}
              </button>
            </div>
          ) : (
            <p className="mt-3 text-2xs text-ink-300">
              Short listing · enable <span className="font-medium text-ink-400">Deep detail</span> for the full description
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
