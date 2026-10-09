// The web version (site/app/) in a plain browser, no extension: drop files, search, letters, persistence.
// Run: node tools/e2e-web.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fx = f => path.join(root, 'test/fixtures', f);
const fail = m => { console.error('FAIL', m); process.exitCode = 1; };
const ok = (c, m) => c ? console.log('ok  ', m) : fail(m);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

const srv = createServer((req, res) => {
  let p = path.join(root, 'site', decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const base = `http://localhost:${srv.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.route('**/api/report', r => { errors.push('REPORT ' + r.request().postData()); r.fulfill({ status: 200, body: '{}' }); });

await page.goto(base + '/app/');
ok(await page.isVisible('.web-note'), 'web-version note shown');
await page.setInputFiles('#files', [fx('human-nl.docx'), fx('ai-en.txt'), fx('letter-human.txt'), fx('letter-ai.txt')]);
await page.waitForFunction(() => document.querySelectorAll('.doc-mark').length === 2, null, { timeout: 30000 });
ok(await page.$$eval('tbody tr', t => t.length) === 2, 'CVs parsed, letters linked (no extension)');
await page.fill('#in-all', 'pyhton'); await page.press('#in-all', 'Enter');
ok(await page.$$eval('tbody tr', t => t.length) === 1, 'typo-tolerant search works');
page.once('dialog', d => d.accept('Python people'));
await page.click('#saveSearch');
await page.click('#reset');

await page.reload();
await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2, null, { timeout: 15000 });
ok(true, 'CVs kept after reload (IndexedDB)');
ok((await page.textContent('#saved')).includes('Python people'), 'saved search kept after reload (localStorage)');
await page.click('.chip-apply');
ok(await page.$$eval('tbody tr', t => t.length) === 1, 'saved search re-applies');

if (process.argv.includes('--shots')) {
  await page.click('#reset');
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, 'docs/screenshots/17-web-version.png') });
  const land = await ctx.newPage();
  await land.setViewportSize({ width: 1100, height: 900 });
  await land.goto(base + '/');
  await land.screenshot({ path: path.join(root, 'docs/screenshots/18-landing-choice.png') });
}
ok(!errors.length, 'no page errors / reports: ' + errors.join(' | '));
await browser.close(); srv.close();
