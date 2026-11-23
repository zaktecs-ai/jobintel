import { runSearch, fetchDetails, parseSearchPage, parseJobDetail } from './scraper.js';
import fs from 'node:fs';

const mode = process.argv[2] || 'search';

if (mode === 'search') {
  const t0 = Date.now();
  let all = [];
  const res = await runSearch({
    query: { keywords: process.argv[3] || 'python developer', location: process.argv[4] || 'Pakistan' },
    maxResults: Number(process.argv[5] || 30),
    budgetMs: 250000,
    onBatch: async (cards, meta) => {
      all.push(...cards);
      console.log(`  batch page=${meta.pageIndex} +${cards.length} total=${all.length} gap=${meta.gap}ms`);
    },
    onEvent: (e) => {
      if (e.type !== 'progress') console.log('  event', JSON.stringify(e));
    },
  });
  console.log('RESULT', JSON.stringify({ ...res, cursor: { ...res.cursor, seen: res.cursor.seen.length } }, null, 1));
  console.log('sample:', JSON.stringify(all[0], null, 1));
  fs.writeFileSync('/tmp/search_out.json', JSON.stringify(all, null, 1));
  console.log('elapsed', Date.now() - t0, 'ms  jobs', all.length);
}

if (mode === 'detail') {
  const jobs = JSON.parse(fs.readFileSync('/tmp/search_out.json', 'utf8')).slice(0, 3);
  const out = await fetchDetails(jobs, {
    budgetMs: 60000,
    onJob: (j, m) => console.log(`  ${j.id} ${j.detailStatus} seniority="${j.seniority}" desc=${j.description.length}chars gap=${m.gap}`),
  });
  console.log(JSON.stringify(out.jobs[0], null, 1).slice(0, 3000));
}
