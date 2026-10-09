// The "Vacancies" tab: the recruiter's list of sites, a search over them, and the ads found.
import * as db from './lib/db.js';
import { load, store, isExtension, requestHost } from './lib/platform.js';
import { detectSource, fillUrl, fromCollected, PRESETS } from './lib/jobs.js';
import { crawlSource } from './lib/crawl.js';
import { compile, fromWords } from './lib/query.js';
import { report } from './lib/report.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = { greenhouse: '🏢', lever: '🏢', smartrecruiters: '🏢', workable: '🏢', recruitee: '🏢', personio: '🏢', adzuna: '🔌', page: '🌐', tab: '↗' };
const STALE_MS = 24 * 3600e3;
let sources = [], jobs = [], lastRun = 0, prevRun = 0, running = false, hooks = {};

export const jobById = id => jobs.find(j => j.id === id);
export const savedJobs = () => jobs.filter(j => !j.hidden);

function setStatus(t) { $('#vfStatus').textContent = t; }
const terms = () => $('#vfWords').value.split(',').map(s => s.trim()).filter(Boolean);

function addSource(url, extra = {}) {
  let src;
  try { src = { ...detectSource(url), ...extra, id: crypto.randomUUID() }; } catch { setStatus('That is not a web address. Paste a link starting with https://'); return null; }
  if (sources.some(s => s.url === src.url && s.type === src.type)) { setStatus('That one is already in your list.'); return null; }
  if (src.type !== 'tab') requestHost([src.url, src.api].filter(Boolean)); // the extension asks Chrome once for this site
  sources.push(src);
  store('jobSources', sources);
  renderSources();
  return src;
}

function renderSources() {
  const q = terms()[0] || '', city = $('#vfCity').value.trim();
  $('#vfSources').innerHTML = sources.map(s => {
    const st = s.status;
    const state = s.type === 'tab'
      ? `<span class="note">${isExtension ? 'Open it, then click <b>Collect vacancies from this page</b> in the extension' : 'Needs the extension: open it, then click <b>Collect vacancies from this page</b>'}</span>`
      : st?.error ? `<span class="src-err">⚠ ${esc(st.error)}</span>` : st ? `<span class="note">${st.count} vacanc${st.count === 1 ? 'y' : 'ies'} · ${new Date(st.at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>` : '<span class="note">Not searched yet</span>';
    return `<li data-id="${s.id}"><span class="src-icon" aria-hidden="true">${ICON[s.type] || '🌐'}</span>
      <span class="src-main"><b>${esc(s.name || s.label)}</b> ${state}</span>
      <a class="btn ghost small" href="${esc(fillUrl(s.url, q, city))}" target="_blank" rel="noopener">${s.type === 'tab' ? 'Open ↗' : 'View ↗'}</a>
      <button type="button" class="src-del ghost small" data-id="${s.id}" aria-label="Remove ${esc(s.name || s.label)}">×</button></li>`;
  }).join('') || '<li class="note">No sites yet. Paste a link below, or pick a suggestion.</li>';
  const have = new Set(sources.map(s => s.url));
  $('#vfPresets').innerHTML = PRESETS.filter(p => !have.has(p.url)).map(p => `<button type="button" class="sugg" data-preset="${esc(p.url)}" data-name="${esc(p.name)}">+ ${esc(p.name)}</button>`).join('') +
    (sources.some(s => s.type === 'adzuna') ? '' : '<button type="button" class="sugg" data-adzuna="1" title="Free API key from developer.adzuna.com">+ Adzuna (free key)</button>');
}

function filteredJobs() {
  const t = terms(), city = $('#vfCity').value.trim().toLowerCase();
  const q = t.length ? compile(fromWords({ groups: [t.map(text => ({ text, mode: 'similar', field: 'any' }))] })) : null;
  const src = $('#vfSource').value;
  return jobs.filter(j => !j.hidden && (!src || j.sourceUrl === src || j.source === src))
    // the title, not the whole ad: nearly every ad mentions "recruitment" somewhere in its small print
    .filter(j => !q || q.test({ name: j.title, text: `${j.title}\n${j.company}`, location: j.location }))
    .filter(j => !city || `${j.location} ${j.text}`.toLowerCase().includes(city))
    .sort((a, b) => (b.firstSeen || 0) - (a.firstSeen || 0) || (b.posted || '').localeCompare(a.posted || ''));
}

export function renderJobs() {
  const list = filteredJobs(), visible = jobs.filter(j => !j.hidden);
  const opts = [...new Map(visible.map(j => [j.sourceUrl || j.source, j.source])).entries()];
  const cur = $('#vfSource').value;
  $('#vfSource').innerHTML = '<option value="">All sites</option>' + opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  $('#vfSource').value = opts.some(([v]) => v === cur) ? cur : '';
  $('#jobsLine').innerHTML = visible.length ? `Showing <strong>${list.length}</strong> of ${visible.length} vacancies` : '';
  $('#jobsEmpty').hidden = visible.length > 0;
  $('#jobsTbl').hidden = !visible.length;
  $('#jobsTbl tbody').innerHTML = list.slice(0, 500).map(j => {
    const n = hooks.listCount?.(j.id) || 0;
    return `<tr data-id="${j.id}">
      <td><b>${esc(j.title)}</b>${prevRun && j.firstSeen > prevRun ? ' <span class="new">new</span>' : ''}${n ? ` <span class="list-tag" title="Candidates on the shortlist for this vacancy">📋 ${n}</span>` : ''}
        <div class="note">${esc((j.text || '').slice(0, 160))}${(j.text || '').length > 160 ? '…' : ''}</div></td>
      <td data-label="Company">${esc(j.company)}</td><td data-label="Location">${esc(j.location)}</td><td data-label="Posted">${esc(j.posted)}</td><td class="note" data-label="Site">${esc(j.source)}</td>
      <td class="job-actions"><button type="button" class="small" data-use="${j.id}" title="Use this ad as the vacancy text, so CVs that copy it are flagged">Use as vacancy</button>
        ${j.url ? `<a class="btn ghost small" href="${esc(j.url)}" target="_blank" rel="noopener">Open ↗</a>` : ''}
        <button type="button" class="ghost small" data-hide="${j.id}" title="Hide this ad">Hide</button></td></tr>`;
  }).join('');
}

async function merge(found, now = Date.now()) {
  const byId = new Map(jobs.map(j => [j.id, j]));
  const out = found.map(j => { const old = byId.get(j.id); return { ...j, firstSeen: old?.firstSeen || now, lastSeen: now, hidden: old?.hidden || false }; });
  await db.jobs.put(out);
  jobs = await db.jobs.all();
  return out.filter(j => j.firstSeen === now).length;
}

export async function run() {
  if (running) return;
  const todo = sources.filter(s => s.type !== 'tab');
  if (!todo.length) { setStatus(sources.length ? 'Your sites can only be read from an open tab – use the Open ↗ buttons.' : 'Add a site first.'); return; }
  running = true; $('#vfRun').disabled = true;
  prevRun = lastRun; const now = Date.now();
  const q = terms().join(', '), city = $('#vfCity').value.trim();
  let done = 0, added = 0;
  setStatus(`Searching ${todo.length} site${todo.length > 1 ? 's' : ''}…`);
  await Promise.all(todo.map(async s => {
    try {
      const found = await crawlSource(s, { q, city });
      added += await merge(found, now);
      s.status = { at: now, count: found.length };
    } catch (e) {
      s.status = { at: now, count: 0, error: e.message || String(e) };
      if (!(e instanceof TypeError) && !/answered|robots|tab|public|feed|address|searches/.test(e.message)) report(e, { step: 'crawl' });
    }
    setStatus(`Searching… ${++done} of ${todo.length} sites done`);
    renderSources(); renderJobs();
  }));
  lastRun = now;
  await store('jobSources', sources); await store('jobsLastRun', { lastRun, prevRun });
  running = false; $('#vfRun').disabled = false;
  const errs = todo.filter(s => s.status?.error).length;
  setStatus(`Done: ${added} new vacanc${added === 1 ? 'y' : 'ies'}${errs ? ` · ${errs} site${errs > 1 ? 's' : ''} could not be read (see ⚠ above)` : ''}.`);
  renderJobs();
}

// "Collect vacancies from this page" in the popup lands here.
export async function drainJobInbox() {
  const box = await load('jobInbox', []);
  if (!box.length) return 0;
  await store('jobInbox', []);
  let n = 0;
  for (const c of box) n += await merge(fromCollected(c));
  renderJobs();
  setStatus(`Collected ${n} new vacanc${n === 1 ? 'y' : 'ies'} from the page you had open.`);
  return n;
}

export async function initVacancies(h) {
  hooks = h;
  sources = await load('jobSources', []);
  ({ lastRun = 0, prevRun = 0 } = await load('jobsLastRun', {}));
  const saved = await load('jobSearch', {});
  $('#vfWords').value = saved.words || ''; $('#vfCity').value = saved.city || '';
  jobs = await db.jobs.all();
  renderSources(); renderJobs();

  $('#vfAddForm').onsubmit = e => { e.preventDefault(); if (addSource($('#vfUrl').value)) { $('#vfUrl').value = ''; setStatus('Added. Press Search now to read it.'); } };
  $('#vfRun').onclick = run;
  const remember = () => store('jobSearch', { words: $('#vfWords').value, city: $('#vfCity').value });
  for (const id of ['#vfWords', '#vfCity']) $(id).addEventListener('input', () => { remember(); renderSources(); renderJobs(); });
  $('#vfWords').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  $('#vfSource').onchange = renderJobs;
  $('#vfSources').onclick = async e => {
    const del = e.target.closest('.src-del'); if (!del) return;
    sources = sources.filter(s => s.id !== del.dataset.id); await store('jobSources', sources); renderSources();
  };
  $('#vfPresets').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.adzuna) {
      const appId = prompt('Adzuna app ID (free at developer.adzuna.com):'); if (!appId?.trim()) return;
      const appKey = prompt('Adzuna app key:'); if (!appKey?.trim()) return;
      sources.push({ id: crypto.randomUUID(), type: 'adzuna', url: 'https://www.adzuna.nl/', label: 'Adzuna', name: 'Adzuna', appId: appId.trim(), appKey: appKey.trim(), country: 'nl' });
      requestHost('https://api.adzuna.com/'); store('jobSources', sources); renderSources(); return;
    }
    if (addSource(b.dataset.preset, { name: b.dataset.name })) setStatus(`${b.dataset.name} added.`);
  };
  $('#jobsTbl tbody').onclick = async e => {
    const use = e.target.closest('[data-use]'), hide = e.target.closest('[data-hide]');
    if (use) hooks.useAsVacancy?.(jobById(use.dataset.use));
    if (hide) { const j = jobById(hide.dataset.hide); j.hidden = true; await db.jobs.put(j); renderJobs(); }
  };
}

// Opening the tab searches again when the last search is more than a day old.
export function onShow() {
  if (sources.some(s => s.type !== 'tab') && Date.now() - lastRun > STALE_MS) run();
}
