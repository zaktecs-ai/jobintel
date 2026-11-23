'use client';

export function SkeletonCard({ delay = 0 }) {
  return (
    <div className="card p-4" style={{ animationDelay: `${delay}ms` }} aria-hidden="true">
      <div className="flex gap-3.5">
        <div className="skeleton h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="skeleton h-3.5 w-2/3 rounded" />
          <div className="skeleton h-3 w-1/3 rounded" />
          <div className="flex gap-2 pt-1">
            <div className="skeleton h-2.5 w-24 rounded" />
            <div className="skeleton h-2.5 w-16 rounded" />
          </div>
          <div className="skeleton h-2.5 w-full rounded" />
          <div className="skeleton h-2.5 w-11/12 rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} delay={i * 90} />
      ))}
    </div>
  );
}
