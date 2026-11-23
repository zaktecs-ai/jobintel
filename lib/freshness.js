/**
 * Freshness helpers — one source of truth for "how old is this posting".
 *
 * LinkedIn gives us two signals per card:
 *   postedAt    ISO date, day precision  ("2026-11-19")
 *   postedLabel human label, sub-day     ("5 hours ago", "3 days ago", "2 weeks ago")
 * The label is more precise for very fresh posts, so we prefer it when it parses and fall back
 * to the date. Everything returns epoch ms so sorting and filtering agree.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const UNIT_MS = {
  second: 1000,
  seconds: 1000,
  minute: MIN,
  minutes: MIN,
  hour: HOUR,
  hours: HOUR,
  day: DAY,
  days: DAY,
  week: 7 * DAY,
  weeks: 7 * DAY,
  month: 30 * DAY,
  months: 30 * DAY,
  year: 365 * DAY,
  years: 365 * DAY,
};

/** Parse "5 hours ago" / "3 days ago" / "1 week ago" / "Today" / "Just now". */
export function parseLabel(label, now = Date.now()) {
  if (!label) return null;
  const s = String(label).toLowerCase().trim();
  if (!s) return null;
  if (/just now|moments? ago|today/.test(s)) return now;
  if (/^yesterday$/.test(s)) return now - DAY;
  const m = s.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/);
  if (!m) return null;
  const unit = UNIT_MS[m[2]];
  if (!unit) return null;
  return now - Number(m[1]) * unit;
}

/** Parse an ISO date at UTC midnight. */
export function parseDate(iso) {
  if (!iso) return null;
  const t = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Best available "posted at" timestamp. Prefers the label when it is more precise than a day
 * (sub-24h), otherwise the ISO date, which is timezone-stable.
 */
export function freshnessMs(job, now = Date.now()) {
  const fromLabel = parseLabel(job?.postedLabel, now);
  const fromDate = parseDate(job?.postedAt);
  if (fromLabel == null && fromDate == null) return 0;
  if (fromLabel == null) return fromDate;
  if (fromDate == null) return fromLabel;
  // Within the same day the label wins; otherwise trust the date (labels bucket by named unit).
  const delta = Math.abs(now - fromLabel);
  return delta < DAY ? fromLabel : fromDate;
}

/**
 * True when the posting is inside `days` (inclusive).
 *
 * Comparison is by calendar day, not by elapsed hours: LinkedIn's ISO date is a whole day, so
 * measuring from UTC midnight would make a posting dated "3 days ago" look 3.5 days old at noon
 * and silently drop it from a 3-day filter. Midnight-normalising both sides fixes that.
 */
export function isFreshWithin(job, days, now = Date.now()) {
  const ts = freshnessMs(job, now);
  if (!ts) return false;
  const DAY = 24 * HOUR;
  const todayStart = Math.floor(now / DAY) * DAY;
  const postedStart = Math.floor(ts / DAY) * DAY;
  return (todayStart - postedStart) / DAY <= days;
}

/** Human label, or a computed one when the card has none. */
export function formatAge(job, now = Date.now()) {
  if (job?.postedLabel) return job.postedLabel.replace(/\s+/g, ' ').trim();
  const ts = freshnessMs(job, now);
  if (!ts) return '—';
  const diff = now - ts;
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} hours ago`;
  // Day counts are calendar days, matching isFreshWithin: a posting dated 3 days back reads
  // "3 days ago" even at noon, never "4 days ago".
  const todayStart = Math.floor(now / DAY) * DAY;
  const postedStart = Math.floor(ts / DAY) * DAY;
  const days = Math.round((todayStart - postedStart) / DAY);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? '1 month ago' : `${months} months ago`;
}
