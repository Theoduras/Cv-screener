// Vercel function: fetches one public job page or feed for the web version of the vacancy finder,
// which cannot read other sites itself (CORS). The extension fetches directly and only falls back to this.
//
// It is deliberately not an open proxy:
// - GET only, http(s) on standard ports, at most 2 MB, 10 s, and only html / xml / json / text;
// - every address is checked when the connection is made (also after a redirect), so nothing private
//   or internal can be reached, not even through a DNS name that points inside;
// - sites that forbid crawlers (LinkedIn, Indeed…) are refused outright, and robots.txt is honoured;
// - a per-IP rate limit, and an honest User-Agent so site owners can see who we are.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import { robotsAllows, TAB_ONLY } from './_jobs.js';

export const UA = 'Mozilla/5.0 (compatible; CVScreenerBot/0.9; +https://cv-screener-lilac.vercel.app)';
const MAX_BYTES = 2e6, TIMEOUT_MS = 10e3, MAX_REDIRECTS = 4;
const TYPES = /^(text\/(html|xml|plain)|application\/(xhtml\+xml|xml|json|ld\+json|rss\+xml|atom\+xml))\b/i;
const hits = new Map(), robotsCache = new Map();
const LIMIT = 120, WINDOW_MS = 600e3, ROBOTS_TTL = 3600e3;

export function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('64:ff9b');
}

// Used as the socket's DNS lookup: the address is checked at the moment we connect to it.
export const guardedLookup = (resolve = dns.lookup) => (hostname, options, cb) => {
  if (typeof options === 'function') { cb = options; options = {}; }
  resolve(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some(a => isPrivate(a.address))) return cb(Object.assign(new Error('private address'), { code: 'EPRIVATE' }));
    options.all ? cb(null, addrs) : cb(null, addrs[0].address, addrs[0].family);
  });
};

export function checkUrl(raw, env = process.env) {
  let u; try { u = new URL(raw); } catch { return 'bad-url'; }
  if (!/^https?:$/.test(u.protocol)) return 'bad-url';
  if (u.port && !['80', '443'].includes(u.port) && !env.FETCH_ALLOW_PRIVATE) return 'bad-url';
  if (u.username || u.password) return 'bad-url';
  const h = u.hostname.replace(/^\[|\]$/g, '');
  if (TAB_ONLY.test(h)) return 'blocked-site';
  if (!env.FETCH_ALLOW_PRIVATE && (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || (net.isIP(h) && isPrivate(h)))) return 'private';
  return null;
}

// One GET, without following redirects. Resolves to { status, headers, body, tooLarge }.
export function requestOnce(url, { env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,application/json,*/*;q=0.5', 'Accept-Language': 'nl,en;q=0.8', 'Accept-Encoding': 'gzip, deflate, br' },
      lookup: env.FETCH_ALLOW_PRIVATE ? undefined : guardedLookup(), timeout: TIMEOUT_MS,
    }, res => {
      const enc = String(res.headers['content-encoding'] || '').toLowerCase();
      const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : res;
      const chunks = []; let size = 0, done = false;
      const finish = tooLarge => { if (done) return; done = true; req.destroy(); resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), tooLarge }); };
      if (res.statusCode >= 300 && res.statusCode < 400) return finish(false);
      stream.on('data', c => { size += c.length; if (size > MAX_BYTES) return finish(true); chunks.push(c); });
      stream.on('end', () => finish(false));
      stream.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
  });
}

async function robotsOk(u, request, env) {
  const origin = u.origin, now = Date.now();
  let entry = robotsCache.get(origin);
  if (!entry || now - entry.at > ROBOTS_TTL) {
    let txt = '', allowAll = false;
    try {
      const r = await request(origin + '/robots.txt', { env });
      if (r.status >= 400 && r.status < 500) allowAll = true; // no robots.txt: everything allowed
      else if (r.status >= 200 && r.status < 300) txt = r.body.toString('utf8');
      else txt = 'User-agent: *\nDisallow: /'; // server error: Google's reading is "don't crawl now"
    } catch { txt = 'User-agent: *\nDisallow: /'; }
    entry = { at: now, txt, allowAll };
    robotsCache.set(origin, entry);
  }
  return entry.allowAll || robotsAllows(entry.txt, u.pathname + u.search);
}

export async function handle(raw, ip, { request = requestOnce, env = process.env } = {}) {
  const fail = (status, error) => ({ status, json: { ok: false, error } });
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (h.length >= LIMIT) return fail(429, 'rate-limited');
  hits.set(ip, [...h, now]);

  let url = String(raw || '');
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const bad = checkUrl(url, env);
    if (bad) return fail(bad === 'bad-url' ? 400 : 403, bad);
    const u = new URL(url);
    if (!(await robotsOk(u, request, env))) return fail(403, 'robots');
    let r;
    try { r = await request(url, { env }); } catch (e) { return fail(e.code === 'EPRIVATE' ? 403 : 502, e.code === 'EPRIVATE' ? 'private' : 'unreachable'); }
    if (r.status >= 300 && r.status < 400 && r.headers.location) { url = new URL(r.headers.location, url).href; continue; }
    if (r.tooLarge) return fail(413, 'too-large');
    if (r.status >= 400) return fail(502, 'site-' + r.status);
    const type = String(r.headers['content-type'] || 'text/html');
    if (!TYPES.test(type)) return fail(415, 'not-a-page');
    return { status: 200, headers: { 'Content-Type': type, 'X-Final-Url': url }, body: r.body };
  }
  return fail(508, 'too-many-redirects');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Expose-Headers', 'X-Final-Url');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const out = await handle(req.query?.url, ip);
  if (out.json) return res.status(out.status).json(out.json);
  for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
  res.setHeader('Cache-Control', 'public, s-maxage=600');
  res.status(200).send(out.body);
}
