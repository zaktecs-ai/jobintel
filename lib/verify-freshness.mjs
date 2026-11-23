import { parseLabel, parseDate, freshnessMs, isFreshWithin, formatAge } from './freshness.js';

let pass = 0;
const fails = [];
const check = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✓ ${n}`); }
  else { fails.push(`${n} ${d}`); console.log(`  ✗ ${n} ${d}`); }
};

const NOW = new Date('2026-11-23T12:00:00Z').getTime();
const H = 3600000;
const D = 86400000;

console.log('\n── parseLabel');
check('5 hours ago', parseLabel('5 hours ago', NOW) === NOW - 5 * H);
check('1 day ago', parseLabel('1 day ago', NOW) === NOW - D);
check('3 days ago', parseLabel('3 days ago', NOW) === NOW - 3 * D);
check('1 week ago', parseLabel('1 week ago', NOW) === NOW - 7 * D);
check('2 weeks ago', parseLabel('2 weeks ago', NOW) === NOW - 14 * D);
check('2 months ago', parseLabel('2 months ago', NOW) === NOW - 60 * D);
check('Today', parseLabel('Today', NOW) === NOW);
check('Just now', parseLabel('Just now', NOW) === NOW);
check('yesterday', parseLabel('yesterday', NOW) === NOW - D);
check('garbage -> null', parseLabel('apply now', NOW) === null);
check('empty -> null', parseLabel('', NOW) === null);
check('null -> null', parseLabel(null, NOW) === null);
check('minutes', parseLabel('45 minutes ago', NOW) === NOW - 45 * 60000);

console.log('\n── parseDate');
check('ISO date', parseDate('2026-11-23') === Date.UTC(2026, 10, 23));
check('with time stripped', parseDate('2026-11-23T09:00:00Z') === Date.UTC(2026, 10, 23));
check('bad -> null', parseDate('not-a-date') === null);
check('empty -> null', parseDate('') === null);

console.log('\n── freshnessMs (label vs date)');
const freshJob = { postedAt: '2026-11-23', postedLabel: '5 hours ago' };
check('sub-day label wins over date', freshnessMs(freshJob, NOW) === NOW - 5 * H, freshnessMs(freshJob, NOW));

const oldJob = { postedAt: '2026-11-20', postedLabel: '3 days ago' };
check('multi-day uses date', freshnessMs(oldJob, NOW) === Date.UTC(2026, 10, 20), freshnessMs(oldJob, NOW));

const labelOnly = { postedAt: '', postedLabel: '2 hours ago' };
check('label only works', freshnessMs(labelOnly, NOW) === NOW - 2 * H);

const dateOnly = { postedAt: '2026-11-18', postedLabel: '' };
check('date only works', freshnessMs(dateOnly, NOW) === Date.UTC(2026, 10, 18));

check('nothing -> 0', freshnessMs({}, NOW) === 0);

console.log('\n── isFreshWithin');
check('5h ago is within 3 days', isFreshWithin({ postedLabel: '5 hours ago' }, 3, NOW) === true);
check('4d ago is NOT within 3 days', isFreshWithin({ postedAt: '2026-11-19' }, 3, NOW) === false);
check('3d ago IS within 3 days', isFreshWithin({ postedAt: '2026-11-20' }, 3, NOW) === true);
check('no date is not fresh', isFreshWithin({}, 3, NOW) === false);

console.log('\n── formatAge');
check('existing label passthrough', formatAge({ postedLabel: '3 days ago' }, NOW) === '3 days ago');
check('whitespace collapsed', formatAge({ postedLabel: '  2   days\n ago ' }, NOW) === '2 days ago');
check('computed from date', formatAge({ postedAt: '2026-11-20' }, NOW) === '3 days ago', formatAge({ postedAt: '2026-11-20' }, NOW));
check('no data -> dash', formatAge({}, NOW) === '—');

console.log(`\n${'─'.repeat(46)}\nFRESHNESS: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('  -', f);
process.exit(fails.length ? 1 : 0);
