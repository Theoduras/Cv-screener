import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, isPrivate, guardedLookup, checkUrl } from '../site/api/fetch.js';

// A fake web: url -> { status, headers, body }. Records every request.
function fakeWeb(pages) {
  const calls = [];
  const request = async url => {
    calls.push(url);
    const p = pages[url];
    if (!p) return { status: 404, headers: {}, body: Buffer.from('') };
    return { status: p.status || 200, headers: { 'content-type': 'text/html; charset=utf-8', ...p.headers }, body: Buffer.from(p.body || ''), tooLarge: !!p.tooLarge };
  };
  return { calls, request, env: {} };
}
let n = 0; const ip = () => `10.9.0.${++n}`; // a fresh caller per test, so the rate limit doesn't carry over

test('a normal public page is passed through, robots.txt read once per site', async () => {
  const web = fakeWeb({ 'https://acme.nl/robots.txt': { body: 'User-agent: *\nDisallow: /private', headers: { 'content-type': 'text/plain' } }, 'https://acme.nl/vacatures': { body: '<h1>Jobs</h1>' } });
  const a = await handle('https://acme.nl/vacatures', ip(), web);
  assert.equal(a.status, 200);
  assert.equal(a.body.toString(), '<h1>Jobs</h1>');
  assert.equal(a.headers['X-Final-Url'], 'https://acme.nl/vacatures');
  await handle('https://acme.nl/vacatures', ip(), web);
  assert.equal(web.calls.filter(u => u.endsWith('robots.txt')).length, 1);
});

test('refuses what robots.txt disallows, and LinkedIn / Indeed outright', async () => {
  const web = fakeWeb({ 'https://shop.nl/robots.txt': { body: 'User-agent: *\nDisallow: /zoeken?*' }, 'https://shop.nl/zoeken?q=x': { body: 'x' } });
  assert.equal((await handle('https://shop.nl/zoeken?q=x', ip(), web)).json.error, 'robots');
  assert.ok(!web.calls.includes('https://shop.nl/zoeken?q=x'), 'the page itself was never fetched');
  for (const u of ['https://www.linkedin.com/jobs/view/1', 'https://nl.indeed.com/viewjob?jk=1', 'https://www.glassdoor.com/x'])
    assert.equal((await handle(u, ip(), web)).json.error, 'blocked-site', u);
});

test('refuses non-web, private and odd addresses before connecting', async () => {
  const web = fakeWeb({});
  for (const [u, err] of [['file:///etc/passwd', 'bad-url'], ['ftp://acme.nl/', 'bad-url'], ['https://user:pw@acme.nl/', 'bad-url'], ['https://acme.nl:8443/', 'bad-url'],
    ['http://localhost/', 'private'], ['http://127.0.0.1/', 'private'], ['http://10.0.0.5/', 'private'], ['http://169.254.169.254/latest/meta-data/', 'private'],
    ['http://[::1]/', 'private'], ['http://192.168.1.1/', 'private'], ['not a url', 'bad-url']])
    assert.equal((await handle(u, ip(), web)).json.error, err, u);
  assert.equal(web.calls.length, 0);
});

test('a DNS name that points inside is refused when connecting', async () => {
  const fakeDns = addrs => (host, opts, cb) => cb(null, addrs);
  const look = (addrs, opts = {}) => new Promise(res => guardedLookup(fakeDns(addrs))('x.nl', opts, (err, a) => res(err ? err.code : a)));
  assert.equal(await look([{ address: '10.1.2.3', family: 4 }]), 'EPRIVATE');
  assert.equal(await look([{ address: '93.184.216.34', family: 4 }, { address: '::ffff:127.0.0.1', family: 6 }]), 'EPRIVATE', 'one bad address is enough');
  assert.equal(await look([{ address: '93.184.216.34', family: 4 }]), '93.184.216.34');
  assert.ok(isPrivate('172.20.0.1') && isPrivate('100.64.0.1') && isPrivate('fd00::1') && isPrivate('fe80::1'));
  assert.ok(!isPrivate('172.32.0.1') && !isPrivate('8.8.8.8') && !isPrivate('2a00:1450::1'));
});

test('redirects are followed but checked again, each hop', async () => {
  const web = fakeWeb({
    'https://a.nl/jobs': { status: 301, headers: { location: 'https://b.nl/jobs' } }, 'https://b.nl/jobs': { body: 'ok' },
    'https://a.nl/evil': { status: 302, headers: { location: 'http://169.254.169.254/' } },
    'https://a.nl/li': { status: 302, headers: { location: 'https://www.linkedin.com/jobs' } },
  });
  const ok = await handle('https://a.nl/jobs', ip(), web);
  assert.equal(ok.body.toString(), 'ok');
  assert.equal(ok.headers['X-Final-Url'], 'https://b.nl/jobs');
  assert.equal((await handle('https://a.nl/evil', ip(), web)).json.error, 'private');
  assert.equal((await handle('https://a.nl/li', ip(), web)).json.error, 'blocked-site');
});

test('size cap, content types, site errors, method, rate limit', async () => {
  const web = fakeWeb({ 'https://c.nl/big': { tooLarge: true }, 'https://c.nl/x.zip': { headers: { 'content-type': 'application/zip' } }, 'https://c.nl/gone': { status: 500 }, 'https://c.nl/feed': { body: '<rss/>', headers: { 'content-type': 'application/rss+xml' } } });
  assert.equal((await handle('https://c.nl/big', ip(), web)).json.error, 'too-large');
  assert.equal((await handle('https://c.nl/x.zip', ip(), web)).json.error, 'not-a-page');
  assert.equal((await handle('https://c.nl/gone', ip(), web)).json.error, 'site-500');
  assert.equal((await handle('https://c.nl/feed', ip(), web)).status, 200);
  const caller = ip(); let last;
  for (let i = 0; i < 121; i++) last = await handle('https://c.nl/feed', caller, web);
  assert.equal(last.json.error, 'rate-limited');
  assert.equal(checkUrl('http://localhost:5173/', { FETCH_ALLOW_PRIVATE: '1' }), null, 'local tests can opt in');
});
