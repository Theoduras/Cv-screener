import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { docKind, linkLetters, fileStem } from '../extension/lib/doctype.js';

const fx = f => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');

test('letters and CVs are told apart', () => {
  assert.equal(docKind(fx('letter-human.txt'), 'sanne.pdf'), 'letter');
  assert.equal(docKind(fx('letter-ai.txt'), 'john.docx'), 'letter');
  assert.equal(docKind(fx('human-nl.txt'), 'sanne.pdf'), 'cv');
  assert.equal(docKind(fx('ai-en.txt'), 'john.pdf'), 'cv');
  assert.equal(docKind('Some text without much to go on.', 'Motivatiebrief Sanne.pdf'), 'cv', 'file name alone is not enough');
  assert.equal(docKind('Dear Anna,\nshort note\nKind regards', 'x.pdf'), 'letter');
});

test('file stems', () => {
  assert.equal(fileStem('jan-jansen-cv.pdf'), 'jan jansen');
  assert.equal(fileStem('Jan_Jansen_motivatiebrief_v2.docx'), 'jan jansen');
});

test('letters link by email, then name, then capture, then file name', () => {
  const docs = [
    { id: 'c1', kind: 'cv', email: 'a@x.nl', name: 'Ann Smit', fileName: 'ann.pdf', addedAt: 1 },
    { id: 'c2', kind: 'cv', name: 'Bob Jong', fileName: 'bob-cv.pdf', captureId: 'k1', addedAt: 1 },
    { id: 'c3', kind: 'cv', fileName: 'carla-de-wit-cv.pdf', addedAt: 1 },
    { id: 'l1', kind: 'letter', email: 'A@X.nl', fileName: 'x.pdf' },
    { id: 'l2', kind: 'letter', name: 'bob jong', fileName: 'y.pdf' },
    { id: 'l3', kind: 'letter', captureId: 'k1', fileName: 'z.pdf' },
    { id: 'l4', kind: 'letter', fileName: 'Carla de Wit motivation.docx' },
    { id: 'l5', kind: 'letter', name: 'Nobody', fileName: 'q.pdf' },
  ];
  assert.deepEqual(linkLetters(docs), { l1: 'c1', l2: 'c2', l3: 'c2', l4: 'c3' });
});
