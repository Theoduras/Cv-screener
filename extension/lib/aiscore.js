// Heuristic "was this written by an AI tool?" score. An indicator with reasons, never a verdict.
import { LLM_PHRASES, PLACEHOLDERS, AI_PRODUCERS, US_SPELLING, UK_SPELLING, GENERIC_GREETING } from './dict.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A phrase may wrap onto the next line in a PDF, so any run of whitespace counts as its space.
const PHRASE_RES = LLM_PHRASES.map(p => [p, new RegExp(`(?<!\\p{L})${esc(p).replace(/ /g, '\\s+')}(?!\\p{L})`, 'giu')]);
// "X, Y, and Z": the list of three that LLM prose reaches for in nearly every sentence.
const ITEM = "\\p{L}[\\p{L}'’ -]{0,40}?";
const TRIPLET = new RegExp(`(?<!\\p{L})${ITEM},\\s+${ITEM},?\\s+(?:and|en)\\s+\\p{L}+`, 'giu');
const shortList = m => {
  const parts = m.replace(/\s+/g, ' ').trim().split(', ');
  parts[0] = parts[0].split(' ').slice(-3).join(' ');
  return parts.join(', ').slice(0, 80);
};
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20,
  een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, twaalf: 12, vijftien: 15, twintig: 20 };
const CLAIM = new RegExp(`(\\d{1,2}|${Object.keys(NUM).join('|')})\\+?\\s+(?:years?|jaar|jaren)\\s+(?:of\\s+)?(?:(?:relevant|professional|hands-on|proven|werk)\\s+)?(?:experience|ervaring|werkervaring)`, 'i');
const ROUND_METRIC = /\b(?:by|with|met)\s+(\d{1,3})\s?%|\b(\d{1,3})\s?%\s+(?:increase|improvement|growth|reduction|uplift|stijging|verbetering|groei)/gi;

const cv = xs => {
  if (xs.length < 2) return 1;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return mean ? sd / mean : 1;
};

// Raise when the signals change, so CVs already stored are scored again.
export const AI_VERSION = 2;
export const level = score => score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low';

export function aiScore(text, { producer = '', kind = 'cv', location = '', years = 0 } = {}) {
  const reasons = [];
  let score = 0;
  const add = (pts, why) => { if (pts > 0) { score += pts; reasons.push(`${why} (+${Math.round(pts)})`); } };
  const words = (text.match(/\p{L}+/gu) || []).length || 1;

  const hits = {};
  for (const [p, re] of PHRASE_RES) { const n = (text.match(re) || []).length; if (n) hits[p] = n; }
  const nHits = Object.values(hits).reduce((a, b) => a + b, 0);
  const per100 = nHits / words * 100;
  const top = Object.entries(hits).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => n > 1 ? `${p} ×${n}` : p);
  // A letter is all prose: wording is most of the evidence there is, so it may count for more than in a CV.
  add(Math.min(kind === 'letter' ? 60 : 40, Math.max(0, per100 - 0.4) * 22), `Typical AI wording: ${top.join(', ')}`);

  const triplets = text.match(TRIPLET) || [];
  if (triplets.length >= 3) add(Math.min(kind === 'letter' ? 15 : 8, (triplets.length / words * 100 - 0.5) * (kind === 'letter' ? 10 : 8)),
    `${triplets.length} lists of three ("${shortList(triplets[0])}")`);

  // A European applicant writing American English: the model's default spelling, not theirs.
  if (location) {
    const us = text.match(US_SPELLING) || [], uk = text.match(UK_SPELLING) || [];
    if (us.length >= 2 && !uk.length) add(Math.min(8, 2 + us.length * 1.5), `American spelling from an applicant in ${location} (${[...new Set(us.map(w => w.toLowerCase()))].slice(0, 3).join(', ')})`);
  }

  if (kind === 'letter') {
    const generic = (text.match(/\byour (organi[sz]ation|company|team|firm|business)\b/gi) || []);
    if (generic.length >= 2) add(Math.min(10, generic.length * 2.5), `Never names the company: says "${generic[0].toLowerCase()}" ${generic.length} times`);
    const g = text.match(GENERIC_GREETING);
    if (g) add(4, `Addressed to nobody in particular ("${g[0].trim()}")`);
  }

  const claim = text.match(CLAIM);
  if (claim && years) {
    const n = NUM[claim[1].toLowerCase()] ?? +claim[1];
    if (Math.abs(n - years) >= 2) add(8, `Says ${n} years of experience, but the dates add up to ${years} – ask about it`);
  }

  const metrics = [...text.matchAll(ROUND_METRIC)].filter(m => +(m[1] || m[2]) % 5 === 0);
  if (metrics.length) add(Math.min(8, metrics.length * 4), `Round, unexplained result${metrics.length > 1 ? 's' : ''} ("${metrics[0][0].trim()}")`);

  const dashes = (text.match(/—/g) || []).length;
  add(Math.min(12, dashes / words * 1000 * 1.5), `${dashes} em-dashes (—)`);

  const sentences = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => (s.match(/\p{L}+/gu) || []).length).filter(n => n >= 4);
  if (sentences.length >= 8) {
    const v = cv(sentences);
    add(Math.min(15, (0.45 - v) * 60), `Sentences are unusually uniform in length (variation ${v.toFixed(2)})`);
  }

  if (kind === 'letter') {
    const paras = text.split(/\n\s*\n/).map(p => (p.match(/\p{L}+/gu) || []).length).filter(n => n >= 25);
    if (paras.length >= 4) {
      const v = cv(paras);
      add(Math.min(6, (0.3 - v) * 40), `${paras.length} paragraphs of near-identical length`);
    }
  }

  const bullets = text.split('\n').map(l => l.trim()).filter(l => /^[•▪●◦\-*–]\s+\S/.test(l)).map(l => l.length);
  if (bullets.length >= 6) {
    const v = cv(bullets);
    add(Math.min(10, (0.3 - v) * 50), `${bullets.length} bullet points of near-identical length`);
  }

  const ph = PLACEHOLDERS.map(re => (text.match(re) || [])[0]).filter(Boolean);
  if (ph.length) add(Math.min(60, 45 + 10 * (ph.length - 1)), `Leftover template/AI text: "${ph[0].slice(0, 50)}"`);

  if (producer && AI_PRODUCERS.test(producer)) add(25, `PDF made with "${producer.slice(0, 40)}"`);

  score = Math.min(100, Math.round(score));
  return { score, level: level(score), reasons, wording: Math.round(per100 * 10) / 10 };
}

// Stable fingerprint of the content, ignoring whitespace/case, to spot mass-sent CVs.
export function textHash(text) {
  const s = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = (h2 * 31 + s.charCodeAt(i)) | 0; }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}
