import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tailorScore, vacancyOverlap } from '../extension/lib/tailor.js';

const human = readFileSync(new URL('./fixtures/human-nl.txt', import.meta.url), 'utf8');
const vacancy = `Recruiter (32 hours) – Utrecht
You will be responsible for the full recruitment cycle for our technical vacancies.
You have experience with stakeholder management in a fast-growing organisation and you are comfortable
working with an applicant tracking system such as Oleeo. You build strong relationships with hiring managers
and you know how to attract passive candidates through LinkedIn and events.`;
const tailored = `Mark de Boer
mark@example.com
Profile
Experienced recruiter responsible for the full recruitment cycle for technical vacancies.
I have experience with stakeholder management in a fast-growing organisation and I am comfortable
working with an applicant tracking system such as Oleeo. I build strong relationships with hiring managers
and know how to attract passive candidates through LinkedIn and events.`;

test('copying the vacancy word-for-word scores; an ordinary CV does not', () => {
  const t = tailorScore({ text: tailored }, { vacancyText: vacancy });
  const h = tailorScore({ text: human }, { vacancyText: vacancy });
  assert.ok(t.score >= 55, `tailored ${t.score} ${t.reasons}`);
  assert.match(t.reasons[0], /Copies \d+ phrases from the vacancy/);
  assert.ok(h.score < 25, `human ${h.score} ${h.reasons}`);
  assert.equal(vacancyOverlap(tailored, '').count, 0, 'no vacancy text, no signal');
  assert.match(vacancyOverlap(tailored, vacancy).example, /stakeholder management in a fast growing organisation/);
});

test('same person, several vacancies; identical text; hidden words', () => {
  assert.match(tailorScore({ text: human }, { sameHolder: 2 }).reasons[0], /sent 3 differently worded versions/);
  assert.ok(tailorScore({ text: human }, { duplicates: 1 }).score >= 18);
  const hid = tailorScore({ text: human, hiddenWords: 60 });
  assert.ok(hid.score >= 25 && /tiny or off-page/.test(hid.reasons[0]));
  assert.equal(tailorScore({ text: human, hiddenWords: 3 }).score, 0);
});

test('tool fingerprints, file names and leftover wording', () => {
  assert.match(tailorScore({ text: human, producer: 'LazyApply PDF engine' }).reasons[0], /auto-apply tool/);
  assert.match(tailorScore({ text: human, fileName: 'CV_ATS-optimized_Recruiter.pdf' }).reasons[0], /made for one job/);
  assert.match(tailorScore({ text: human + '\nThis CV is ATS-friendly.' }).reasons[0], /Tailoring-tool wording/);
  const kw = 'Keywords: ' + Array.from({ length: 30 }, (_, i) => 'skill' + i).join(', ');
  assert.match(tailorScore({ text: human + '\n' + kw }).reasons[0], /long keyword list/);
  assert.equal(tailorScore({ text: human, fileName: 'Sanne de Vries CV.pdf' }).score, 0);
});
