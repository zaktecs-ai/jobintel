'use client';

export default function StatusBar({ status, progress, stats, jobs, onStop }) {
  const pct = progress.goal ? Math.min(100, Math.round((jobs / progress.goal) * 100)) : 0;

  const copy = {
    idle: { label: 'Ready', tone: 'text-ink-400', dot: 'bg-ink-300' },
    running: { label: 'Crawling live', tone: 'text-ink-900', dot: 'bg-moss-500 animate-pulsedot' },
    paused: { label: 'Resuming…', tone: 'text-accent-700', dot: 'bg-accent-500 animate-pulsedot' },
    done: { label: 'Complete', tone: 'text-moss-500', dot: 'bg-moss-500' },
    error: { label: 'Interrupted', tone: 'text-ember-500', dot: 'bg-ember-500' },
    stopped: { label: 'Stopped', tone: 'text-ink-500', dot: 'bg-ink-400' },
  }[status] || { label: status, tone: 'text-ink-400', dot: 'bg-ink-300' };

  if (status === 'running' && progress.phase === 'detail') {
    copy.label = 'Reading postings';
  }

  const busy = status === 'running' || status === 'paused';

  return (
    <div className="card sticky top-3 z-20 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${copy.dot}`} />
          <span className={`text-sm font-semibold ${copy.tone}`}>{copy.label}</span>
        </div>

        <div className="flex items-center gap-3 font-mono text-2xs text-ink-400">
          {progress.phase === 'detail' ? (
            <span className={progress.waitMs ? 'text-amber-600' : 'text-accent-700'}>
              {progress.waitMs ? (
                <>
                  cooling down <span className="text-ink-900">{Math.ceil(progress.waitMs / 1000)}s</span>
                  <span className="text-ink-300"> · {progress.enriched || 0}/{progress.enrichTotal}</span>
                </>
              ) : (
                <>
                  enriching <span className="text-ink-900">{progress.enriched || 0}</span>
                  <span className="text-ink-300"> / {progress.enrichTotal}</span>
                </>
              )}
            </span>
          ) : (
            <span>
              <span className="text-ink-900">{jobs}</span> / {progress.goal || '—'} jobs
            </span>
          )}
          {progress.requests ? <span>{progress.requests} req</span> : null}
          {progress.gap ? <span>gap {progress.gap}ms</span> : null}
          {progress.throttled ? <span className="text-ember-500">{progress.throttled} throttled</span> : null}
          {stats?.elapsedMs ? <span>{(stats.elapsedMs / 1000).toFixed(1)}s</span> : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {busy ? (
            <button type="button" onClick={onStop} className="btn-ghost !min-h-[34px] !px-3 text-2xs">
              Stop
            </button>
          ) : null}
        </div>
      </div>

      <div className="h-0.5 w-full bg-surface-200">
        <div
          className="h-full bg-ink-900 transition-all duration-500 ease-out"
          style={{ width: `${status === 'idle' ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}
