import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tailorScore, similarity, wrongAddressee } from '../extension/lib/tailor.js';
import { aiScore } from '../extension/lib/aiscore.js';

const fx = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const human = fx('letter-human.txt'), ai = fx('letter-ai.txt');
const vacancy = 'Recruiter technical department – Bouwgroep Jansen, Utrecht. You recruit site managers and planners.';

test('AI check reads letters: templated letter scores high, human letter low', () => {
  assert.ok(aiScore(ai).score >= 55, `ai ${aiScore(ai).score}`);
  assert.ok(aiScore(human, { kind: 'letter' }).score < 25, `human ${aiScore(human).score} ${aiScore(human).reasons}`);
  const noPlaceholder = ai.replace('[Company Name]', 'Acme');
  assert.ok(aiScore(noPlaceholder, { kind: 'letter' }).score >= 55, 'wording alone can mark a letter as AI-written');
  assert.ok(aiScore(noPlaceholder, { kind: 'letter' }).score > aiScore(noPlaceholder).score, 'letters weigh wording more than CVs');
});

test('nearly identical letters are recognised, different ones are not', () => {
  const swapped = ai.replace('Software Engineer', 'Data Engineer').replace('[Company Name]', 'Acme');
  assert.ok(similarity(ai, swapped) > 0.8);
  assert.ok(similarity(ai, human) < 0.1);
  const t = tailorScore({ text: ai, kind: 'letter' }, { similarLetters: 2, sameLetterVacancies: 1 });
  assert.ok(t.score >= 55 && t.reasons.some(r => /only the names changed/.test(r)) && t.reasons.some(r => /shared template/.test(r)));
  assert.equal(tailorScore({ text: ai, kind: 'cv' }, { similarLetters: 2 }).score, 0, 'letter signals only apply to letters');
});

test('letter addressed to another job', () => {
  const other = 'Dear team,\nI am applying for the position of Sales Manager at Philips.\nKind regards';
  assert.equal(wrongAddressee(other, vacancy), 'Sales Manager');
  assert.equal(wrongAddressee('I am applying for the position of Recruiter at Bouwgroep Jansen.', vacancy), '');
  assert.equal(wrongAddressee(other, ''), '', 'needs vacancy text');
  assert.equal(wrongAddressee(ai, vacancy), 'Software Engineer');
  assert.match(tailorScore({ text: other, kind: 'letter' }, { vacancyText: vacancy }).reasons[0], /Addressed to "Sales Manager"/);
});
