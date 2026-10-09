// Renders docs/screenshots/*.png: the screener with sample CVs, a filter, the detail drawer, the popup and the site.
// Run: node tools/screenshots.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ext = path.join(root, 'extension');
const out = f => path.join(root, 'docs/screenshots', f);
const tmp = mkdtempSync(path.join(tmpdir(), 'shots-'));
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');

const extra = {
  'fatima-el-amrani.txt': `Fatima El Amrani\nRotterdam\nfatima.elamrani@example.com | +31 6 23456789\n\nWork experience\n2021 - present Data analyst, Port of Rotterdam\nPower BI dashboards, SQL on shipping data, some Python.\n2018 - 2021 Junior controller, Eneco\nMonth-end close, budgeting, lots of Excel.\n\nEducation\n2014 - 2018 BSc Business Economics, Erasmus University\n\nLanguages\nDutch native, English fluent, Arabic good`,
  'pieter-bakker.txt': `Pieter Bakker\nLocation: Groningen\npieter@example.com\n\nWork experience\nMarch 2012 - present Work planner, building services, Kuipers BV\nAutoCAD, Revit, BIM models, procurement of materials.\n2008 - 2012 Electrician, Feenstra\n\nEducation\nMBO Electrical engineering, level 4\n\nLanguages: Dutch, German (basic)`,
  'emma-jansen.txt': `Emma Jansen\nEindhoven\nemma.jansen@example.com\n\nProfile\nResults-driven and highly motivated recruiter, passionate about people. Proactive, detail-oriented and a true team player who thrives in a fast-paced environment – committed to excellence and eager to contribute.\n\nWork experience\n2022 - present Recruiter, [Company Name], Eindhoven\n- Responsible for end-to-end recruitment and selection.\n- Proactive sourcing via LinkedIn and job boards.\n- Meticulous management of candidates in the ATS.\n- Customer-centric contact with hiring managers.\n\nLanguages\nDutch native, English C1`,
};
for (const [f, t] of Object.entries(extra)) writeFileSync(path.join(tmp, f), t);
// an English DOCX, built by python-docx from a plain-text source
const { execFileSync } = await import('node:child_process');
writeFileSync(path.join(tmp, 'sophie.txt'), ['Sophie de Vries', 'Utrecht', 'sophie.devries@example.com', '', 'Work experience',
  '2019 - present Recruiter, Jansen Construction, Utrecht', 'Hiring site managers and planners. Phone screening, LinkedIn, job fairs.',
  '2015 - 2019 HR officer, Municipality of Zeist', 'Payroll, absence management, contracts.', '', 'Education',
  '2011 - 2015 Bachelor HRM, Utrecht University of Applied Sciences', '', 'Languages', 'Dutch: native', 'English: good', 'German: basic'].join('\n'));
execFileSync('python3', ['-c', 'import docx,sys\nd=docx.Document()\nfor l in open(sys.argv[1]).read().split(chr(10)): d.add_paragraph(l)\nd.save(sys.argv[2])',
  path.join(tmp, 'sophie.txt'), path.join(tmp, 'sophie-de-vries.docx')]);

const pdfPath = path.join(tmp, 'john-petersen.pdf');
{
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(`<pre style="font:12px sans-serif;white-space:pre-wrap">${readFileSync(path.join(root, 'test/fixtures/ai-en.txt'), 'utf8').replace(/</g, '&lt;')}</pre>`);
  await p.pdf({ path: pdfPath }); await b.close();
}

const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'prof-')), {
  headless: true, channel: 'chromium', viewport: { width: 1360, height: 760 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const app = await ctx.newPage();
await app.route('**/api/report', r => r.fulfill({ status: 200, body: '{}' }));
await app.goto(`chrome-extension://${id}/app.html`);
await app.fill('#tagInput', 'REQ-1042 Recruiter');
await app.setInputFiles('#files', [pdfPath, path.join(tmp, 'sophie-de-vries.docx'), ...Object.keys(extra).map(f => path.join(tmp, f))]);
await app.waitForFunction(() => document.querySelectorAll('tbody tr').length === 5, null, { timeout: 30000 });
await app.click('th[data-k="ai"]');
await app.screenshot({ path: out('1-overview.png') });

await app.fill('#fai', '40'); await app.selectOption('#flang', 'English');
await app.screenshot({ path: out('2-filtered.png') });
await app.click('#reset');

await app.click('tbody tr:first-child');
await app.screenshot({ path: out('3-ai-explanation.png') });
await app.click('#closeDrawer');

// custom search: query + saved searches + help, then the highlighted CV
for (const [name, q] of [['Data roles 5+ yrs', '(python OR sql OR "power bi") years:>=5 -intern'], ['Recruiters, low AI', 'recruit* ai:<40']]) {
  await app.fill('#fq', q);
  app.once('dialog', d => d.accept(name));
  await app.click('#saveSearch');
}
await app.click('.chip-apply');
await app.click('#qhelpBtn');
await app.screenshot({ path: out('7-custom-search.png') });
await app.click('#qhelpBtn');
await app.click('tbody tr:nth-child(2)');
await app.$eval('#drawer pre', el => el.scrollIntoView({ block: 'center' }));
await app.screenshot({ path: out('8-search-highlight.png') });
await app.click('#closeDrawer');
await app.click('#reset');

const pop = await ctx.newPage();
await pop.setViewportSize({ width: 260, height: 150 });
await pop.goto(`chrome-extension://${id}/popup.html`);
await pop.screenshot({ path: out('4-popup.png') });

const site = await ctx.newPage();
await site.goto('file://' + path.join(root, 'site/index.html'));
await site.screenshot({ path: out('5-download-page.png') });
await site.setViewportSize({ width: 390, height: 844 });
await site.screenshot({ path: out('6-download-page-mobile.png') });
await ctx.close();
console.log('done');
