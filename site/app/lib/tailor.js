// "Was this CV sent or rewritten per vacancy by a tool?" – a heuristic score with reasons, never a verdict.
// Separate from aiscore.js (was it *written* by AI): someone can write their own CV and still mass-send it.
import { AUTO_APPLY, TAILOR_FILE_HINT, TAILOR_ARTEFACTS, STOPWORDS } from './dict.js';

const STOP = new Set([...Object.values(STOPWORDS).flat(), 'a', 'an', 'or', 'on', 'is', 'are', 'be', 'we', 'you', 'your', 'our', 'will', 'this', 'that', 'om', 'te', 'je', 'wij', 'jij', 'zijn', 'ben', 'bent', 'heb', 'hebt', 'of', 'die', 'dat', 'als', 'door', 'naar', 'aan', 'ook']);
const tokens = t => (t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const N = 4;
const shingles = toks => {
  const out = new Map();
  for (let i = 0; i + N <= toks.length; i++) {
    const w = toks.slice(i, i + N);
    // "of the and in" is not a phrase anybody copied
    if (w.filter(x => !STOP.has(x) && x.length > 2).length < 2) continue;
    const k = w.join(' ');
    if (!out.has(k)) out.set(k, i);
  }
  return out;
};

// Phrases of the vacancy that appear word-for-word in the CV, plus the longest copied stretch as an example.
export function vacancyOverlap(cvText, vacancyText) {
  if (!vacancyText?.trim()) return { count: 0, example: '' };
  const vac = shingles(tokens(vacancyText));
  const cv = tokens(cvText);
  let count = 0, best = [0, 0], runStart = -1;
  const seen = new Set();
  for (let i = 0; i + N <= cv.length + 1; i++) {
    const k = i + N <= cv.length ? cv.slice(i, i + N).join(' ') : null;
    const hit = k && vac.has(k);
    if (hit && !seen.has(k)) { seen.add(k); count++; }
    if (hit && runStart < 0) runStart = i;
    if (!hit && runStart >= 0) {
      if (i - 1 + N - runStart > best[1] - best[0]) best = [runStart, i - 1 + N];
      runStart = -1;
    }
  }
  return { count, example: cv.slice(best[0], best[1]).join(' ').slice(0, 90) };
}

// Phrase sets, built once per letter when many letters are compared with each other.
export const shingleSet = text => new Set(shingles(tokens(text)).keys());
export function overlap(A, B) {
  if (!A.size || !B.size) return 0;
  const [small, big] = A.size < B.size ? [A, B] : [B, A];
  let n = 0; for (const k of small) if (big.has(k)) n++;
  return n / small.size;
}
// Share of 4-word phrases two texts have in common (0..1), for "nearly the same letter".
export function similarity(a, b) {
  const A = new Set(shingles(tokens(a)).keys()), B = new Set(shingles(tokens(b)).keys());
  if (!A.size || !B.size) return 0;
  let n = 0; for (const k of A) if (B.has(k)) n++;
  return n / Math.min(A.size, B.size);
}

// Role or organisation a letter is addressed to that the vacancy never mentions: the tell of a letter
// written for another job and sent here unchanged.
const ROLE_RE = [
  /\bthe ([A-Z][\w&-]*(?: [A-Z][\w&-]*){0,3}) (?:position|role|vacancy|job)\b/g,
  /\b(?:position|role|vacancy|job|opening) (?:of|as) (?:an? |the )?([A-Z][\w&-]*(?: [A-Z][\w&-]*){0,3})/g,
  /\b(?:position|role|vacancy) at ([A-Z][\w&-]*(?: [A-Z][\w&-]*){0,3})/g,
  /\bjoin (?:the team at )?([A-Z][\w&-]*(?: [A-Z][\w&-]*){0,2})/g,
  /\b(?:functie|vacature) (?:van|als|voor) (?:een )?([a-zA-Z][\w-]*(?: [a-zA-Z][\w-]*){0,2}?)(?= bij|[.,]|$)/gm,
  /\bbij ([A-Z][\w&-]*(?: [A-Z][\w&-]*){0,2})/g,
];
const IGNORE = /^(your|the|our|this|team|company|organisation|organization|jullie|uw|u|haar|hem)$/i;
export function wrongAddressee(letterText, vacancyText, tag = '') {
  if (!vacancyText?.trim()) return '';
  const hay = (vacancyText + ' ' + tag).toLowerCase();
  for (const re of ROLE_RE) {
    for (const m of letterText.matchAll(re)) {
      const name = m[1].trim();
      if (name.length < 3 || IGNORE.test(name) || /\[|company name/i.test(name)) continue;
      if (!hay.includes(name.toLowerCase())) return name;
    }
  }
  return '';
}

export function tailorScore(rec, { vacancyText = '', duplicates = 0, sameHolder = 0, similarLetters = 0, sameLetterVacancies = 0, tag = '' } = {}) {
  const reasons = [];
  let score = 0;
  const add = (pts, why) => { if (pts > 0) { score += pts; reasons.push(`${why} (+${Math.round(pts)})`); } };
  const text = rec.text || '';
  const meta = [rec.producer, rec.meta?.title, rec.meta?.subject, rec.meta?.keywords].filter(Boolean).join(' / ');

  const ov = vacancyOverlap(text, vacancyText);
  if (ov.count >= 4) add(Math.min(70, 14 + (ov.count - 4) * 4), `Copies ${ov.count} phrases from the vacancy word-for-word, e.g. "${ov.example}"`);

  if (sameHolder > 0) add(Math.min(40, 22 + 8 * (sameHolder - 1)), `Same person sent ${sameHolder + 1} differently worded versions of this CV to ${sameHolder + 1} vacancies`);
  if (duplicates > 0) add(Math.min(30, 18 + 6 * duplicates), `Exactly the same text as ${duplicates} other application(s)`);

  const hidden = rec.hiddenWords || 0;
  if (hidden >= 10) add(Math.min(45, 22 + hidden / 5), `${hidden} words of tiny or off-page text – often used to hide vacancy keywords`);

  const tool = (meta + ' ' + (rec.fileName || '')).match(AUTO_APPLY);
  if (tool) add(35, `Made or sent with an auto-apply tool ("${tool[0]}")`);
  const fileHint = ((rec.fileName || '') + ' ' + (rec.meta?.title || '')).match(TAILOR_FILE_HINT);
  if (fileHint) add(15, `File name or title says it was made for one job ("${fileHint[0]}")`);

  const arte = TAILOR_ARTEFACTS.map(re => (text.match(re) || [])[0]).filter(Boolean);
  if (arte.length) add(Math.min(35, 20 + 10 * (arte.length - 1)), `Tailoring-tool wording: "${arte[0]}"`);

  const kw = text.split('\n').find(l => /^\s*(keywords|key words|kernwoorden|trefwoorden|core competencies)\s*[:\-]/i.test(l) && l.split(/[,;|•]/).length >= 20);
  if (kw) add(20, `A long keyword list (${kw.split(/[,;|•]/).length} items) – typical of CVs stuffed to pass ATS filters`);

  if (rec.kind === 'letter') {
    if (sameLetterVacancies > 0) add(Math.min(45, 30 + 8 * (sameLetterVacancies - 1)), `Sent nearly the same letter to ${sameLetterVacancies + 1} vacancies – only the names changed`);
    if (similarLetters > 0) add(Math.min(40, 25 + 5 * similarLetters), `Nearly the same letter as ${similarLetters} other applicant(s) – a shared template or a tool`);
    const other = wrongAddressee(text, vacancyText, tag);
    if (other) add(30, `Addressed to "${other}", which this vacancy never mentions – possibly written for another job`);
  }

  score = Math.min(100, Math.round(score));
  return { score, level: score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low', reasons };
}
