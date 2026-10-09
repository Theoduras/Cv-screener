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

const { handle: proxy } = await import(path.join(root, 'site/api/fetch.js'));
const srv = createServer(async (req, res) => {
  // the real /api/fetch, allowed to reach this local test server
  if (req.url.startsWith('/api/fetch')) {
    const out = await proxy(new URL(req.url, 'http://x').searchParams.get('url'), 'e2e', { env: { FETCH_ALLOW_PRIVATE: '1' } });
    if (out.json) { res.writeHead(out.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(out.json)); }
    res.writeHead(200, out.headers); return res.end(out.body);
  }
  // a small company careers site: a listing and three ads (JSON-LD, @graph, and a plain page)
  if (req.url.startsWith('/careers/')) {
    const slug = req.url.split('?')[0].replace(/^\/careers\/(vacatures\/)?/, '') || 'index';
    const f = path.join(root, 'test/fixtures/jobs', slug + '.html');
    if (!existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(readFileSync(f));
  }
  let p = path.join(root, 'site', decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(p) && statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(0);
const base = process.env.BASE_URL || `http://localhost:${srv.address().port}`;

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

// a CV + letter fully written by ChatGPT, as real PDFs through pdf.js: both should come out red
await page.click('#reset');
await page.setInputFiles('#files', [fx('Thomas_Vermeulen_CV.pdf'), fx('Thomas_Vermeulen_Cover_Letter.pdf')]);
await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3 && document.querySelectorAll('.doc-mark').length === 3, null, { timeout: 30000 });
await page.click('tbody tr:has-text("Thomas Vermeulen")');
const verdict = await page.textContent('.verdicts');
const ai = [...verdict.split(/Sent or tailored/)[0].matchAll(/(CV|Cover letter)\s*(\d+)/g)].map(m => +m[2]);
ok(ai.length === 2 && ai.every(n => n >= 55), 'ChatGPT CV and letter both score red: ' + ai.join(', '));
console.log('     ', verdict.split(/Sent or tailored/)[0].replace(/\s+/g, ' ').slice(0, 900));
if (process.argv.includes('--shots')) {
  await page.setViewportSize({ width: 1360, height: 1100 });
  await page.screenshot({ path: path.join(root, 'docs/screenshots/19-ai-signals.png') });
}
await page.click('#closeDrawer');
ok(await page.$eval('#drawer', d => d.hidden), '× closes the candidate panel');
await page.click('#tbl tbody tr:has-text("Thomas Vermeulen") td:nth-child(2)');
await page.keyboard.press('Escape');
ok(await page.$eval('#drawer', d => d.hidden), 'Esc closes the candidate panel');

// ---------- find vacancies ----------
const live = !!process.env.BASE_URL;
await page.click('#tabs [data-tab="vacs"]');
const jobRows = () => page.$$eval('#jobsTbl tbody tr', t => t.length);
const addSource = async u => { await page.fill('#vfUrl', u); await page.click('#vfAdd'); };
const search = async () => { await page.click('#vfRun'); await page.waitForFunction(() => /^Done/.test(document.querySelector('#vfStatus').textContent), null, { timeout: 60000 })
  .catch(async e => { console.log('STATUS', await page.textContent('#vfStatus'), '|', (await page.textContent('#vfSources')).replace(/\s+/g, ' '), errors); throw e; }); };
if (!live) {
  await addSource(`http://127.0.0.1:${srv.address().port}/careers/`);
  await search();
  ok(await jobRows() === 3, 'a careers page: listing followed, 3 ads read (JSON-LD, @graph, plain page)');
  const t = await page.textContent('#jobsTbl tbody');
  ok(t.includes('Recruiter (32-40 uur)') && t.includes('Groen & Co') && t.includes('Amsterdam / Haarlem') && t.includes('Sales Manager'), 'title, company and location read');
  await page.fill('#vfWords', 'recruiter');
  ok(await jobRows() === 1, 'keyword filter');
  await page.click('#jobsTbl [data-use]');
  ok(await page.$eval('#vacDialog', d => d.open) && (await page.inputValue('#vacText')).includes('Ervaring met Oleeo'), '"Use as vacancy" fills in the vacancy text');
  await page.click('#vacSave');
  await page.fill('#vfWords', '');
}
// real sites: a Greenhouse board (read straight from the browser) and YoungCapital (through /api/fetch, robots.txt honoured)
await addSource('https://boards.greenhouse.io/gitlab');
await page.click('#vfPresets [data-name="YoungCapital"]');
await page.fill('#vfWords', 'recruiter');
await search();
const srcText = await page.textContent('#vfSources');
console.log('     ', srcText.replace(/\s+/g, ' ').slice(0, 400));
ok(/gitlab \d+ vacancies/.test(srcText.replace(/\s+/g, ' ')), 'Greenhouse board read');
ok(/YoungCapital \d+ vacanc/.test(srcText.replace(/\s+/g, ' ')) && !/YoungCapital ⚠/.test(srcText), 'YoungCapital read through the proxy');
await page.click('#vfPresets [data-name="LinkedIn Jobs"]');
ok((await page.textContent('#vfSources')).includes('Needs the extension'), 'LinkedIn is offered as "open it in a tab", never crawled');
if (process.argv.includes('--shots')) {
  await page.fill('#vfWords', 'recruiter');
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: path.join(root, 'docs/screenshots/20-find-vacancies.png') });
}
await page.fill('#vfWords', '');

// a found ad as the vacancy for a shortlist
await page.click('#tabs [data-tab="cands"]');
await page.click('#tbl tbody tr:nth-child(1) td.sel');
await page.click('#tbl tbody tr:nth-child(3) td.sel', { modifiers: ['Shift'] });
ok((await page.textContent('#selCount')).startsWith('3 selected'), 'shift-click selects a range');
if (process.argv.includes('--shots')) {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: path.join(root, 'docs/screenshots/21-select-candidates.png') });
}
await page.click('#selVac');
const firstAd = await page.$eval('#addVac optgroup[label="Found vacancies"] option', o => o.value);
await page.selectOption('#addVac', firstAd);
await page.click('#addSave');
ok(await page.waitForFunction(() => document.querySelector('#lists').textContent.includes('Shortlist –'), null, { timeout: 3000 }).catch(() => null), 'shortlist on a found vacancy');
await page.click('#tabs [data-tab="vacs"]');
ok(await page.$$eval('#jobsTbl .list-tag', t => t.some(x => x.textContent.includes('📋 3'))), 'the ad shows its 3 shortlisted candidates');
await page.click('#tabs [data-tab="cands"]');

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
