/**
 * Title relevance — the core promise of the tool.
 *
 * LinkedIn's keyword search is broad on purpose: a "Data Scraper" query returns "Virtual Assistant",
 * "Google Ads Executive", "Senior Data Analyst" and more, because the words appear somewhere in the
 * posting body. That is fine for recall but wrong for a job board whose whole job is to answer
 * "show me Data Scraper roles".
 *
 * So every returned posting is scored against the query and only postings that actually match the
 * requested role are kept. Matching is token-based with three tiers:
 *
 *   exact   - the full phrase appears in the title ("data scraper")
 *   strong  - every meaningful query token appears in the title (any order, plurals folded)
 *   partial - a majority of tokens appear AND at least one is in the title's head noun position
 *
 * A posting passes at `strong` by default. Tokens are normalised (lowercase, punctuation stripped,
 * simple plural folding) so "Data Scrapers", "data-scraper" and "DATA SCRAPER" all match.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'or', 'the', 'of', 'for', 'in', 'on', 'at', 'to', 'with', 'by',
  'job', 'jobs', 'role', 'roles', 'position', 'opening', 'vacancy', 'required', 'wanted',
]);

/** Families that must compare equal even though their spellings differ. */
const FAMILY = {
  scraper: 'scrape', scrapers: 'scrape', scraping: 'scrape', scraped: 'scrape',
  developer: 'develop', developers: 'develop', development: 'develop', developing: 'develop',
  engineer: 'engineer', engineers: 'engineer', engineering: 'engineer',
  analyst: 'analyst', analysts: 'analyst', analysis: 'analyst', analytics: 'analyst',
  manager: 'manage', managers: 'manage', management: 'manage', managing: 'manage',
  designer: 'design', designers: 'design', designing: 'design',
  tester: 'test', testers: 'test', testing: 'test',
};

/**
 * Fold a word to a comparable key.
 * A small explicit family table handles the pairs a suffix rule gets wrong (engineer/engineering,
 * analyst/analysis, manager/management); everything else folds plurals only.
 *
 * The plural rule is deliberately narrow: strip a trailing "s" only when the result is a word we
 * would actually compare against — dropping it blindly turned "specialist" into "specialis" and
 * made unrelated titles match a shortened query token.
 */
export function normalizeToken(word) {
  const t = String(word || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, '');
  if (!t) return '';
  if (FAMILY[t]) return FAMILY[t];
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  // Only plurals that stay recognisable: never strip "s" off "-ist", "-ous", "-us", "-ss", "-is".
  if (t.length > 4 && t.endsWith('s') && !/(?:ist|ous|us|ss|is|as)s?$/.test(t)) return t.slice(0, -1);
  return t;
}

export function tokenize(value) {
  return String(value || '')
    .split(/[\s,/|()\[\]{}·—–-]+/)
    .map(normalizeToken)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Score a job title against the search query.
 * @returns {{score:number, tier:'exact'|'strong'|'partial'|'weak'|'none', matched:string[], missing:string[]}}
 */
export function scoreTitle(title, keywords) {
  const titleTokens = tokenize(title);
  const queryTokens = tokenize(keywords);
  if (!queryTokens.length) return { score: 1, tier: 'exact', matched: [], missing: [] };

  const titleSet = new Set(titleTokens);
  const haystack = ` ${titleTokens.join(' ')} `;
  const phrase = queryTokens.join(' ');

  const matched = queryTokens.filter((t) => titleSet.has(t));
  const missing = queryTokens.filter((t) => !titleSet.has(t));
  const ratio = matched.length / queryTokens.length;

  // exact: the whole query appears as a contiguous phrase in the title
  if (queryTokens.length > 1 && haystack.includes(` ${phrase} `)) {
    return { score: 1, tier: 'exact', matched, missing };
  }
  // single-word query: a title-token hit is as good as it gets
  if (queryTokens.length === 1 && matched.length === 1) {
    return { score: 1, tier: 'exact', matched, missing };
  }
  if (!missing.length) {
    return { score: 0.95, tier: 'strong', matched, missing };
  }
  // partial: most tokens present and the head noun lands in the title
  if (ratio >= 0.6) {
    const headInTitle = queryTokens.slice(-1).some((t) => titleSet.has(t));
    if (headInTitle) return { score: 0.5 + ratio * 0.3, tier: 'partial', matched, missing };
  }
  // A single token match on a multi-word query is enough when it is the *distinctive* word —
  // "Web Scraper" for a "Data Scraper" search is a real match; "Data Analyst" is not.
  if (matched.length === 1 && queryTokens.length === 2 && titleSet.has(queryTokens[queryTokens.length - 1])) {
    return { score: 0.55, tier: 'partial', matched, missing };
  }
  return { score: ratio * 0.4, tier: ratio > 0 ? 'weak' : 'none', matched, missing };
}

/** Minimum score a posting needs to be shown for a query. */
export const DEFAULT_THRESHOLD = 0.9;

export function isRelevant(title, keywords, threshold = DEFAULT_THRESHOLD) {
  return scoreTitle(title, keywords).score >= threshold;
}

/**
 * Relaxation ladder. A narrow query ("senior python data scraper engineer") can match nothing at
 * the strict threshold; rather than showing unrelated jobs we step the threshold down in stages and
 * report which stage was used, so the UI can say "showing 80% matches" honestly.
 */
export const TIERS = [
  { id: 'strict', threshold: 0.9, label: 'closely matching titles' },
  { id: 'broad', threshold: 0.55, label: 'related titles' },
  { id: 'any', threshold: 0, label: 'all LinkedIn results' },
];
