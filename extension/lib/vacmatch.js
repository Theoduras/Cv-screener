// Which of your vacancies is this application for? Used when CVs come in without a vacancy/req typed in,
// e.g. after adding every vacancy of a site at once. Strongest evidence first:
//   1. the letter or CV says what they apply for ("Application for Sales Manager", "solliciteer naar de functie van…");
//   2. a vacancy's title appears in the letter, or at the top of the CV;
//   3. best fit on the skills the ad asks for – a guess, and labelled as one.
import { parseSkills } from './parse.js';

const NOISE = new Set(['the', 'a', 'an', 'and', 'of', 'for', 'at', 'in', 'to', 'with', 'de', 'het', 'een', 'en', 'van', 'voor', 'bij', 'als', 'naar', 'op', 'in',
  'm', 'v', 'x', 'h', 'f', 'mv', 'parttime', 'fulltime', 'part', 'full', 'time', 'uur', 'hours', 'per', 'week', 'position', 'role', 'vacancy', 'job',
  'functie', 'vacature', 'positie', 'baan', 'nl', 'amp']);
const words = s => (String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9+#]+/g) || []).filter(w => w.length > 1 && !NOISE.has(w));
// "communications" ~ "communication", "analist" ~ "analyst": same first 5 letters, or equal
const same = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));
export function titleSimilarity(a, b) {
  const A = [...new Set(words(a))], B = [...new Set(words(b))];
  if (!A.length || !B.length) return 0;
  const hit = A.filter(x => B.some(y => same(x, y))).length;
  return 2 * hit / (A.length + B.length);
}

// Job names an applicant says they apply for, in English and Dutch.
const END = String.raw`(?=\s+(?:position|role|vacancy|job|at|with|bij|in)\b|[.,;:!()\n]|$)`;
const CLAIMS = [
  new RegExp(String.raw`(?:subject|re|regarding|betreft|onderwerp)\s*:\s*(?:application|sollicitatie|applying)?\s*(?:for|naar|voor|als|op)?\s*(?:the\s+|de\s+)?(?:position|role|functie|vacature)?\s*(?:of|van|als)?\s*(?:an?\s+|een\s+)?([^\n]{3,80}?)${END}`, 'gim'),
  new RegExp(String.raw`\b(?:apply|applying|application)\s+for\s+(?:the\s+)?(?:position\s+of\s+|role\s+of\s+|post\s+of\s+|vacancy\s+(?:of|for)\s+)?(?:an?\s+)?([^\n]{3,80}?)${END}`, 'gi'),
  new RegExp(String.raw`\bsollicit\w*\s+(?:ik\s+)?(?:graag\s+)?(?:naar|op|voor)\s+(?:de\s+)?(?:functie|vacature|positie|baan)?\s*(?:van|als|voor)?\s*(?:een\s+)?([^\n]{3,80}?)${END}`, 'gi'),
  new RegExp(String.raw`\b(?:functie|vacature)\s+(?:van|als|voor)\s+(?:een\s+)?([^\n]{3,60}?)${END}`, 'gi'),
  new RegExp(String.raw`\bthe\s+([^\n]{3,60}?)\s+(?:position|role|vacancy|opening)\b`, 'gi'),
];
export function appliedFor(text) {
  const out = [];
  for (const re of CLAIMS) for (const m of String(text || '').matchAll(re)) {
    const c = m[1].replace(/\s+/g, ' ').trim();
    if (words(c).length && !/^(your|our|this|that|the|jullie|uw|deze)\b/i.test(c)) out.push(c);
  }
  return out;
}

const skillCache = new Map();
const adSkills = v => {
  const key = v.tag + '|' + (v.text || '').length;
  if (!skillCache.has(key)) skillCache.set(key, parseSkills(`${v.title}\n${v.text || ''}`));
  return skillCache.get(key);
};

// vacancies: [{ tag, title, text }]; cand: { text, letterText, skills }
// -> { tag, how: 'applied' | 'named' | 'fit', why } or null
export function matchVacancy(cand, vacancies) {
  if (!vacancies.length) return null;
  const letter = cand.letterText || '', head = String(cand.text || '').slice(0, 1500);

  let best = null;
  for (const claim of [...appliedFor(letter), ...appliedFor(head)]) for (const v of vacancies) {
    const s = titleSimilarity(claim, v.title);
    if (s >= 0.6 && (!best || s > best.s)) best = { s, v, claim };
  }
  if (best) return { tag: best.v.tag, how: 'applied', why: `Says they apply for “${best.claim.slice(0, 70)}”` };

  const named = vacancies.filter(v => words(v.title).length >= 2 && new RegExp(`(?<![\\p{L}])${v.title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}])`, 'iu').test(letter + '\n' + head));
  if (named.length === 1) return { tag: named[0].tag, how: 'named', why: `Names the vacancy “${named[0].title}”` };

  const mine = new Set(cand.skills || []);
  const fits = vacancies.map(v => { const want = adSkills(v), got = want.filter(s => mine.has(s)); return { v, want, got, f: want.length ? got.length / want.length : 0 }; })
    .filter(x => x.want.length >= 3).sort((a, b) => b.f - a.f || b.got.length - a.got.length);
  const [top, next] = fits;
  if (top && top.got.length >= 3 && top.f >= 0.5 && (!next || top.f - next.f >= 0.2))
    return { tag: top.v.tag, how: 'fit', why: `Best fit on skills: ${top.got.length} of ${top.want.length} the ad asks for (${top.got.slice(0, 4).join(', ')})` };
  return null;
}
