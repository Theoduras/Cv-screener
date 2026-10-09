import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCV, parseYears } from '../extension/lib/parse.js';
import { aiScore, textHash } from '../extension/lib/aiscore.js';

const fx = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const human = fx('human-nl.txt'), ai = fx('ai-en.txt');

test('parses a Dutch human CV', () => {
  const c = parseCV(human);
  assert.equal(c.name, 'Sanne de Vries');
  assert.equal(c.email, 'sanne.devries@example.nl');
  assert.equal(c.location, 'Utrecht');
  assert.deepEqual(c.languages.sort(), ['Dutch', 'English', 'German']);
  assert.equal(c.cvLanguage, 'Dutch');
  assert.ok(c.skills.includes('salarisadministratie'));
  assert.ok(c.years >= 11 && c.years < 12, `years ${c.years}`); // 2015..now(2026-10), education excluded
  assert.equal(c.education, 'Bachelor');
});

test('parses an English CV', () => {
  const c = parseCV(ai);
  assert.equal(c.name, 'John Petersen');
  assert.equal(c.location, 'Amsterdam');
  assert.deepEqual(c.languages.sort(), ['Dutch', 'English']);
  for (const s of ['python', 'docker', 'aws', 'react', 'postgresql', 'ci/cd']) assert.ok(c.skills.includes(s), s);
  assert.ok(!c.skills.includes('java'), 'javascript-free CV must not match java');
  assert.equal(c.education, 'Master');
});

test('overlapping jobs are not double counted', () => {
  const y = parseYears('Werkervaring\n2010 - 2015 A\n2012 - 2014 B\n2016 - 2018 C', new Date(2026, 0, 1));
  assert.equal(y, 7);
});

test('AI score separates the two fixtures', () => {
  const h = aiScore(human), a = aiScore(ai);
  assert.ok(h.score < 25, `human ${h.score} ${h.reasons}`);
  assert.ok(a.score >= 55, `ai ${a.score} ${a.reasons}`);
  assert.ok(a.reasons.some(r => r.includes('template')));
});

test('producer and duplicates raise the score', () => {
  assert.ok(aiScore(human, { producer: 'Kickresume PDF' }).score >= 25);
  assert.ok(aiScore(human, { duplicates: 2 }).score >= 25);
  assert.equal(textHash('Hallo  Wereld'), textHash('hallo wereld'));
});
