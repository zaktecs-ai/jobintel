/**
 * Workplace detection.
 *
 * LinkedIn does not return a workplace field on the guest card, so we infer from the text we do
 * have: the location line ("Remote", "Anywhere in Pakistan", "Hybrid") and the title, which often
 * carries it ("Senior Frontend Engineer (Remote, Anywhere)").
 *
 * When the search itself was filtered server-side (f_WT=2) every returned card is remote by
 * definition, so the caller marks the batch `matchedRemoteFilter` and we honour that.
 */
const REMOTE_RE = /\bremote\b|\banywhere\b|\bwork\s*from\s*home\b|\bwfh\b|\bworldwide\b|\bdistributed\b/i;
const HYBRID_RE = /\bhybrid\b|\bpartially remote\b/i;
const ONSITE_RE = /\bon[- ]?site\b|\bin[- ]?office\b/i;

export function workplaceOf(job) {
  const hay = `${job?.location || ''} ${job?.title || ''}`;
  if (HYBRID_RE.test(hay)) return 'hybrid';
  if (REMOTE_RE.test(hay)) return 'remote';
  if (ONSITE_RE.test(hay)) return 'on_site';
  return '';
}

export function matchesWorkplace(job, want) {
  if (!want) return true;
  const got = workplaceOf(job);
  if (got) return got === want;
  // No signal in the card text: trust a server-side filter we actually asked LinkedIn for.
  return job?.matchedRemoteFilter === true;
}
