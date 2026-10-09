import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchVacancy, appliedFor, titleSimilarity } from '../extension/lib/vacmatch.js';
import { parseCV } from '../extension/lib/parse.js';

const fx = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const V = (tag, title, text = '') => ({ tag, title, text });
const vacancies = [
  V('Marketing & Communications Specialist – BrightWave', 'Marketing & Communications Specialist', 'Social media, SEO, Google Analytics, content creation.'),
  V('Data Analist – Acme', 'Data Analist', 'SQL, Python, Power BI, data analysis, Excel. Dashboards bouwen.'),
  V('Recruiter – Groen & Co', 'Recruiter', 'Werving en selectie, LinkedIn, Oleeo.'),
  V('Data Engineer – Acme', 'Data Engineer', 'Python, PostgreSQL, Docker, AWS and CI/CD pipelines.'),
];
const cand = (cvFile, letterFile = null) => { const t = fx(cvFile); return { text: t, letterText: letterFile ? fx(letterFile) : '', skills: parseCV(t).skills }; };

test('what the applicant says they apply for, in English and Dutch', () => {
  assert.ok(appliedFor(fx('ai-letter-thomas.txt')).some(c => /Marketing & Communications Specialist/.test(c)));
  assert.ok(appliedFor('Hierbij solliciteer ik naar de functie van Data Analist bij Acme.').includes('Data Analist'));
  assert.ok(appliedFor('Graag solliciteer ik op de vacature Recruiter.').includes('Recruiter'));
  assert.ok(appliedFor('I would like to apply for the position of Senior Data Analyst at Acme.').includes('Senior Data Analyst'));
  assert.deepEqual(appliedFor('I look forward to joining your team.'), []);
  assert.ok(titleSimilarity('Marketing and Communication Specialist', 'Marketing & Communications Specialist (32-40 uur)') >= 0.6, 'endings and noise words');
  assert.ok(titleSimilarity('Sales Manager', 'Data Analist') === 0);
});

test('a cover letter that names the job links the candidate to that vacancy', () => {
  const m = matchVacancy(cand('ai-cv-thomas.txt', 'ai-letter-thomas.txt'), vacancies);
  assert.equal(m.tag, 'Marketing & Communications Specialist – BrightWave');
  assert.equal(m.how, 'applied');
  assert.match(m.why, /Says they apply for/);
});

test('a vacancy title in the letter, then best fit on skills – and no guess when it is unclear', () => {
  const named = matchVacancy({ text: 'CV', letterText: 'Beste Jan, de vacature voor Data Analist sprak me direct aan.', skills: [] }, vacancies);
  assert.equal(named.tag, 'Data Analist – Acme');
  const fit = matchVacancy(cand('ai-en.txt'), vacancies);
  assert.equal(fit?.how, 'fit', JSON.stringify(fit));
  assert.equal(fit.tag, 'Data Engineer – Acme', '5 of 5 skills, while the analist ad gets 2 of 5');
  assert.match(fit.why, /Best fit on skills: \d of \d/);
  assert.equal(matchVacancy({ text: 'Ik ben kok en zoek werk in een restaurant.', letterText: '', skills: [] }, vacancies), null, 'nothing fits: not linked');
  assert.equal(matchVacancy(cand('ai-en.txt'), []), null);
});

test('Sanne’s Dutch letter about recruitment does not get dragged to an unrelated vacancy', () => {
  const m = matchVacancy(cand('human-nl.txt', 'letter-human.txt'), vacancies.slice(0, 2));
  assert.equal(m, null, JSON.stringify(m));
});
