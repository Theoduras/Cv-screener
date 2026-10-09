// Vacancy finder, the pure part: which kind of source a URL is, and turning what it returns into job ads.
// No network and no DOM here, so all of it runs in node tests.

// Job boards that forbid crawlers (or answer them with 403): never fetched, only read from a tab the
// recruiter has open themselves, with "Collect vacancies from this page" in the extension.
export const TAB_ONLY = /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|werk\.nl|nationalevacaturebank\.nl|werkzoeken\.nl|stepstone\.[a-z.]+|intermediair\.nl|monsterboard\.nl|jooble\.org|adzuna\.[a-z.]+|jobbird\.com)$/i;

// One-click suggestions. {q} and {city} are filled from the search box; "tab" ones open in a tab.
export const PRESETS = [
  { name: 'LinkedIn Jobs', url: 'https://www.linkedin.com/jobs/search/?keywords={q}&location={city}' },
  { name: 'Indeed', url: 'https://nl.indeed.com/jobs?q={q}&l={city}' },
  { name: 'Werk.nl (UWV)', url: 'https://www.werk.nl/werkzoekenden/vacatures/?zoekterm={q}&locatie={city}' },
  { name: 'Nationale Vacaturebank', url: 'https://www.nationalevacaturebank.nl/vacature/zoeken?query={q}&location={city}' },
  { name: 'Werkzoeken.nl', url: 'https://www.werkzoeken.nl/vacatures/?what={q}&where={city}' },
  { name: 'StepStone', url: 'https://www.stepstone.nl/vacatures/{q}/in-{city}' },
  { name: 'Intermediair', url: 'https://www.intermediair.nl/vacatures?query={q}' },
  { name: 'Glassdoor', url: 'https://www.glassdoor.nl/Vacature/index.htm?sc.keyword={q}' },
  { name: 'Jobbird', url: 'https://www.jobbird.com/nl/vacature?s={q}' },
  // read automatically: one keyword parameter only, since its robots.txt forbids a second ("&search")
  { name: 'YoungCapital', url: 'https://www.youngcapital.nl/vacatures?search%5Bkeywords_scope%5D={q}' },
];

const host = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
const seg = (u, i = 0) => { try { return new URL(u).pathname.split('/').filter(Boolean)[i] || ''; } catch { return ''; } };

// What a pasted URL is, and where its ads can be read. Throws on something that is not a web address.
export function detectSource(input) {
  let url = String(input || '').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('Not a web address');
  const h = u.hostname.toLowerCase(), co = seg(url);
  const src = (type, extra = {}) => ({ type, url, label: extra.label || h.replace(/^www\./, '') + (co && type !== 'page' ? '/' + co : ''), ...extra });
  if (TAB_ONLY.test(h)) return src('tab');
  if (/(^|\.)greenhouse\.io$/.test(h) && co) return src('greenhouse', { api: `https://boards-api.greenhouse.io/v1/boards/${co}/jobs?content=true` });
  if (h === 'jobs.lever.co' && co) return src('lever', { api: `https://api.lever.co/v0/postings/${co}?mode=json` });
  if (h === 'jobs.eu.lever.co' && co) return src('lever', { api: `https://api.eu.lever.co/v0/postings/${co}?mode=json` });
  if (/^(jobs|careers)\.smartrecruiters\.com$/.test(h) && co) return src('smartrecruiters', { api: `https://api.smartrecruiters.com/v1/companies/${co}/postings?limit=100` });
  if (h === 'apply.workable.com' && co) return src('workable', { api: `https://apply.workable.com/api/v1/widget/accounts/${co}?details=true` });
  if (/\.recruitee\.com$/.test(h)) return src('recruitee', { api: `https://${h}/api/offers/`, label: h });
  if (/\.jobs\.personio\.(de|com)$/.test(h)) return src('personio', { api: `https://${h}/xml`, label: h });
  return src('page');
}

// {q} and {city} in a source URL come from the search box.
export const fillUrl = (url, q = '', city = '') => url.replace(/\{q\}/g, encodeURIComponent(q)).replace(/\{city\}/g, encodeURIComponent(city));

// ---------- text helpers ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', euro: '€', eacute: 'é', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', bull: '•' };
export const decode = s => String(s ?? '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
export function htmlToText(html) {
  html = String(html ?? '');
  // many sites (and Greenhouse) put entity-escaped HTML in their descriptions: "&lt;p&gt;…"
  if (/&lt;\/?[a-z]/i.test(html) && !/<\/?[a-z][^>]*>/i.test(html)) html = decode(html);
  return decode(html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|section|ul|ol)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
const clean = s => decode(String(s ?? '')).replace(/\s+/g, ' ').trim();

function hashId(s) {
  let h1 = 0x811c9dc5, h2 = 7;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619); h2 = (h2 * 31 + s.charCodeAt(i)) | 0; }
  return 'j' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

const dateOnly = d => { if (!d) return ''; const t = typeof d === 'number' ? new Date(d) : new Date(String(d)); return isNaN(t) ? '' : t.toISOString().slice(0, 10); };

// The same ad behind different tracking links is one ad; but ?jk=… (Indeed) or ?id=… *is* the ad.
const TRACKING = /^(utm_.*|trk|trkinfo|ref|refid|referrer|trackingid|from|src|source|position|pagenum|origin|gclid|fbclid|mc_[a-z]+|sid|lipi)$/i;
export function canonical(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return u.href.replace(/\/(?=\?|$)/, '').toLowerCase();
  } catch { return String(url).toLowerCase(); }
}

// Every ad, whatever it came from, ends up in this shape.
export function normalise(j, source = {}) {
  const url = j.url ? String(j.url).trim() : '';
  const title = clean(j.title), company = clean(j.company), location = clean(j.location);
  return {
    id: hashId(url ? canonical(url) : `${title}|${company}`.toLowerCase()),
    title, company, location, url, posted: dateOnly(j.posted),
    text: (j.text || '').slice(0, 20000), source: source.label || '', sourceUrl: source.url || '',
  };
}

// Same ad from two places (or twice in one listing) is kept once; the longer text wins.
export function dedupe(jobs) {
  const seen = new Map();
  for (const j of jobs) {
    if (!j.title) continue;
    const k2 = `${j.title}|${j.company}`.toLowerCase();
    const prev = seen.get(j.id) || seen.get(k2);
    const keep = !prev || (j.text || '').length > (prev.text || '').length ? { ...prev, ...j, id: prev?.id || j.id } : prev;
    seen.set(keep.id, keep); seen.set(k2, keep);
  }
  return [...new Set(seen.values())];
}

// ---------- schema.org JobPosting (what sites publish for Google for Jobs) ----------
const place = loc => [].concat(loc || []).map(l => {
  const a = l?.address || l;
  return typeof a === 'string' ? a : [a?.addressLocality, a?.addressRegion].filter(Boolean).join(', ') || a?.name || '';
}).filter(Boolean).join(' / ');

export function jsonLd(html, base = '') {
  const jobs = [], links = [];
  const walk = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 8) return;
    if (Array.isArray(o)) return o.forEach(x => walk(x, depth + 1));
    const type = [].concat(o['@type'] || []).join(' ');
    if (/JobPosting/i.test(type)) {
      jobs.push({
        title: o.title || o.name, company: o.hiringOrganization?.name || (typeof o.hiringOrganization === 'string' ? o.hiringOrganization : ''),
        location: place(o.jobLocation) || (/telecommute/i.test(o.jobLocationType || '') ? 'Remote' : ''),
        url: o.url || o.mainEntityOfPage?.['@id'] || o.mainEntityOfPage || '', posted: o.datePosted, text: htmlToText(o.description),
      });
      return;
    }
    if (/ItemList/i.test(type)) for (const it of [].concat(o.itemListElement || [])) {
      const u = typeof it === 'string' ? it : it?.url || it?.item?.url || (typeof it?.item === 'string' ? it.item : '');
      if (u) links.push(u);
    }
    walk(o['@graph'], depth + 1); walk(o.itemListElement, depth + 1); walk(o.item, depth + 1);
  };
  for (const m of String(html).matchAll(/<script[^>]+type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = m[1].replace(/^\s*<!--|-->\s*$/g, '').replace(/^\s*\/\/<!\[CDATA\[|\/\/\]\]>\s*$/g, '').trim();
    try { walk(JSON.parse(raw)); } catch { try { walk(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' '))); } catch { /* broken JSON-LD: skip */ } }
  }
  const abs = u => { try { return new URL(u, base).href; } catch { return ''; } };
  return { jobs: jobs.map(j => ({ ...j, url: j.url ? abs(j.url) : base })), links: links.map(abs).filter(Boolean) };
}

// On a listing page: links that look like single job ads, on the same site.
const JOBISH = /\/(vacatures?|vacancies|vacancy|jobs?|careers?|carriere|werken-bij|werkenbij|positions?|openings?|o|offer|stelle|stellen)\/|[?&](job|vacancy|vacature)id=|\/\d{5,}-[a-z]/i;
export function jobLinks(html, base, max = 30) {
  const b = new URL(base), out = new Set();
  for (const m of String(html).matchAll(/<a\b[^>]*\bhref=["']([^"'#]+)["']/gi)) {
    let u; try { u = new URL(decode(m[1]), b); } catch { continue; }
    if (u.hostname !== b.hostname || !/^https?:$/.test(u.protocol)) continue;
    const p = u.pathname.replace(/\/+$/, '');
    if (!JOBISH.test(p + '/' + u.search) || p === b.pathname.replace(/\/+$/, '')) continue;
    // a job ad's path is deeper or more specific than the listing's own
    const last = p.split('/').pop();
    if (!/[\d-]/.test(last) && !/[?&](job|vacancy|vacature)id=/i.test(u.search)) continue;
    if (/\b(login|signin|apply|solliciteer|privacy|cookie|contact)\b/i.test(p)) continue;
    out.add(u.href.replace(/#.*$/, ''));
  }
  // most boards give each ad a number (/vacatures/4778616-recruiter); when they do, other links are categories or companies
  const all = [...out], withId = all.filter(h => /\d{4,}/.test(new URL(h).pathname.split('/').pop() + new URL(h).search));
  return (withId.length >= 3 ? withId : all).slice(0, max);
}

// A page without JobPosting data still counts as an ad if it reads like one.
export function pageAsJob(html, url) {
  const text = htmlToText(String(html).replace(/<(header|nav|footer)[\s\S]*?<\/\1>/gi, ' '));
  if (!/(solliciteer|apply now|apply for|wat vragen wij|wat bieden wij|what we offer|requirements|functie-eisen|jouw profiel|your profile|responsibilities)/i.test(text)) return null;
  const h1 = (String(html).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  const title = htmlToText(h1 || (String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').split('\n')[0];
  return title ? { title, url, text } : null;
}

// ---------- RSS / Atom, and Personio's XML ----------
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return m ? m[1].replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '') : ''; };
const attr = (xml, t, a) => (xml.match(new RegExp(`<${t}\\b[^>]*\\b${a}=["']([^"']+)`, 'i')) || [])[1] || '';
export const isFeed = s => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)\b/i.test(String(s).slice(0, 2000));
export function parseFeed(xml) {
  const items = [...String(xml).matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(m => m[0]);
  return items.map(it => ({
    title: htmlToText(tag(it, 'title')), url: clean(tag(it, 'link')) || attr(it, 'link', 'href'),
    text: htmlToText(tag(it, 'description') || tag(it, 'content') || tag(it, 'summary')),
    posted: tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated'),
    company: htmlToText(tag(it, 'company') || tag(it, 'author')), location: htmlToText(tag(it, 'location')),
  }));
}
export function parsePersonio(xml, host) {
  return [...String(xml).matchAll(/<position\b[\s\S]*?<\/position>/gi)].map(m => m[0]).map(p => ({
    title: htmlToText(tag(p, 'name')), company: htmlToText(tag(p, 'subcompany')) || host.split('.')[0], location: htmlToText(tag(p, 'office')),
    url: `https://${host}/job/${clean(tag(p, 'id'))}`, posted: tag(p, 'createdAt'),
    text: [...p.matchAll(/<jobDescription\b[\s\S]*?<\/jobDescription>/gi)].map(d => htmlToText(tag(d[0], 'name')) + '\n' + htmlToText(tag(d[0], 'value'))).join('\n\n'),
  }));
}

// ---------- the ATS job-board APIs (public, and readable straight from a browser) ----------
export function parseApi(type, data, src = {}) {
  const co = src.label?.split('/')[1] || '';
  switch (type) {
    case 'greenhouse': return (data.jobs || []).map(j => ({
      title: j.title, company: j.company_name || co, location: j.location?.name, url: j.absolute_url, posted: j.first_published || j.updated_at,
      text: htmlToText(decode(j.content || '')) }));
    case 'lever': return (Array.isArray(data) ? data : []).map(j => ({
      title: j.text, company: co, location: j.categories?.location || (j.categories?.allLocations || []).join(' / '), url: j.hostedUrl, posted: j.createdAt,
      text: [j.descriptionPlain, ...(j.lists || []).map(l => `${l.text}\n${htmlToText(l.content)}`), j.additionalPlain].filter(Boolean).join('\n\n') }));
    case 'smartrecruiters': return (data.content || []).map(j => ({
      title: j.name, company: j.company?.name || co, location: [j.location?.city, j.location?.country?.toUpperCase?.()].filter(Boolean).join(', '),
      url: `https://jobs.smartrecruiters.com/${j.company?.identifier || co}/${j.id}`, posted: j.releasedDate, text: '' }));
    case 'workable': return (data.jobs || []).map(j => ({
      title: j.title, company: data.name || co, location: [j.city, j.country].filter(Boolean).join(', '), url: j.url || j.shortlink, posted: j.published_on || j.created_at,
      text: htmlToText(j.description || '') }));
    case 'recruitee': return (data.offers || []).map(j => ({
      title: j.title, company: j.company_name || co, location: j.location || [j.city, j.country].filter(Boolean).join(', '), url: j.careers_url, posted: j.published_at || j.created_at,
      text: htmlToText([j.description, j.requirements].filter(Boolean).join('\n')) }));
    case 'adzuna': return (data.results || []).map(j => ({
      title: htmlToText(j.title), company: j.company?.display_name, location: j.location?.display_name, url: j.redirect_url, posted: j.created, text: htmlToText(j.description) }));
    default: return [];
  }
}
export const adzunaUrl = ({ appId, appKey, country = 'nl' }, q = '', city = '') =>
  `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&results_per_page=50` +
  (q ? `&what=${encodeURIComponent(q)}` : '') + (city ? `&where=${encodeURIComponent(city)}` : '');

// ---------- robots.txt (used by the fetch proxy) ----------
// Google's reading: the group for our agent if there is one, else "*"; the longest matching rule wins, Allow on a tie.
export function robotsAllows(robots, path, agent = 'cvscreenerbot') {
  const groups = []; let cur = null, lastWasAgent = false;
  for (const raw of String(robots || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!lastWasAgent) groups.push(cur = { agents: [], rules: [] }); cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', p: v });
  }
  const g = groups.find(x => x.agents.some(a => a !== '*' && agent.includes(a))) || groups.find(x => x.agents.includes('*'));
  if (!g) return true;
  let best = null;
  for (const r of g.rules) {
    if (!r.p) continue; // "Disallow:" (empty) allows everything
    const re = new RegExp('^' + r.p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(path) && (!best || r.p.length > best.p.length || (r.p.length === best.p.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

// What collect.js read from an open tab -> ads. The open job's full text joins its card.
export function fromCollected(c) {
  const src = { label: String(c.host || '').replace(/^www\./, ''), url: c.url };
  const ld = jsonLd((c.ld || []).map(s => `<script type="application/ld+json">${s}</script>`).join(''), c.url).jobs;
  const cards = (c.cards || []).map(k => ({ ...k, text: k.context || '' }));
  if (c.detail) {
    const same = cards.find(k => k.title && c.detail.title.toLowerCase().includes(k.title.toLowerCase().slice(0, 40)));
    if (same) same.text = c.detail.text; else if (!ld.length) cards.push(c.detail);
  }
  return dedupe([...ld, ...cards].map(j => normalise(j, src)));
}
