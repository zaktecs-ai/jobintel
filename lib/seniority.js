/**
 * Seniority matching.
 *
 * LinkedIn's server-side f_E filter is loose: asking for Entry level still returns a large share of
 * Mid-Senior postings (measured: 10 of 25 on a "Data Scraper / Pakistan / Entry / 24h" query).
 * The server filter is a recall mechanism, not a guarantee, so the requested levels are also
 * enforced against the seniority we read from each posting's detail page.
 *
 * Rules:
 *   - no levels requested       -> everything passes
 *   - posting has no seniority  -> passes (we cannot prove it is wrong)
 *   - "Not Applicable" / "N/A"  -> passes only when the user picked no narrow tier, because
 *                                  LinkedIn uses that for postings with no defined level
 *   - otherwise                 -> must be one of the requested tiers
 */

export const LEVEL_NAMES = {
  1: 'Internship',
  2: 'Entry level',
  3: 'Associate',
  4: 'Mid-Senior level',
  5: 'Director',
  6: 'Executive',
};

const NO_LEVEL = /^(not applicable|n\/a|none|-)$/i;

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does a posting's seniority satisfy the requested levels?
 * @param {string} seniority  as parsed from the detail page ("Entry level", "Mid-Senior level", ...)
 * @param {number[]} wanted   requested f_E codes (1..6)
 */
export function matchesSeniority(seniority, wanted) {
  if (!wanted?.length) return true;
  const got = normalize(seniority);
  if (!got) return true; // unknown -> do not hide a real job we cannot classify
  if (NO_LEVEL.test(got)) return true;
  const targets = wanted.map((n) => normalize(LEVEL_NAMES[n])).filter(Boolean);
  return targets.includes(got);
}

/** Human summary of the requested levels, for the status bar and the log. */
export function describeLevels(wanted) {
  if (!wanted?.length) return 'any level';
  return wanted.map((n) => LEVEL_NAMES[n] || String(n)).join(', ');
}
