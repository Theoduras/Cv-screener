import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, highlight } from '../extension/lib/query.js';

const ann = {
  name: 'Ann Smit', email: 'ann@example.com', location: 'Utrecht', skills: ['python', 'sql'], languages: ['Dutch', 'English'],
  cvLanguage: 'Dutch', education: 'Bachelor', tag: 'REQ-1', fileName: 'ann.pdf', years: 6, aiRes: { score: 10 },
  text: "Data analyst. Python and SQL. In het bezit van rijbewijs B. Driver's licence. BIG-registratie aanwezig. Recruiting events.",
};
const bob = {
  name: 'Bob Jong', email: 'bob@example.com', location: 'Rotterdam', skills: ['sap'], languages: ['English'], cvLanguage: 'English',
  education: 'Master', tag: 'REQ-2', fileName: 'bob.docx', years: 2, aiRes: { score: 80 },
  text: 'SAP consultant intern. Oracle databases.',
};
const hits = q => [ann, bob].filter(compile(q).test).map(r => r.name.split(' ')[0]);

test('words are ANDed, case-insensitive, whole words only', () => {
  assert.deepEqual(hits('python utrecht'), ['Ann']);
  assert.deepEqual(hits('PYTHON rotterdam'), []);
  assert.deepEqual(hits('sa'), [], 'no partial-word match');
});

test('phrases, OR, grouping, NOT', () => {
  assert.deepEqual(hits('"driver\'s licence"'), ['Ann']);
  assert.deepEqual(hits('"rijbewijs b"'), ['Ann']);
  assert.deepEqual(hits('python OR oracle'), ['Ann', 'Bob']);
  assert.deepEqual(hits('(sap OR python) -intern'), ['Ann']);
  assert.deepEqual(hits('NOT intern'), ['Ann']);
  assert.deepEqual(hits('sap AND oracle'), ['Bob']);
});

test('prefix wildcard', () => {
  assert.deepEqual(hits('recruit*'), ['Ann']);
  assert.deepEqual(hits('consult*'), ['Bob']);
});

test('fields and numeric comparisons', () => {
  assert.deepEqual(hits('skill:sap'), ['Bob']);
  assert.deepEqual(hits('loc:utrecht'), ['Ann']);
  assert.deepEqual(hits('lang:dutch'), ['Ann']);
  assert.deepEqual(hits('edu:master'), ['Bob']);
  assert.deepEqual(hits('years:>=5'), ['Ann']);
  assert.deepEqual(hits('years:<5 ai:>50'), ['Bob']);
  assert.deepEqual(hits('name:"ann smit"'), ['Ann']);
  assert.deepEqual(hits('tag:REQ-2'), ['Bob']);
});

test('bad syntax degrades to words and explains', () => {
  const c = compile('(python "rijbewijs');
  assert.match(c.error, /Could not read/);
  assert.deepEqual([ann, bob].filter(c.test).map(r => r.name), ['Ann Smit']);
  assert.equal(compile('').active, false);
});

test('matched terms and highlighting', () => {
  const c = compile('python OR oracle BIG*');
  assert.deepEqual(c.matched(ann), ['python', 'BIG*']);
  const html = highlight('Python &amp; BIG-registratie', c.terms);
  assert.equal(html, '<mark>Python</mark> &amp; <mark>BIG</mark>-registratie');
});
