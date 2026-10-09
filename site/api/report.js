// Vercel function: turns an anonymous error report from the extension into a GitHub issue.
// Same error twice -> a "+1" comment on the open issue instead of a new one.
// Env: GITHUB_TOKEN (fine-grained, Issues: read & write on the repo), GITHUB_REPO (owner/name).
import { createHash } from 'node:crypto';

const hits = new Map(); // per-instance, best-effort rate limit
const LIMIT = 30, WINDOW_MS = 3600e3;
const clip = (v, n) => String(v ?? '').slice(0, n);

export async function handle(body, ip, { fetch: f = fetch, env = process.env } = {}) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (h.length >= LIMIT) return { status: 429, body: { ok: false } };
  hits.set(ip, [...h, now]);

  if (!env.GITHUB_TOKEN) return { status: 503, body: { ok: false, error: 'not configured' } };
  const repo = env.GITHUB_REPO || 'theoduras/cv-screener';
  const r = {
    message: clip(body.message, 300), stack: clip(body.stack, 2000), step: clip(body.step, 40),
    fileType: clip(body.fileType, 20), fileSize: clip(body.fileSize, 12), comment: clip(body.comment, 1000),
    version: clip(body.version, 20), browser: clip(body.browser, 200), manual: !!body.manual,
  };
  const gh = (path, opts = {}) => f(`https://api.github.com/repos/${repo}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'cv-screener', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });

  const sig = createHash('sha256').update(`${r.step}|${r.message}`).digest('hex').slice(0, 10);
  const details = [
    `**Stap:** \`${r.step}\`  **Versie:** ${r.version}  **Bestand:** ${r.fileType || '-'} ${r.fileSize}`,
    `**Browser:** ${r.browser}`,
    r.comment && `**Opmerking tester:**\n> ${r.comment.replace(/\n/g, '\n> ')}`,
    r.stack && '```\n' + r.stack + '\n```',
  ].filter(Boolean).join('\n\n');

  if (!r.manual) {
    const res = await gh('/issues?state=open&labels=auto-report&per_page=100');
    const open = res.ok ? await res.json() : [];
    const existing = open.find(i => i.title.includes(`[${sig}]`));
    if (existing) {
      await gh(`/issues/${existing.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `+1 – opnieuw gemeld\n\n${details}` }) });
      return { status: 200, body: { ok: true, issue: existing.number, duplicate: true } };
    }
  }
  const title = r.manual ? `[melding] ${clip(r.comment || 'Handmatige melding', 80)}` : `[auto] ${clip(r.message, 80)} [${sig}]`;
  const res = await gh('/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body: `**Fout:** ${r.message}\n\n${details}`, labels: [r.manual ? 'tester-report' : 'auto-report'] }),
  });
  if (!res.ok) return { status: 502, body: { ok: false } };
  return { status: 201, body: { ok: true, issue: (await res.json()).number } };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > 8000) return res.status(400).json({ ok: false });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  try {
    const out = await handle(body, ip);
    res.status(out.status).json(out.body);
  } catch {
    res.status(500).json({ ok: false });
  }
}
