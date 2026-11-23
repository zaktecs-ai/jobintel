import { workplaceOf, matchesWorkplace } from './workplace.js';

let pass = 0;
const fails = [];
const check = (n, c, d = '') => {
  if (c) { pass += 1; console.log(`  ✓ ${n}`); }
  else { fails.push(`${n} ${d}`); console.log(`  ✗ ${n} ${d}`); }
};

console.log('\n── workplaceOf');
check('Remote in location', workplaceOf({ location: 'Remote' }) === 'remote');
check('remote lowercase in title', workplaceOf({ location: 'Lahore', title: 'Backend Engineer (remote)' }) === 'remote');
check('Anywhere in location', workplaceOf({ location: 'Anywhere in Pakistan' }) === 'remote');
check('Work from home', workplaceOf({ location: 'Work from home' }) === 'remote');
check('Hybrid', workplaceOf({ location: 'Karachi (Hybrid)' }) === 'hybrid');
check('hybrid beats remote when both', workplaceOf({ location: 'Hybrid / remote possible' }) === 'hybrid');
check('On-site', workplaceOf({ location: 'Lahore (On-site)' }) === 'on_site');
check('plain city -> empty', workplaceOf({ location: 'Lahore, Punjab, Pakistan' }) === '');
check('empty job -> empty', workplaceOf({}) === '');
check('null safe', workplaceOf(null) === '');

console.log('\n── matchesWorkplace');
check('no filter accepts all', matchesWorkplace({ location: 'Lahore' }, '') === true);
check('remote filter keeps remote', matchesWorkplace({ location: 'Remote' }, 'remote') === true);
check('remote filter drops onsite', matchesWorkplace({ location: 'Lahore' }, 'remote') === false);
check('server-side signal keeps plain card',
  matchesWorkplace({ location: 'Lahore', matchedRemoteFilter: true }, 'remote') === true);
check('hybrid filter keeps hybrid', matchesWorkplace({ location: 'Lahore (Hybrid)' }, 'hybrid') === true);
check('onsite filter keeps onsite', matchesWorkplace({ location: 'Lahore (On-site)' }, 'on_site') === true);
check('onsite filter drops remote', matchesWorkplace({ location: 'Remote' }, 'on_site') === false);

console.log(`\n${'─'.repeat(46)}\nWORKPLACE: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log('  -', f);
process.exit(fails.length ? 1 : 0);
