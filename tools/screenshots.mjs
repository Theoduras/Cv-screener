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
  'fatima-el-amrani.txt': `Fatima El Amrani\nRotterdam\nfatima.elamrani@example.nl | 06 23456789\n\nWerkervaring\n2021 - heden Data analist, Havenbedrijf Rotterdam\nDashboards in Power BI, SQL-queries op de scheepsdata, af en toe Python.\n2018 - 2021 Junior controller, Eneco\nMaandafsluiting, budgettering, veel Excel.\n\nOpleiding\n2014 - 2018 Bedrijfseconomie, Erasmus Universiteit (bachelor)\n\nTalen\nNederlands moedertaal, Engels vloeiend, Arabisch goed`,
  'pieter-bakker.txt': `Pieter Bakker\nWoonplaats: Groningen\npieter@example.com\n\nWerkervaring\nmaart 2012 - heden Werkvoorbereider installatietechniek, Kuipers BV\nAutoCAD, Revit, BIM-modellen, inkoop van materiaal.\n2008 - 2012 Monteur, Feenstra\n\nOpleiding\nMBO Elektrotechniek niveau 4\n\nTalen: Nederlands, Duits (basis)`,
  'emma-jansen.txt': `Emma Jansen\nEindhoven\nemma.jansen@example.com\n\nProfiel\nGedreven en resultaatgerichte recruiter met passie voor mensen. Proactief, klantgericht en stressbestendig – een echte teamspeler in een dynamische omgeving. Bovendien heb ik een scherp oog voor detail en lever ik graag een waardevolle bijdrage.\n\nWerkervaring\n2022 - heden Recruiter, [Bedrijfsnaam], Eindhoven\n- Verantwoordelijk voor de volledige werving en selectie.\n- Proactief sourcing via LinkedIn en vacaturebanken.\n- Nauwgezet beheer van kandidaten in het ATS.\n- Klantgericht contact met hiring managers.\n\nTalen\nNederlands moedertaal, Engels C1`,
};
for (const [f, t] of Object.entries(extra)) writeFileSync(path.join(tmp, f), t);

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
await app.setInputFiles('#files', [pdfPath, path.join(root, 'test/fixtures/human-nl.docx'), ...Object.keys(extra).map(f => path.join(tmp, f))]);
await app.waitForFunction(() => document.querySelectorAll('tbody tr').length === 5, null, { timeout: 30000 });
await app.click('th[data-k="ai"]');
await app.screenshot({ path: out('1-overview.png') });

await app.fill('#fai', '40'); await app.selectOption('#flang', 'English');
await app.screenshot({ path: out('2-filtered.png') });
await app.click('#reset');

await app.click('tbody tr:first-child');
await app.screenshot({ path: out('3-ai-explanation.png') });
await app.click('#closeDrawer');

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
