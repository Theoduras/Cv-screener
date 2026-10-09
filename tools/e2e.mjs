// End-to-end: load the unpacked extension in Chromium, drop PDF + DOCX, filter, capture an ATS-like page.
// Run: node tools/e2e.mjs   (needs playwright; uses the preinstalled Chromium)
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ext = path.join(root, 'extension');
const fx = f => path.join(root, 'test/fixtures', f);
const fail = m => { console.error('FAIL', m); process.exitCode = 1; };
const ok = (c, m) => c ? console.log('ok  ', m) : fail(m);

// a PDF fixture, printed by Chromium itself
const tmp = mkdtempSync(path.join(tmpdir(), 'cvs-'));
const pdfPath = path.join(tmp, 'john-ai.pdf');
{
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent(`<pre style="font:12px sans-serif;white-space:pre-wrap">${readFileSync(fx('ai-en.txt'), 'utf8').replace(/</g, '&lt;')}</pre>`);
  await p.pdf({ path: pdfPath });
  await b.close();
}

// a fake ATS page with a CV link, served over http
const srv = createServer((req, res) => {
  if (req.url === '/cv.pdf') { res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(readFileSync(pdfPath)); }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<title>REQ-42 Kandidaat</title><h1>Kandidaat</h1><a href="/cv.pdf">CV downloaden</a>');
}).listen(0);
const ats = `http://localhost:${srv.address().port}/candidate`;

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'prof-')), {
  headless: true, channel: 'chromium', args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const errors = [];
// unpacked extension id = first 32 hex of sha256(abs path), mapped 0-f -> a-p
const { createHash } = await import('node:crypto');
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
const app = await ctx.newPage();
app.on('pageerror', e => errors.push(e.message));
app.on('console', m => m.type() === 'error' && errors.push(m.text()));
await app.route('**/api/report', r => { errors.push('REPORT ' + r.request().postData()); r.fulfill({ status: 200, body: '{}' }); });
await app.goto(`chrome-extension://${id}/app.html`);
await app.setInputFiles('#files', [pdfPath, fx('human-nl.docx'), fx('ai-en.txt')]);
await app.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3, null, { timeout: 30000 });
const rowsText = await app.$$eval('tbody tr', trs => trs.map(t => t.innerText.replace(/\s+/g, ' ')));
console.log(rowsText.join('\n'));
ok(rowsText.some(r => r.includes('Sanne de Vries') && r.includes('Utrecht')), 'DOCX parsed');
ok(rowsText.filter(r => r.includes('John Petersen')).length === 2, 'PDF + TXT parsed');
await app.setViewportSize({ width: 1280, height: 640 });
await app.screenshot({ path: path.join(root, 'site/screenshot.png') });
await app.selectOption('#fai', '24');
ok(await app.$$eval('tbody tr', t => t.length) === 1, 'AI filter keeps only the human CV');
await app.selectOption('#fai', '');
await app.fill('#in-all', 'python'); await app.press('#in-all', 'Enter'); await app.fill('#in-all', 'docker'); await app.press('#in-all', 'Enter');
ok(await app.$$eval('tbody tr', t => t.length) === 2, 'skills filter');
await app.click('#reset');
await app.selectOption('#flang', 'German');
ok(await app.$$eval('tbody tr', t => t.length) === 1, 'language filter');
await app.click('#reset');
await app.click('#advToggle');
await app.fill('#fq', '(python OR sql) -intern years:>=5');
ok(await app.$$eval('tbody tr', t => t.length) === 2, 'custom query');
ok((await app.textContent('tbody')).includes('python ✓'), 'matched column');
app.once('dialog', d => d.accept('Data 5+'));
await app.click('#saveSearch');
await app.click('#reset');
ok(await app.$$eval('tbody tr', t => t.length) === 3, 'reset clears query');
await app.click('.chip-apply');
ok(await app.$$eval('tbody tr', t => t.length) === 2 && (await app.inputValue('#fq')).includes('python'), 'saved search re-applies');
await app.fill('#fq', '(broken "query');
ok((await app.textContent('#qhint')).includes('Could not read'), 'bad syntax explained');
await app.click('#reset');
// plain boxes: forgiving word endings, leave-out, and the no-results helper
await app.fill('#in-all', 'astronaut'); await app.press('#in-all', 'Enter');
ok(await app.$$eval('tbody tr', t => t.length) === 0, 'no match shows nothing');
ok((await app.textContent('#resultLine')).includes('Try removing a word'), 'no-results helper offers removal');
await app.click('#resultLine button.word');
await app.fill('#in-any', 'salarisadministratie, docker'); await app.press('#in-any', 'Enter');
ok(await app.$$eval('tbody tr', t => t.length) === 3, 'nice-to-have is OR (comma adds two)');
await app.fill('#in-none', 'docker'); await app.press('#in-none', 'Enter');
ok(await app.$$eval('tbody tr', t => t.length) === 1, 'leave out excludes');
await app.click('#reset');
await app.click('.sugg');
ok(await app.$$eval('#finder .word.all', t => t.length) === 1, 'quick-add suggestion adds a word');
await app.click('#reset');
const [dl] = await Promise.all([app.waitForEvent('download'), app.click('#exportBtn')]);
const csv = readFileSync(await dl.path(), 'utf8');
ok(csv.split('\r\n').length === 4 && csv.includes('Sanne de Vries'), 'CSV export');

// capture: run capture.js in the ATS page and hand its result over the way the popup does
// (the popup itself needs a real click for activeTab, which headless cannot give)
const atsPage = await ctx.newPage();
await atsPage.goto(ats);
const result = await atsPage.evaluate(readFileSync(path.join(ext, 'capture.js'), 'utf8'));
await app.evaluate(r => chrome.storage.local.set({ inbox: [{ ...r, at: Date.now() }] }), result);
const res = { files: result.files.length, errors: result.errors };
console.log('capture', JSON.stringify(res));
if (!res.err) {
  await app.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4, null, { timeout: 15000 });
  ok((await app.textContent('tbody')).includes('REQ-42'), 'capture tagged with page title');
} else console.log('skip  capture (needs host access in headless):', res.err);

ok(!errors.length, 'no page errors / reports: ' + errors.join(' | '));
await ctx.close(); srv.close();
