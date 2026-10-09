import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../site/api/report.js';

function fakeGitHub() {
  const issues = [], comments = [], calls = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const body = opts.body ? JSON.parse(opts.body) : null;
    const json = d => ({ ok: true, json: async () => d });
    if (opts.method === 'POST' && url.endsWith('/issues')) { const i = { number: issues.length + 1, ...body }; issues.push(i); return json(i); }
    if (opts.method === 'POST' && url.includes('/comments')) { comments.push(body); return json({}); }
    return json(issues.filter(i => i.labels.includes('auto-report')));
  };
  return { issues, comments, calls, fetch, env: { GITHUB_TOKEN: 't', GITHUB_REPO: 'o/r' } };
}

test('new error opens an issue, repeat adds a comment', async () => {
  const gh = fakeGitHub();
  const rep = { message: 'boom', step: 'extract', fileType: 'pdf' };
  const a = await handle(rep, '1.1.1.1', gh);
  const b = await handle(rep, '1.1.1.1', gh);
  assert.equal(a.status, 201);
  assert.equal(b.body.duplicate, true);
  assert.equal(gh.issues.length, 1);
  assert.equal(gh.comments.length, 1);
  assert.match(gh.issues[0].title, /^\[auto\] boom \[[0-9a-f]{10}\]$/);
});

test('manual reports always open a new issue', async () => {
  const gh = fakeGitHub();
  await handle({ message: 'x', step: 'manual', manual: true, comment: 'kolom leeg' }, '2.2.2.2', gh);
  await handle({ message: 'x', step: 'manual', manual: true, comment: 'kolom leeg' }, '2.2.2.2', gh);
  assert.equal(gh.issues.length, 2);
  assert.deepEqual(gh.issues[0].labels, ['tester-report']);
});

test('unknown fields (e.g. CV text) never reach GitHub', async () => {
  const gh = fakeGitHub();
  await handle({ message: 'x', step: 's', text: 'GEHEIME CV TEKST', name: 'Jan Jansen' }, '3.3.3.3', gh);
  assert.ok(!JSON.stringify(gh.calls).includes('GEHEIME'));
  assert.ok(!JSON.stringify(gh.calls).includes('Jansen'));
});

test('rate limit and missing token', async () => {
  const gh = fakeGitHub();
  for (let i = 0; i < 30; i++) await handle({ message: 'm' + i, step: 's' }, '4.4.4.4', gh);
  assert.equal((await handle({ message: 'z', step: 's' }, '4.4.4.4', gh)).status, 429);
  assert.equal((await handle({ message: 'z' }, '5.5.5.5', { fetch: gh.fetch, env: {} })).status, 503);
});

test('label refusal retries without labels; other failures report GitHub status', async () => {
  const posts = [];
  const mk = codes => async (url, opts = {}) => {
    if (opts.method !== 'POST') return { ok: true, status: 200, json: async () => [] };
    posts.push(JSON.parse(opts.body));
    const status = codes.shift();
    return { ok: status < 300, status, json: async () => ({ number: 7 }) };
  };
  const env = { GITHUB_TOKEN: 't' };
  const a = await handle({ message: 'lbl', step: 's' }, '6.6.6.6', { fetch: mk([422, 201]), env });
  assert.equal(a.status, 201);
  assert.ok(posts[0].labels && !posts[1].labels);
  const b = await handle({ message: 'nf', step: 's' }, '7.7.7.7', { fetch: mk([404]), env });
  assert.deepEqual(b.body, { ok: false, github: 404 });
});
