// Heuristic "was this written by an AI tool?" score. An indicator with reasons, never a verdict.
import { LLM_PHRASES, PLACEHOLDERS, AI_PRODUCERS } from './dict.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASE_RES = LLM_PHRASES.map(p => [p, new RegExp(`(?<!\\p{L})${esc(p)}(?!\\p{L})`, 'giu')]);

const cv = xs => {
  if (xs.length < 2) return 1;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return mean ? sd / mean : 1;
};

export function aiScore(text, { producer = '', kind = 'cv' } = {}) {
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

  const dashes = (text.match(/—/g) || []).length;
  add(Math.min(12, dashes / words * 1000 * 1.5), `${dashes} em-dashes (—)`);

  const sentences = text.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => (s.match(/\p{L}+/gu) || []).length).filter(n => n >= 4);
  if (sentences.length >= 8) {
    const v = cv(sentences);
    add(Math.min(15, (0.45 - v) * 60), `Sentences are unusually uniform in length (variation ${v.toFixed(2)})`);
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
  return { score, level: score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low', reasons };
}

// Stable fingerprint of the content, ignoring whitespace/case, to spot mass-sent CVs.
export function textHash(text) {
  const s = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = (h2 * 31 + s.charCodeAt(i)) | 0; }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
}
