import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as J from '../extension/lib/jobs.js';

const fx = f => readFileSync(new URL(`./fixtures/jobs/${f}`, import.meta.url), 'utf8');
const BASE = 'https://werkenbij.example.nl/careers/';

test('a pasted URL is recognised per platform', () => {
  const t = u => J.detectSource(u);
  assert.equal(t('https://boards.greenhouse.io/gitlab').api, 'https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true');
  assert.equal(t('job-boards.greenhouse.io/acme/jobs/1').type, 'greenhouse');
  assert.equal(t('https://jobs.lever.co/acme').api, 'https://api.lever.co/v0/postings/acme?mode=json');
  assert.equal(t('https://jobs.smartrecruiters.com/Acme').type, 'smartrecruiters');
  assert.equal(t('https://apply.workable.com/acme/').type, 'workable');
  assert.equal(t('https://acme.recruitee.com/').api, 'https://acme.recruitee.com/api/offers/');
  assert.equal(t('https://acme.jobs.personio.de').api, 'https://acme.jobs.personio.de/xml');
  assert.equal(t('https://www.acme.nl/werken-bij').type, 'page');
  assert.equal(t('www.acme.nl/vacatures.rss').url, 'https://www.acme.nl/vacatures.rss', 'https:// is added');
  assert.throws(() => t('not a link'));
});

test('LinkedIn, Indeed and boards that forbid crawlers are "open it in a tab"', () => {
  for (const u of ['https://www.linkedin.com/jobs/search/?keywords={q}', 'https://nl.indeed.com/jobs?q=x', 'https://www.glassdoor.nl/x', 'https://www.werk.nl/x',
    'https://www.nationalevacaturebank.nl/x', 'https://www.jobbird.com/nl/vacature?s=x']) assert.equal(J.detectSource(u).type, 'tab', u);
  assert.equal(J.detectSource('https://www.youngcapital.nl/vacatures?search%5Bkeywords_scope%5D={q}').type, 'page');
  assert.ok(J.PRESETS.every(p => J.detectSource(p.url)), 'every preset parses');
  assert.equal(J.fillUrl('https://x.nl/?q={q}&l={city}', 'data analist', "'s-Hertogenbosch"), "https://x.nl/?q=data%20analist&l='s-Hertogenbosch");
});

test('JobPosting JSON-LD: single, @graph, several locations, HTML in the description', () => {
  const a = J.jsonLd(fx('1001-recruiter-utrecht.html'), BASE + 'vacatures/1001-recruiter-utrecht').jobs.map(j => J.normalise(j));
  assert.equal(a.length, 1);
  assert.equal(a[0].title, 'Recruiter (32-40 uur)');
  assert.equal(a[0].company, 'Groen & Co');
  assert.equal(a[0].location, 'Utrecht, UT');
  assert.equal(a[0].posted, '2026-10-01');
  assert.match(a[0].text, /Als recruiter bij Groen & Co werf je/);
  assert.match(a[0].text, /• Ervaring met Oleeo/, 'list items become bullets');
  assert.equal(a[0].url, BASE + 'vacatures/1001-recruiter-utrecht', 'no url in the data: the page itself');

  const b = J.jsonLd(fx('1002-verpleegkundige-amsterdam.html'), BASE + 'x').jobs.map(j => J.normalise(j));
  assert.equal(b[0].location, 'Amsterdam / Haarlem');
  assert.equal(b[0].company, 'Groen & Co Zorg');
  assert.equal(b[0].url, 'https://werkenbij.example.nl/careers/vacatures/1002-verpleegkundige-amsterdam', 'relative url resolved');

  const list = J.jsonLd('<script type="application/ld+json">[{"@type":"ItemList","itemListElement":[{"@type":"ListItem","url":"/a/1"},{"@type":"ListItem","item":{"url":"https://x.nl/b/2"}}]}]</script>', 'https://x.nl/');
  assert.deepEqual(list.links, ['https://x.nl/a/1', 'https://x.nl/b/2']);
  assert.deepEqual(J.jsonLd('<script type="application/ld+json">{ broken</script>', BASE).jobs, [], 'broken JSON-LD is skipped');
});

test('a listing yields its ad links, on the same site only; a plain page can still read as an ad', () => {
  const links = J.jobLinks(fx('index.html'), BASE);
  assert.deepEqual(links.sort(), [BASE + 'vacatures/1001-recruiter-utrecht', BASE + 'vacatures/1002-verpleegkundige-amsterdam', BASE + 'vacatures/1003-sales-manager']);
  const page = J.pageAsJob(fx('1003-sales-manager.html'), BASE + 'vacatures/1003-sales-manager');
  assert.equal(page.title, 'Sales Manager');
  assert.match(page.text, /5 jaar ervaring in B2B-sales/);
  assert.equal(J.pageAsJob('<h1>Over ons</h1><p>Wij zijn een bedrijf.</p>', BASE), null, 'a page that is not an ad');
});

test('RSS and Personio XML', () => {
  assert.ok(J.isFeed(fx('feed.xml')));
  assert.ok(!J.isFeed(fx('index.html')));
  const f = J.parseFeed(fx('feed.xml')).map(j => J.normalise(j));
  assert.deepEqual(f.map(j => j.title), ['Data Analist', 'HR Adviseur & Recruiter']);
  assert.equal(f[0].url, 'https://example.org/jobs/77-data-analist');
  assert.equal(f[0].posted, '2026-10-05');
  assert.match(f[0].text, /SQL en Python/);
  const p = J.parsePersonio(fx('personio.xml'), 'acme.jobs.personio.de').map(j => J.normalise(j));
  assert.deepEqual([p[0].title, p[0].company, p[0].location, p[0].url], ['Backend Developer', 'Acme NL', 'Eindhoven', 'https://acme.jobs.personio.de/job/123']);
  assert.match(p[0].text, /Go en Postgres/);
});

test('ATS APIs and Adzuna are normalised', () => {
  const gh = J.parseApi('greenhouse', { jobs: [{ title: 'SRE', location: { name: 'Remote' }, absolute_url: 'https://boards.greenhouse.io/x/jobs/1', first_published: '2026-09-01T00:00:00Z', content: '&lt;p&gt;Kubernetes&lt;/p&gt;' }] }, { label: 'boards.greenhouse.io/x' });
  assert.deepEqual([gh[0].title, gh[0].company, gh[0].location, gh[0].text], ['SRE', 'x', 'Remote', 'Kubernetes']);
  const lv = J.parseApi('lever', [{ text: 'Designer', categories: { location: 'Amsterdam' }, hostedUrl: 'https://jobs.lever.co/y/1', createdAt: 1759276800000, descriptionPlain: 'Figma', lists: [{ text: 'You', content: '<li>care</li>' }] }], { label: 'jobs.lever.co/y' });
  assert.deepEqual([lv[0].title, lv[0].company, lv[0].location], ['Designer', 'y', 'Amsterdam']);
  assert.match(lv[0].text, /Figma[\s\S]*You\n• care/);
  const az = J.parseApi('adzuna', { results: [{ title: '<strong>Recruiter</strong>', company: { display_name: 'Z' }, location: { display_name: 'Utrecht' }, redirect_url: 'https://adzuna.nl/r/1', created: '2026-10-01T00:00:00Z', description: 'x' }] });
  assert.equal(az[0].title, 'Recruiter');
  assert.equal(J.adzunaUrl({ appId: 'a', appKey: 'k' }, 'data analist', 'Utrecht'), 'https://api.adzuna.com/v1/api/jobs/nl/search/1?app_id=a&app_key=k&results_per_page=50&what=data%20analist&where=Utrecht');
});

test('the same ad twice is kept once, with the longer text', () => {
  const a = J.normalise({ title: 'Recruiter', company: 'X', url: 'https://x.nl/j/1/?utm_source=a&trk=b#top', text: 'short' });
  const b = J.normalise({ title: 'Recruiter', company: 'X', url: 'https://x.nl/j/1', text: 'a much longer description' });
  const c = J.normalise({ title: 'Recruiter', company: 'X', text: 'no url, same title and company' });
  const out = J.dedupe([a, b, c]);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'no url, same title and company');
  const jk = ['abc', 'def'].map(k => J.normalise({ title: 'Recruiter', company: k, url: `https://nl.indeed.com/viewjob?jk=${k}&from=serp` }));
  assert.notEqual(jk[0].id, jk[1].id, 'an id in the query string is part of the ad');
  assert.equal(J.canonical('https://X.nl/j/1/?utm_source=a&id=7#x'), 'https://x.nl/j/1?id=7');
});

test('what was collected from an open LinkedIn tab becomes ads, the open one with its text', () => {
  const out = J.fromCollected({ host: 'www.linkedin.com', url: 'https://www.linkedin.com/jobs/search/', ld: [],
    cards: [{ title: 'Corporate Recruiter', company: 'Bol', location: 'Utrecht', url: 'https://www.linkedin.com/jobs/view/4011/' }, { title: 'TA Specialist', company: 'ASML', location: 'Veldhoven', url: 'https://www.linkedin.com/jobs/view/4012/' }],
    detail: { title: 'Corporate Recruiter', url: 'https://www.linkedin.com/jobs/search/?currentJobId=4011', text: 'You hire engineers.' } });
  assert.equal(out.length, 2);
  assert.equal(out[0].source, 'linkedin.com');
  assert.equal(out.find(j => j.title === 'Corporate Recruiter').text, 'You hire engineers.');
});

test('robots.txt: our group or *, wildcards, longest rule wins', () => {
  const r = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /zoeken?*\nDisallow: /*&search*\nAllow: /zoeken?page=\nDisallow: /cv/$\n';
  assert.equal(J.robotsAllows(r, '/vacatures?search%5Bk%5D=x'), true);
  assert.equal(J.robotsAllows(r, '/vacatures?search%5Bk%5D=x&search%5Bz%5D=y'), false);
  assert.equal(J.robotsAllows(r, '/zoeken?q=x'), false);
  assert.equal(J.robotsAllows(r, '/zoeken?page=2'), true, 'a longer Allow beats a shorter Disallow');
  assert.equal(J.robotsAllows(r, '/cv/'), false);
  assert.equal(J.robotsAllows(r, '/cv/upload'), true, '$ anchors the end');
  assert.equal(J.robotsAllows('User-agent: CVScreenerBot\nDisallow: /\nUser-agent: *\nAllow: /', '/x'), false, 'a group naming us wins over *');
  assert.equal(J.robotsAllows('User-agent: *\nDisallow:', '/x'), true, 'empty Disallow allows all');
  assert.equal(J.robotsAllows('', '/x'), true);
});
