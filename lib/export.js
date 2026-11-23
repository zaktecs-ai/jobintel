'use client';

export function toCSV(jobs) {
  const cols = [
    ['title', 'Title'],
    ['company', 'Company'],
    ['location', 'Location'],
    ['postedAt', 'Posted date'],
    ['postedLabel', 'Posted'],
    ['seniority', 'Seniority'],
    ['employmentType', 'Employment type'],
    ['industry', 'Industry'],
    ['salary', 'Salary'],
    ['earlyApplicant', 'Early applicant'],
    ['url', 'URL'],
    ['description', 'Description'],
  ];
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map(([, label]) => esc(label)).join(',');
  const body = jobs
    .map((j) => cols.map(([k]) => esc(j[k])).join(','))
    .join('\n');
  return `${head}\n${body}`;
}

export function downloadCSV(jobs, filename) {
  const blob = new Blob([`\uFEFF${toCSV(jobs)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadJSON(jobs, filename) {
  const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
