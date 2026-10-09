import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiScore } from '../extension/lib/aiscore.js';
import { parseCV } from '../extension/lib/parse.js';

const fx = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const score = (text, kind) => { const p = parseCV(text); return aiScore(text, { kind, location: p.location, years: p.years }); };
const has = (r, re) => r.reasons.some(x => re.test(x));
// The giveaways a real applicant would have deleted: detection must not depend on them.
const strip = t => t.replace(/Fictional example.*$/gm, '').replace(/fictional /g, '');

test('ChatGPT CV and cover letter score red, even with the template footer removed', () => {
  for (const [f, kind] of [['ai-cv-thomas.txt', 'cv'], ['ai-letter-thomas.txt', 'letter']]) {
    const full = score(fx(f), kind), clean = score(strip(fx(f)), kind);
    assert.ok(full.score >= 55, `${f} ${full.score}`);
    assert.ok(clean.score >= 55, `${f} stripped ${clean.score} ${clean.reasons}`);
    assert.ok(!has(clean, /template/), 'stripped version scores on style alone');
  }
});

test('human-written CVs and letters stay green, in Dutch and in English', () => {
  for (const [f, kind] of [['human-nl.txt', 'cv'], ['human-en.txt', 'cv'], ['letter-human.txt', 'letter'], ['letter-human-en.txt', 'letter']]) {
    const r = score(fx(f), kind);
    assert.ok(r.score < 25, `${f} ${r.score} ${r.reasons}`);
  }
});

test('each new signal, and its quiet counterpart', () => {
  const letter = strip(fx('ai-letter-thomas.txt')), cv = strip(fx('ai-cv-thomas.txt'));
  const l = score(letter, 'letter'), c = score(cv, 'cv');
  assert.ok(has(l, /eager to contribute/), 'phrase wrapped over two lines is found');
  assert.ok(has(l, /lists of three/));
  assert.ok(has(l, /Never names the company/));
  assert.ok(has(l, /Dear Hiring Manager/));
  assert.ok(has(c, /American spelling from an applicant in Amsterdam/));
  assert.ok(has(c, /Says 4 years of experience, but the dates add up to/));
  assert.ok(has(c, /Round, unexplained result/));

  const plain = 'I have over four years of experience in sales.';
  assert.ok(has(aiScore(plain, { years: 7 }), /Says 4 years/));
  assert.ok(!has(aiScore(plain, { years: 5 }), /Says 4 years/), 'close enough is fine');
  assert.ok(!has(aiScore(plain, {}), /Says/), 'no dates, nothing to compare');

  const us = 'We analyze the organization and its optimization.';
  assert.ok(has(aiScore(us, { location: 'Utrecht' }), /American spelling/));
  assert.ok(!has(aiScore(us, {}), /American spelling/), 'no European location, no signal');
  assert.ok(!has(aiScore(us + ' I learnt a lot.', { location: 'Utrecht' }), /American spelling/), 'mixed spelling is a person');

  assert.ok(!has(aiScore('Sales grew by 23% in a year.', {}), /Round/), 'a specific number is not flagged');
});
