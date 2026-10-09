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
  ok(await page.waitForSelector('#jobsTbl .is-vac', { timeout: 3000 }).catch(() => null), '"Add as vacancy" makes the ad a vacancy in one tap');
  ok((await page.$$eval('#ftag option', o => o.map(x => x.textContent))).some(t => t.startsWith('Recruiter (32-40 uur) – Groen & Co')), 'and it is in the Vacancy filter straight away (the bug from the phone)');
  // a word no title has: say why nothing shows, and offer the way back
  await page.fill('#vfWords', 'verkoop');
  ok(await jobRows() === 0 && (await page.textContent('#jobsNone')).includes('None of the 3 vacancies has “verkoop” in the job title'), 'an empty result explains itself');
  await page.click('#jobsNone [data-fix="words"]');
  ok(await jobRows() === 3 && await page.inputValue('#vfWords') === '', '"Show all" brings them back');
  // the same site searched for "verkoop" ({q} in its address): what it returns is kept, whatever the titles say
  await addSource(`http://127.0.0.1:${srv.address().port}/careers/?q={q}`);
  await page.fill('#vfWords', 'verkoop');
  await search();
  ok(await jobRows() === 3, 'ads a site found for "verkoop" stay visible (the bug from the phone: 0 of 21)');
  await page.fill('#vfWords', '');
  // every ad of a site at once, then candidates link themselves to the one they applied for
  await page.click('#vfSources .src-addall');
  await page.waitForFunction(() => document.querySelectorAll('#jobsTbl .is-vac').length === 3, null, { timeout: 5000 });
  ok(true, '"Add all as vacancies" adds every ad of that site');
  if (process.argv.includes('--shots')) { await page.evaluate(() => { document.querySelector('#vfSources').scrollIntoView(); scrollBy(0, -20); }); await page.screenshot({ path: path.join(root, 'docs/screenshots/26-add-all-vacancies.png') }); }
  await page.click('#tabs [data-tab="cands"]');
  await page.setInputFiles('#files', [fx('cv-nurse.txt'), fx('letter-nurse.txt')]);
  await page.waitForFunction(() => document.querySelector('#tbl tbody').textContent.includes('Fatima'), null, { timeout: 15000 });
  const nurse = await page.textContent('#tbl tbody tr:has-text("Fatima")');
  ok(nurse.includes('Verpleegkundige – Groen & Co Zorg') && nurse.includes('auto'), 'a candidate whose letter applies for "Verpleegkundige" is linked to that vacancy');
  if (process.argv.includes('--shots')) {
    await page.click('#tbl tbody tr:has-text("Fatima") td:nth-child(2)');
    await page.evaluate(() => { document.querySelector('#resultLine').scrollIntoView(); scrollBy(0, -70); });
    await page.screenshot({ path: path.join(root, 'docs/screenshots/27-linked-to-vacancy.png') });
    await page.keyboard.press('Escape');
  }
  await page.selectOption('#ftag', 'Verpleegkundige – Groen & Co Zorg');
  ok(await page.$$eval('#tbl tbody tr', t => t.length) === 1, 'the Vacancy filter shows that candidate');
  await page.click('#tbl tbody tr td:nth-child(2)');
  ok((await page.textContent('.vac-link')).includes('Says they apply for'), 'the panel says why it was linked');
  await page.selectOption('#drawerVacSel', '__none');
  await page.waitForFunction(() => !document.querySelector('#tbl tbody').textContent.includes('Fatima'), null, { timeout: 5000 }).catch(() => {});
  ok(await page.$$eval('#tbl tbody tr', t => t.length) === 0, 'and can be unlinked by hand');
  await page.keyboard.press('Escape');
  await page.selectOption('#ftag', '');
  await page.click('#tabs [data-tab="vacs"]');
  ok((await page.textContent('#jobsTbl')).includes('👥'), 'each vacancy shows how many candidates it has');
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
// ---------- dark mode and phones ----------
{
  const shots = process.argv.includes('--shots');
  // desktop: the switch cycles Auto -> Dark -> Light and is remembered
  await page.setViewportSize({ width: 1360, height: 900 });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const light = await bg();
  await page.click('#themeBtn');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await bg() !== light, 'theme switch: dark');
  await page.reload(); await page.waitForSelector('#tbl tbody tr');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark choice remembered after reload');
  if (shots) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(root, 'docs/screenshots/22-dark-mode.png') }); }
  await page.click('#themeBtn');
  ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'theme switch: light');
  await page.click('#themeBtn');
  ok(!(await page.evaluate(() => document.documentElement.dataset.theme)), 'theme switch: back to auto');

  // a phone with dark mode on: Auto follows it
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const m = await phone.newPage();
  m.on('pageerror', e => errors.push('mobile: ' + e.message));
  await m.route('**/api/report', r => { errors.push('REPORT ' + r.request().postData()); r.fulfill({ status: 200, body: '{}' }); });
  await m.goto(base + '/app/');
  await m.setInputFiles('#files', [fx('human-nl.docx'), fx('Thomas_Vermeulen_CV.pdf'), fx('Thomas_Vermeulen_Cover_Letter.pdf'), fx('ai-en.txt')]);
  await m.waitForFunction(() => document.querySelectorAll('#tbl tbody tr').length === 3, null, { timeout: 30000 });
  const dark = await m.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(dark === 'rgb(11, 20, 19)', 'Auto follows the phone\'s dark mode: ' + dark);
  const overflow = async () => m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(await overflow() <= 0, 'no sideways scrolling on a phone (candidates)');
  ok(await m.$eval('#tbl thead', t => getComputedStyle(t).display) === 'none' && await m.$eval('#tbl tbody tr', t => getComputedStyle(t).display) === 'block', 'candidates are cards, not a table');
  ok(await m.isVisible('#sortM'), 'sort dropdown instead of column headers');
  await m.selectOption('#sortM', 'name:asc');
  const names = await m.$$eval('#tbl tbody tr td:nth-child(2)', t => t.map(x => x.innerText.split('\n')[0].trim()));
  ok(names.join() === [...names].sort((a, b) => a.localeCompare(b)).join(), 'sorting from the dropdown: ' + names.join(', '));
  const tapTarget = await m.$eval('#tbl tbody tr td.sel', td => td.getBoundingClientRect().width);
  ok(tapTarget >= 36, `checkbox easy to tap (${Math.round(tapTarget)}px)`);
  await m.tap('#selAllM');
  ok(await m.isVisible('#selBar') && (await m.textContent('#selCount')).startsWith('3 selected'), 'select all from the phone');
  ok(await overflow() <= 0, 'selection bar fits');
  if (shots) await m.screenshot({ path: path.join(root, 'docs/screenshots/23-phone-candidates.png') });
  await m.tap('#selClear');
  await m.tap('#tbl tbody tr:has-text("Thomas") td:nth-child(2)');
  const d = await m.$eval('#drawer', e => e.getBoundingClientRect().width);
  ok(d === 390, 'candidate panel uses the whole screen');
  const x = await m.$eval('#closeDrawer', b => b.getBoundingClientRect().toJSON());
  ok(x.right <= 390 && x.right > 340 && x.top < 40, '× reachable in the top-right corner');
  if (shots) await m.screenshot({ path: path.join(root, 'docs/screenshots/24-phone-candidate.png') });
  await m.tap('#closeDrawer');
  ok(await m.$eval('#drawer', e => e.hidden), '× closes it on a phone');
  await m.tap('#tabs [data-tab="vacs"]');
  ok(await overflow() <= 0, 'no sideways scrolling on a phone (vacancies)');
  const fontSize = await m.$eval('#vfUrl', i => parseFloat(getComputedStyle(i).fontSize));
  ok(fontSize >= 16, 'inputs at 16px, so iPhones do not zoom in on tap');
  if (shots) await m.screenshot({ path: path.join(root, 'docs/screenshots/25-phone-vacancies.png') });
  await phone.close();
}

ok(!errors.length, 'no page errors / reports: ' + errors.join(' | '));
await browser.close(); srv.close();
