// Search syntax for the screener. Pure, no DOM: tested in node.
//   nurse utrecht            both words (AND)
//   "driver's licence"       exact phrase
//   sap OR oracle, ( … )     either, with grouping
//   -intern / NOT intern     exclude
//   recruit*                 prefix
//   skill:python loc:utrecht field search; years:>=5 ai:<30 numeric
// Bad syntax never throws: it falls back to plain words and says so in `error`.

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FIELDS = {
  name: r => r.name, email: r => r.email, phone: r => r.phone,
  location: r => r.location, loc: r => r.location, city: r => r.location,
  skill: r => (r.skills || []).join(', '), skills: r => (r.skills || []).join(', '),
  lang: r => [...(r.languages || []), r.cvLanguage].join(', '), language: r => [...(r.languages || []), r.cvLanguage].join(', '),
  edu: r => r.education, education: r => r.education,
  tag: r => r.tag, vacancy: r => r.tag, req: r => r.tag,
  file: r => r.fileName, text: r => r.text,
  // a letter shown on its own has no CV; otherwise the CV is the row's text and its letters ride along
  cv: r => r.letterOnly ? '' : r.text, letter: r => r.letterOnly ? r.text : r.letterText,
};
const NUMERIC = { years: r => r.years, ai: r => r.aiRes?.score ?? r.baseAi?.score, tool: r => r.tailRes?.score };
const all = r => [r.text, r.letterOnly ? '' : r.letterText, r.name, r.email, r.location, (r.skills || []).join(' '), (r.languages || []).join(' '),
  r.cvLanguage, r.education, r.tag, r.fileName].filter(Boolean).join('\n');

function tokenize(q) {
  const out = [];
  const re = /\s*(?:(\()|(\))|(-)(?=\S)|([\p{L}\p{N}_]+):(?:"([^"]*)"|(>=|<=|>|<|=)?([^\s()]+))|"([^"]*)"|([^\s()"]+))/uy;
  let m, last = 0;
  while ((m = re.exec(q)) && m[0].length) {
    last = re.lastIndex;
    if (m[1]) out.push({ t: '(' });
    else if (m[2]) out.push({ t: ')' });
    else if (m[3]) out.push({ t: 'NOT' });
    else if (m[4]) out.push({ t: 'term', field: m[4].toLowerCase(), value: m[5] ?? m[7], op: m[6], phrase: m[5] != null });
    else if (m[8] != null) out.push({ t: 'term', value: m[8], phrase: true });
    else if (/^(OR|AND|NOT)$/.test(m[9])) out.push({ t: m[9] });
    else out.push({ t: 'term', value: m[9] });
  }
  if (q.slice(last).trim()) throw new Error('unclosed quote');
  return out;
}

function parse(tokens) {
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  const or = () => {
    const kids = [and()];
    while (peek()?.t === 'OR') { next(); kids.push(and()); }
    return kids.length > 1 ? { or: kids } : kids[0];
  };
  const and = () => {
    const kids = [unary()];
    while (peek() && peek().t !== ')' && peek().t !== 'OR') { if (peek().t === 'AND') next(); kids.push(unary()); }
    return kids.length > 1 ? { and: kids } : kids[0];
  };
  const unary = () => {
    if (peek()?.t === 'NOT') { next(); return { not: unary() }; }
    const tok = next();
    if (!tok) throw new Error('query ends too early');
    if (tok.t === '(') { const n = or(); if (next()?.t !== ')') throw new Error('missing )'); return n; }
    if (tok.t !== 'term') throw new Error(`unexpected ${tok.t}`);
    return tok;
  };
  const tree = or();
  if (i < tokens.length) throw new Error(`unexpected ${tokens[i].t}`);
  return tree;
}

function termRegex(value, phrase) {
  const v = value.trim();
  const prefix = !phrase && v.endsWith('*');
  // word~ = the word plus common endings (nurse -> nurses, recruit -> recruiter), used by the plain-word boxes
  const loose = !phrase && v.endsWith('~');
  const body = esc(prefix || loose ? v.slice(0, -1) : v).replace(/\\\*/g, '[\\p{L}\\p{N}]*').replace(/\s+/g, '\\s+');
  const tail = prefix ? '[\\p{L}\\p{N}]*' : loose ? '(?:s|es|en|er|ers|ing|ed|ment|ments)?(?![\\p{L}\\p{N}])' : '(?![\\p{L}\\p{N}])';
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${tail}`, 'iu');
}

// ---------- typo tolerance for "similar" words (word~) ----------
// Both sides may be misspelled: the recruiter's "pyhton", or the CV's "managment".
const ENDINGS = ['ments', 'ment', 'ers', 'ing', 'es', 'er', 'ed', 'en', 's'];
export function stem(w) {
  w = w.toLowerCase();
  for (const e of ENDINGS) if (w.endsWith(e) && w.length - e.length >= 3) return w.slice(0, -e.length);
  return w;
}
// Optimal-string-alignment distance (a swap of two neighbours counts as one edit), stopping early past `max`.
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
// Short words must be exact: "sql" ~ "sap" would be noise.
const allowed = len => len <= 3 ? 0 : len <= 7 ? 1 : 2;
export function similarWord(word, target) {
  const w = word.toLowerCase(), t = target.toLowerCase();
  if (stem(w) === stem(t)) return true;
  // Typos are measured on the whole words, not the stems: otherwise "docker" -> "dock" sits one letter from "docx".
  const k = allowed(Math.min(w.length, t.length));
  return k > 0 && w[0] === t[0] && editDistance(w, t, k) <= k;
}
const vocabCache = new Map();
function vocab(text) {
  let v = vocabCache.get(text);
  if (!v) {
    if (vocabCache.size > 4000) vocabCache.clear();
    v = [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []))];
    vocabCache.set(text, v);
  }
  return v;
}
// Closest real word for a search word that finds nothing ("Did you mean …?").
export function suggest(word, words) {
  const w = word.toLowerCase();
  let best = null, bestD = 3;
  for (const c of words) {
    if (c === w || c.length < 3 || c[0] !== w[0]) continue;
    const d = editDistance(stem(w), stem(c), 2);
    if (d < bestD) { best = c; bestD = d; } // ties keep the earlier word: callers list known skills and frequent words first
  }
  return bestD <= 2 ? best : null;
}

function build(node, terms) {
  if (node.or) { const f = node.or.map(n => build(n, terms)); return r => f.some(g => g(r)); }
  if (node.and) { const f = node.and.map(n => build(n, terms)); return r => f.every(g => g(r)); }
  if (node.not) {
    const inner = [];
    const f = build(node.not, inner);
    terms.push(...inner.map(t => ({ label: 'not ' + t.label, test: t.test, negative: true })));
    return r => !f(r);
  }
  const { field, value = '', op, phrase } = node;
  const label = (field ? field + ':' : '') + (op || '') + (phrase ? `"${value}"` : value);
  if (field && NUMERIC[field]) {
    const n = parseFloat(value);
    const get = NUMERIC[field];
    const cmp = { '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '=': (a, b) => a === b }[op || '='];
    const t = r => { const v = get(r); return typeof v === 'number' && !Number.isNaN(n) && cmp(v, n); };
    terms.push({ label, test: t });
    return t;
  }
  const re = termRegex(value, phrase);
  const get = field && FIELDS[field] ? FIELDS[field] : field ? null : all;
  // An unknown "field:" is just text with a colon in it (e.g. "c#:" or a time "9:00").
  const hay = get || (r => all(r));
  const rx = get ? re : termRegex(`${field}:${value}`, true);
  const word = value.trim().slice(0, -1);
  const fuzzy = get && !phrase && value.trim().endsWith('~') && /^[\p{L}\p{N}]+$/u.test(word);
  const variants = r => fuzzy ? vocab(hay(r) || '').filter(w => similarWord(w, word)) : [];
  const t = fuzzy ? r => rx.test(hay(r) || '') || variants(r).length > 0 : r => rx.test(hay(r) || '');
  const marks = !field || ['text', 'cv', 'letter'].includes(field);
  terms.push({ label, test: t, highlight: marks ? rx : null, variants: marks ? variants : null });
  return t;
}

// The plain boxes as a query string. A term is { text, mode: similar|exact|starts, field: any|skill|loc|... }
// (a bare string is a "similar" term anywhere, which is how saved searches from 0.3 are stored).
export function termCode(t) {
  t = typeof t === 'string' ? { text: t } : t;
  const text = t.text.trim().replace(/"/g, '');
  const single = /^[\p{L}\p{N}]+$/u.test(text);
  const v = t.mode === 'exact' || !single ? `"${text}"` : t.mode === 'starts' ? `${text}*` : `${text}~`;
  return (t.field && t.field !== 'any' ? `${t.field}:` : '') + v;
}

export function fromWords({ all = [], any = [], groups, none = [] } = {}) {
  groups = (groups ?? [any]).filter(g => g.length);
  return [
    ...all.map(termCode),
    ...groups.map(g => g.length > 1 ? `(${g.map(termCode).join(' OR ')})` : termCode(g[0])),
    ...none.map(t => `-${termCode(t)}`),
  ].join(' ');
}

const FIELD_WORD = { skill: 'skills', loc: 'location', edu: 'education', lang: 'languages', name: 'name', text: 'text', cv: 'CV', letter: 'cover letter' };
// What a term looks like to a person: no quotes, no ~, "skill:python" -> "python (skills)".
export const plainLabel = l => {
  const m = l.match(/^(not )?([a-z]+):(.*)$/);
  const clean = s => s.replace(/["~]/g, '');
  return m && FIELD_WORD[m[2]] ? `${m[1] || ''}${clean(m[3])} (${FIELD_WORD[m[2]]})` : clean(l);
};

export function compile(q) {
  const query = (q || '').trim();
  if (!query) return { active: false, test: () => true, terms: [], error: '' };
  let tree, error = '';
  try {
    tree = parse(tokenize(query));
  } catch (e) {
    error = `Could not read the search (${e.message}) – searching for all the words instead.`;
    const words = query.replace(/["()]/g, ' ').split(/\s+/).filter(w => w && !/^(AND|OR|NOT|-)$/.test(w)).map(w => w.replace(/^-/, ''));
    tree = { and: words.map(w => ({ t: 'term', value: w })) };
  }
  const terms = [];
  const test = build(tree, terms);
  return { active: true, test, terms, error, matched: r => terms.filter(t => !t.negative && t.test(r)).map(t => t.label) };
}

// Wrap every positive text term in <mark>. Input must already be HTML-escaped.
// `row` lets a typo-tolerant term mark the misspelled variant it actually found.
export function highlight(escapedHtml, terms, row) {
  const sources = [];
  for (const t of terms) {
    if (!t.highlight) continue;
    sources.push(t.highlight.source);
    const v = row && t.variants ? t.variants(row) : [];
    if (v.length) sources.push(`(?<![\\p{L}\\p{N}])(?:${v.map(esc).join('|')})(?![\\p{L}\\p{N}])`);
  }
  if (!sources.length) return escapedHtml;
  // One pass with every pattern, so a <mark> is never placed inside another one.
  return escapedHtml.replace(new RegExp(sources.map(s => `(?:${s})`).join('|'), 'giu'), m => `<mark>${m}</mark>`);
}
