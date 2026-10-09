// Anonymous error reports to the owner. Never sends CV text, file names or candidate data:
// only the error, where it happened, and coarse facts about the file.
import { REPORT_URL } from '../config.js';
import { version } from './platform.js';

const sent = new Set();
let count = 0;
const scrub = s => String(s || '')
  .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
  .replace(/\+?\d[\d\s-]{7,}\d/g, '<num>')
  .replace(/(blob|filesystem|https?):\/\/\S+/g, '<url>');

export function sizeBucket(bytes) {
  if (bytes == null) return '';
  return ['<100KB', '<1MB', '<5MB', '<20MB'][[1e5, 1e6, 5e6, 2e7].findIndex(n => bytes < n)] || '>=20MB';
}

export async function report(err, ctx = {}) {
  console.error('[cv-screener]', ctx.step || '', err);
  if (!REPORT_URL) return;
  const message = scrub(err?.message || err).slice(0, 300);
  const stack = scrub(err?.stack).slice(0, 2000);
  const sig = `${ctx.step}|${message}`;
  if ((!ctx.manual && sent.has(sig)) || ++count > 25) return;
  sent.add(sig);
  try {
    await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message, stack,
        step: String(ctx.step || 'unknown').slice(0, 40),
        fileType: String(ctx.fileType || '').slice(0, 20),
        fileSize: ctx.fileSize || '',
        comment: scrub(ctx.comment).slice(0, 1000),
        manual: !!ctx.manual,
        version: version(),
        browser: navigator.userAgent.slice(0, 200),
      }),
    });
  } catch { /* offline or blocked: nothing else to do */ }
}

export function installGlobalHandlers() {
  addEventListener('error', e => report(e.error || e.message, { step: 'window' }));
  addEventListener('unhandledrejection', e => report(e.reason, { step: 'promise' }));
}
