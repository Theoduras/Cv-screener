// Vacancy finder, the network part: read one source and return its ads.
// The extension fetches sites itself (with the per-site permission the recruiter granted); the web version
// reads the open job-board APIs directly and everything else through /api/fetch. Both fall back to the proxy.
import { isExtension, hasHost } from './platform.js';
import { FETCH_URL } from '../config.js';
import { parseApi, jsonLd, jobLinks, pageAsJob, isFeed, parseFeed, parsePersonio, normalise, dedupe, fillUrl, adzunaUrl } from './jobs.js';

// These answer any web page (Access-Control-Allow-Origin: *), so the web version needs no proxy for them.
const OPEN_CORS = /^https:\/\/(boards-api\.greenhouse\.io|api(\.eu)?\.lever\.co|api\.smartrecruiters\.com|apply\.workable\.com)\//;
// the web version is served next to its proxy; the extension uses the deployed one
const proxyUrl = () => isExtension ? FETCH_URL : new URL('../api/fetch', location.href).href;

export async function fetchText(url) {
  const direct = isExtension ? await hasHost(url) : OPEN_CORS.test(url);
  if (direct) {
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (r.ok) return { text: await r.text(), url: r.url || url };
      if (!isExtension) throw new Error(`The site answered ${r.status}`);
    } catch (e) { if (!isExtension) throw e; }
  }
  const r = await fetch(`${proxyUrl()}?url=${encodeURIComponent(url)}`);
  if (!r.ok) {
    const err = (await r.json().catch(() => ({}))).error || r.status;
    throw new Error({
      robots: 'This site asks crawlers not to read this page (robots.txt)', 'blocked-site': 'This site only works by opening it in a tab',
      'not-a-page': 'This link is not a web page or feed', private: 'This address is not public', 'rate-limited': 'Too many searches at once – try again in a few minutes',
    }[err] || (String(err).startsWith('site-') ? `The site answered ${String(err).slice(5)}` : `Could not read it (${err})`));
  }
  return { text: await r.text(), url: r.headers.get('X-Final-Url') || url };
}

const json = async url => JSON.parse((await fetchText(url)).text);

// A few at a time, so a listing of 30 ads doesn't hit a site with 30 requests at once.
async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } }));
  return out;
}

// A web page or feed: JobPosting data on the page itself, else the ads it links to.
async function readPage(url, src) {
  const { text, url: final } = await fetchText(url);
  if (isFeed(text)) return parseFeed(text);
  const { jobs, links } = jsonLd(text, final);
  const listed = links.length ? links : jobs.length ? [] : jobLinks(text, final);
  const known = new Set(jobs.map(j => j.url));
  const more = await pool(listed.filter(u => !known.has(u)).slice(0, src.maxPages || 30), 4, async u => {
    const page = await fetchText(u);
    const found = jsonLd(page.text, page.url).jobs;
    return found.length ? found : [pageAsJob(page.text, page.url)].filter(Boolean);
  });
  return [...jobs, ...more.flat().filter(Boolean)];
}

// One source -> its ads. Throws with a sentence a recruiter can act on.
export async function crawlSource(src, { q = '', city = '' } = {}) {
  if (src.type === 'tab') throw new Error('Open it in a tab, then click “Collect vacancies from this page” in the extension');
  let raw;
  if (src.type === 'adzuna') raw = parseApi('adzuna', await json(adzunaUrl(src, q, city))).map(j => q ? { ...j, searchedFor: q.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) } : j);
  else if (src.type === 'personio') raw = parsePersonio((await fetchText(src.api)).text, new URL(src.url).hostname);
  else if (src.api) raw = parseApi(src.type, await json(src.api), src);
  else {
    // a search URL with {q} runs once per keyword
    const terms = /\{q\}/.test(src.url) ? (q.split(/\s*,\s*/).filter(Boolean).slice(0, 5)) : [''];
    raw = (await Promise.all((terms.length ? terms : ['']).map(async t =>
      (await readPage(fillUrl(src.url, t, city), src)).map(j => t ? { ...j, searchedFor: [t.toLowerCase()] } : j)))).flat();
  }
  return dedupe(raw.map(j => normalise(j, src)));
}
