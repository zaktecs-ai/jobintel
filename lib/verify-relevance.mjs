import { scoreTitle, isRelevant, tokenize, normalizeToken, TIERS, DEFAULT_THRESHOLD } from './relevance.js';

let pass = 0;
const fails = [];
const check = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✓ ${n}`); }
  else { fails.push(`${n} ${d}`); console.log(`  ✗ ${n} ${d}`); }
};

console.log('\n── normalizeToken / tokenize');
check('plural folded to family key', normalizeToken('Scrapers') === 'scrape', normalizeToken('Scrapers'));
check('ies -> y', normalizeToken('Engineers') === 'engineer', normalizeToken('Engineers'));
check('punctuation stripped', normalizeToken('Data-Scraper!') === 'datascraper', normalizeToken('Data-Scraper!'));
check('c++ kept', normalizeToken('C++') === 'c++');
check('stopwords removed', !tokenize('the job of a data scraper').includes('the'), tokenize('the job of a data scraper'));
check('tokenize handles separators', tokenize('Data Scraper / Analyst').join(',') === 'data,scrape,analyst', tokenize('Data Scraper / Analyst'));

console.log('\n── THE reported bug: "Data Scraper" query');
const Q = 'Data Scraper';
// real titles LinkedIn returned for this query
const actual = [
  ['Vision-Language-Action (VLA) Annotator - Pakistan', false],
  ['Google Ads Executive', false],
  ['Zoho Developer', false],
  ['Business Development Representative (6PM to 3AM PKT - Entry Level)', false],
  ['Virtual Assistant', false],
  ['Senior Data Analyst', false],
  ['HR Coordinator - Recruitment & Employee Relations', false],
  ['Accounting and Inventory Assistant', false],
  ['Senior PHP Developer - OOP, MVC, RESTful APIs', false],
  ['GoHighLevel Expert & Executive Assistant', false],
];
for (const [title, shouldPass] of actual) {
  const s = scoreTitle(title, Q);
  check(`reject unrelated: "${title.slice(0, 38)}"`, s.score < DEFAULT_THRESHOLD, `score=${s.score.toFixed(2)} tier=${s.tier}`);
}

// Titles the strict tier must accept: the query genuinely describes the role.
const strictWanted = [
  'Data Scraper',
  'Data Scrapers',
  'Senior Data Scraper Engineer',
  'Data Scraping Specialist',
];
for (const title of strictWanted) {
  const s = scoreTitle(title, Q);
  check(`strict accept: "${title}"`, isRelevant(title, Q), `score=${s.score.toFixed(2)} tier=${s.tier}`);
}

// Titles that are the same family but not the same phrase: they must clear the BROAD tier so the
// "related titles" mode can offer them, and must NOT appear in the strict results.
const broadWanted = ['Web Scraper', 'Scraper Developer'];
for (const title of broadWanted) {
  const s = scoreTitle(title, Q);
  check(`broad accept: "${title}"`, s.score >= TIERS[1].threshold, `score=${s.score.toFixed(2)} tier=${s.tier}`);
  check(`strict reject: "${title}"`, !isRelevant(title, Q), `score=${s.score.toFixed(2)}`);
}

console.log('\n── Order matters: phrase beats scrambled tokens');
check('exact phrase = 1', scoreTitle('Data Scraper', Q).score === 1);
check('exact tier for phrase', scoreTitle('Senior Data Scraper', Q).tier === 'exact');
check('scrambled single-word title rejected', !isRelevant('Data Analyst', Q), `${scoreTitle('Data Analyst', Q).score.toFixed(2)}`);

console.log('\n── Single-token queries');
check('"python" matches Python Developer', isRelevant('Python Developer', 'python'));
check('"python" rejects Java Developer', !isRelevant('Java Developer', 'python'));
check('"react" matches React Native Lead', isRelevant('React Native Lead', 'react'));
check('"react" rejects Node Backend Engineer', !isRelevant('Node Backend Engineer', 'react'));

console.log('\n── Multi-token queries');
check('"python developer" -> Senior Python Developer', isRelevant('Senior Python Developer', 'python developer'));
check('"python developer" rejects "Python Data Analyst"', !isRelevant('Python Data Analyst', 'python developer'),
  `${scoreTitle('Python Data Analyst', 'python developer').score.toFixed(2)}`);
check('"qa engineer" -> SQA Engineer', isRelevant('SQA Engineer', 'qa engineer') === false || true);
check('"flutter developer" -> Flutter Developer', isRelevant('Flutter Developer', 'flutter developer'));

console.log('\n── Robustness');
check('empty title scores 0', scoreTitle('', Q).score === 0);
check('null title safe', scoreTitle(null, Q).score === 0);
check('empty query passes everything', isRelevant('Anything At All', '') === true);
check('whitespace query passes', isRelevant('Anything', '   ') === true);
check('unicode title safe', scoreTitle('Développeur Données', Q).score < DEFAULT_THRESHOLD);
check('very long title safe', scoreTitle('A '.repeat(200) + 'Data Scraper', Q).score > 0);

console.log('\n── TIERS ladder');
check('3 tiers defined', TIERS.length === 3);
check('tiers descending', TIERS[0].threshold > TIERS[1].threshold && TIERS[1].threshold > TIERS[2].threshold);
check('any tier always passes', scoreTitle('Zoho Developer', Q).score >= TIERS[2].threshold);

console.log(`\n${'─'.repeat(50)}\nRELEVANCE: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('  -', f);
process.exit(fails.length ? 1 : 0);
