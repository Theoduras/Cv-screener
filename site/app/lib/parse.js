// CV text -> structured candidate. Pure functions, no DOM: runs in the extension and in node tests.
import { SKILLS, CITIES, POSTCODE_REGION, LANGUAGES, STOPWORDS } from './dict.js';

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termRe = t => new RegExp(`(?<![\\p{L}\\p{N}#+.])${esc(t)}(?![\\p{L}\\p{N}#+])`, 'giu');
const SKILL_RES = SKILLS.map(s => [s, termRe(s)]);
const cap = s => s.replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

const HEADINGS = /^(curriculum vitae|cv|resume|résumé|lebenslauf|profiel|profile|persoonlijke gegevens|personal (details|information)|contact|over mij|about me|samenvatting|summary)$/i;
const PARTICLES = new Set(['van', 'de', 'der', 'den', 'het', 'ten', 'ter', 'te', "'t", 'van der', 'la', 'le', 'da', 'di', 'el', 'al', 'bin', 'von']);

export function parseName(lines) {
  for (const l of lines.slice(0, 40)) {
    const m = l.match(/^(naam|name|volledige naam|full name)\s*[:\-]\s*(.+)$/i);
    if (m) return m[2].trim();
  }
  for (const raw of lines.slice(0, 10)) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l || HEADINGS.test(l) || /[\d@:/|]/.test(l) || l.length > 45) continue;
    const words = l.split(' ');
    if (words.length < 2 || words.length > 5) continue;
    const ok = words.every(w => PARTICLES.has(w.toLowerCase()) || /^\p{Lu}[\p{L}'’.-]*$/u.test(w));
    if (ok) return l === l.toUpperCase() ? cap(l.toLowerCase()) : l;
  }
  return '';
}

export function parseLocation(text) {
  const head = text.slice(0, 1500);
  const lab = head.match(/(woonplaats|location|locatie|adres|address|wohnort|plaats|city)\s*[:\-]\s*([^\n]{2,80})/i);
  const zone = lab ? lab[2] : head;
  const lower = zone.toLowerCase();
  let best = null;
  for (const c of CITIES) {
    const m = termRe(c).exec(lower);
    if (m && (best === null || m.index < best.i)) best = { c, i: m.index };
  }
  if (best) return cap(best.c);
  const pc = head.match(/\b([1-9]\d)\d{2}\s?[A-Z]{2}\b/);
  if (pc && POSTCODE_REGION[+pc[1]]) return cap(POSTCODE_REGION[+pc[1]]) + ' (regio)';
  if (lab) return lab[2].split(/[,|]/).pop().trim().slice(0, 40);
  return '';
}

export function parseLanguages(text) {
  const lower = text.toLowerCase();
  // Only look where languages are discussed, or the CV's language would count as a skill.
  const sec = lower.match(/(talen(kennis)?|languages?|sprachen|langues|taalvaardigheid)\s*[:\n][\s\S]{0,400}/);
  const zone = sec ? sec[0] : '';
  const found = [];
  for (const [canon, names] of Object.entries(LANGUAGES)) {
    const leveled = n => new RegExp(`(?<!\\p{L})${esc(n)}\\s*[:(\\-–]?\\s*(moedertaal|native|vloeiend|fluent|goed|good|basis|basic|c1|c2|b1|b2|a1|a2)`, 'iu');
    if (names.some(n => termRe(n).test(zone) || leveled(n).test(lower)))
      found.push(canon);
  }
  return found;
}

export function detectLanguage(text) {
  const words = text.toLowerCase().match(/\p{L}+/gu) || [];
  const counts = {};
  for (const [lang, sw] of Object.entries(STOPWORDS)) {
    const set = new Set(sw);
    counts[lang] = words.reduce((n, w) => n + set.has(w), 0);
  }
  const [lang, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n >= 3 ? { nl: 'Dutch', en: 'English', de: 'German', fr: 'French' }[lang] : '';
}

export function parseSkills(text, extra = []) {
  const found = new Set();
  let rest = text;
  for (const [s, re] of [...extra.map(s => [s.toLowerCase(), termRe(s.toLowerCase())]), ...SKILL_RES]) {
    re.lastIndex = 0;
    if (re.test(rest)) { found.add(s); rest = rest.replace(re, ' '); }
  }
  return [...found];
}

const MONTHS = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mrt: 3, maart: 3, mar: 3, march: 3,
  apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, aug: 8, augustus: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MON = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const DATE = `(?:(?:${MON})\\.?\\s+\\d{4}|\\d{1,2}[\\/.-]\\d{4}|\\d{4})`;
const NOW = '(?:heden|present|nu|now|current|huidig|today|current|actueel|lopend|ongoing|heute)';
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|t\\/m|tot|to|until|bis|à)\\s*(${DATE}|${NOW})`, 'giu');
const EDU_HEAD = /^(opleiding(en)?|education|studie|studies|cursussen|courses|certificat|ausbildung|scholing)/i;
const WORK_HEAD = /^(werkervaring|ervaring|work experience|experience|employment|loopbaan|career|berufserfahrung|professional experience|werk)/i;

function toMonth(s, now) {
  s = s.toLowerCase().trim();
  if (new RegExp(`^${NOW}$`, 'iu').test(s)) return now;
  let m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return +m[2] * 12 + (+m[1] - 1);
  m = s.match(new RegExp(`^(${MON})\\.?\\s+(\\d{4})$`, 'iu'));
  if (m) return +m[2] * 12 + MONTHS[m[1]] - 1;
  m = s.match(/^(\d{4})$/);
  return m ? +m[1] * 12 : null;
}

export function parseYears(text, today = new Date()) {
  const now = today.getFullYear() * 12 + today.getMonth();
  const spans = [];
  let section = 'work';
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.length < 40 && EDU_HEAD.test(t)) section = 'edu';
    else if (t.length < 40 && WORK_HEAD.test(t)) section = 'work';
    if (section === 'edu') continue;
    for (const m of t.matchAll(RANGE)) {
      const a = toMonth(m[1], now), b = toMonth(m[2], now);
      if (a == null || b == null || b < a || a < 1960 * 12 || b > now + 1) continue;
      spans.push([a, b === a ? a + 1 : b]);
    }
  }
  spans.sort((x, y) => x[0] - y[0]);
  let total = 0, cur = null;
  for (const s of spans) {
    if (!cur || s[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [...s]; }
    else cur[1] = Math.max(cur[1], s[1]);
  }
  if (cur) total += cur[1] - cur[0];
  let years = Math.round(total / 12 * 10) / 10;
  if (!years) {
    const m = text.match(/(\d{1,2})\+?\s*(jaar|jaren|years?|jahre)\s+(werk)?(ervaring|experience|erfahrung)/i);
    if (m) years = +m[1];
  }
  return years;
}

export function parseEducation(text) {
  const l = text.toLowerCase();
  if (/\b(phd|ph\.d|doctor(aat)?|promotie)\b/.test(l)) return 'PhD';
  if (/\b(master|msc|m\.sc|ma|mba|llm|drs\.?|mr\.|ir\.|wo)\b/.test(l)) return 'Master';
  if (/\b(bachelor|bsc|b\.sc|ba|hbo|bc\.|ing\.)\b/.test(l)) return 'Bachelor';
  if (/\b(mbo|niveau [1-4])\b/.test(l)) return 'Vocational (MBO)';
  if (/\b(havo|vwo|vmbo|atheneum|gymnasium)\b/.test(l)) return 'Secondary';
  return '';
}

export function parseCV(text, { extraSkills = [] } = {}) {
  const clean = text.replace(/\r/g, '').replace(/[ \t ]+/g, ' ');
  const lines = clean.split('\n').map(s => s.trim()).filter(Boolean);
  const email = (clean.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0].toLowerCase();
  const phone = ((clean.match(/(\+\d{2}[\s-]?|0)(\(0\)\s?)?\d([\s-]?\d){7,10}/) || [''])[0]).trim();
  const linkedin = (clean.match(/linkedin\.com\/in\/[\w-]+/i) || [''])[0];
  return {
    name: parseName(lines) || (email ? cap(email.split('@')[0].replace(/[._\d]+/g, ' ').trim()) : ''),
    email, phone, linkedin,
    location: parseLocation(clean),
    languages: parseLanguages(clean),
    cvLanguage: detectLanguage(clean),
    skills: parseSkills(clean, extraSkills),
    years: parseYears(clean),
    education: parseEducation(clean),
  };
}
