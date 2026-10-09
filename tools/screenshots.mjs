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

const VACANCY = `Recruiter (32 hours) – Eindhoven
You will be responsible for the full recruitment cycle for our technical vacancies.
You have experience with stakeholder management in a fast-growing organisation and you are comfortable
working with an applicant tracking system such as Oleeo. You build strong relationships with hiring managers
and you know how to attract passive candidates through LinkedIn and events.`;
const extra = {
  'emma-jansen-cover-letter.txt': `Emma Jansen\nemma.jansen@example.com\n\nDear Hiring Manager,\n\nI am writing to express my interest in the position of Sales Manager at Philips. With a proven track record in fast-paced environments, I am confident that my skills make me an ideal fit for your dynamic team.\n\nThroughout my career I have leveraged my passion for people to drive impactful outcomes. I thrive in collaborative settings and I am eager to contribute to your mission and make a meaningful impact.\n\nI look forward to the opportunity to discuss how I can be a valuable asset to your team.\n\nSincerely,\nEmma Jansen`,
  'sophie-motivation.txt': `Sophie de Vries\nsophie.devries@example.com\n\nUtrecht, 3 October 2026\n\nDear Mr Bakker,\n\nA former colleague told me you are looking for a recruiter for the technical department. I have been recruiting site managers and planners for seven years now, and honestly the hard-to-fill roles are the ones I enjoy most.\n\nWhat appeals to me is that you do most hiring yourselves instead of through agencies. I set that up at Jansen Construction too, with mixed results at first, and I learned a lot from it. I would be happy to tell you more over a coffee.\n\nKind regards,\nSophie de Vries`,
  'mark-de-boer_ATS-optimized.txt': `Mark de Boer\nEindhoven\nmark.deboer@example.com\n\nProfile\nRecruiter responsible for the full recruitment cycle for technical vacancies. I have experience with stakeholder management in a fast-growing organisation and I am comfortable working with an applicant tracking system such as Oleeo. I build strong relationships with hiring managers and know how to attract passive candidates through LinkedIn and events.\n\nWork experience\n2020 - present Recruiter, Brainport Talent, Eindhoven\n2017 - 2020 Sourcer, Philips, Eindhoven\n\nLanguages\nDutch native, English fluent`,
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
await app.waitForFunction(() => document.querySelectorAll('.doc-mark').length === 2 && document.querySelectorAll('tbody tr').length === 6, null, { timeout: 30000 });
await app.click('th[data-k="ai"]');
await app.screenshot({ path: out('1-overview.png') });

// vacancy text -> the 📨 indicator
await app.click('#vacBtn');
await app.fill('#vacTag', 'REQ-1042 Recruiter');
await app.fill('#vacText', VACANCY);
await app.screenshot({ path: out('11-vacancy-text.png') });
await app.click('#vacSave');
await app.waitForTimeout(300);
await app.click('th[data-k="tool"]');
await app.screenshot({ path: out('1-overview.png') });
await app.click('tbody tr:first-child');
await app.screenshot({ path: out('12-ai-and-tool.png') });
await app.click('#closeDrawer');
// cover letter: Emma's letter is AI-written and names another job
await app.click('th[data-k="ai"]');
const emma = await app.$$eval('tbody tr', trs => trs.findIndex(t => t.innerText.includes('Emma')));
await app.click(`tbody tr:nth-child(${emma + 1})`);
await app.$eval('#drawer', el => { el.scrollTop = 0; });
await app.screenshot({ path: out('14-cover-letter.png') });
await app.click('.doc-tab[data-doc="1"]');
await app.screenshot({ path: out('16-cover-letter-text.png') });
await app.click('#closeDrawer');
await app.selectOption('#fletter', 'has');
await app.evaluate(() => scrollTo(0, 0));
await app.screenshot({ path: out('15-has-cover-letter.png'), fullPage: true });
await app.selectOption('#fletter', '');
// typo search + did you mean
await app.fill('#in-all', 'managment'); await app.press('#in-all', 'Enter');
await app.fill('#in-all', 'pyhn'); await app.press('#in-all', 'Enter');
await app.evaluate(() => scrollTo(0, 0));
await app.screenshot({ path: out('13-typos.png'), fullPage: true });
await app.click('#reset');
await app.selectOption('#fai', 'hideAi'); await app.selectOption('#flang', 'English');
await app.screenshot({ path: out('2-filtered.png') });
await app.click('#reset');

await app.click('tbody tr:first-child');
await app.screenshot({ path: out('3-ai-explanation.png') });
await app.click('#closeDrawer');

// guided search: plain boxes, quick-add, saved searches, then the highlighted CV and the no-results helper
const type = async (box, words) => { for (const w of words) { await app.fill(box, w); await app.press(box, 'Enter'); } };
await type('#in-all', ['recruit']); await app.selectOption('#fai', 'hideAi');
app.once('dialog', d => d.accept('Recruiters – no AI CVs')); await app.click('#saveSearch');
await app.click('#reset');
await type('#in-all', ['python']);
await type('.chipfield[data-kind="g:0"] input', ['sql', 'power bi', 'docker']);
await type('#in-none', ['intern']);
await app.click('#addGroup');
await type('.chipfield[data-kind="g:1"] input', ['Dutch', 'Flemish']);
await app.selectOption('#fmin', '5');
// make "python" an exact skills-only match, so the badges show
await app.click('#finder .word.all .wtext');
await app.check('#tagEditor input[value="exact"]');
await app.selectOption('#te-field', 'skill');
await app.click('#te-done');
app.once('dialog', d => d.accept('Data analysts 5+ yrs')); await app.click('#saveSearch');
await app.evaluate(() => scrollTo(0, 0));
await app.screenshot({ path: out('7-custom-search.png'), fullPage: true });
await app.click('#finder .word.all .wtext');
await app.evaluate(() => scrollTo(0, 120));
await app.screenshot({ path: out('10-word-options.png') });
await app.keyboard.press('Escape');
await app.click('tbody tr:nth-child(2)');
await app.$eval('#drawer pre', el => el.scrollIntoView({ block: 'center' }));
await app.screenshot({ path: out('8-search-highlight.png') });
await app.click('#closeDrawer');
await app.evaluate(() => scrollTo(0, 0));
await type('#in-all', ['astronaut']);
await app.evaluate(() => scrollTo(0, 0));
await app.screenshot({ path: out('9-no-results-help.png'), fullPage: true });
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
