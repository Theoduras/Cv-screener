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
};
const NUMERIC = { years: r => r.years, ai: r => r.aiRes?.score ?? r.baseAi?.score };
const all = r => [r.text, r.name, r.email, r.location, (r.skills || []).join(' '), (r.languages || []).join(' '),
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
  const body = esc(prefix ? v.slice(0, -1) : v).replace(/\\\*/g, '[\\p{L}\\p{N}]*').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${prefix ? '[\\p{L}\\p{N}]*' : '(?![\\p{L}\\p{N}])'}`, 'iu');
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
  const t = r => rx.test(hay(r) || '');
  terms.push({ label, test: t, highlight: !field || field === 'text' ? rx : null });
  return t;
}

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
export function highlight(escapedHtml, terms) {
  let out = escapedHtml;
  for (const t of terms) {
    if (!t.highlight) continue;
    const g = new RegExp(t.highlight.source, 'giu');
    out = out.replace(g, m => `<mark>${m}</mark>`);
  }
  return out;
}
