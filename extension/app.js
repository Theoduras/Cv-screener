import * as db from './lib/db.js';
import { extract, fileKind, ExtractError } from './lib/extract.js';
import { parseCV } from './lib/parse.js';
import { aiScore, textHash } from './lib/aiscore.js';
import { report, installGlobalHandlers, sizeBucket } from './lib/report.js';

installGlobalHandlers();
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let rows = [], extraSkills = [], sortKey = 'addedAt', sortAsc = false;

const uid = () => crypto.randomUUID();
const store = (k, v) => chrome.storage.local.set({ [k]: v });
const load = async (k, d) => (await chrome.storage.local.get(k))[k] ?? d;

function analyse(rec) {
  const parsed = parseCV(rec.text, { extraSkills });
  return { ...rec, ...parsed, hash: textHash(rec.text), baseAi: aiScore(rec.text, { producer: rec.producer }) };
}

// AI score with the duplicate signal, which depends on the whole set.
function withDupes(list) {
  const counts = {};
  for (const r of list) if (r.hash) counts[r.hash] = (counts[r.hash] || 0) + 1;
  return list.map(r => {
    const d = (counts[r.hash] || 1) - 1;
    return { ...r, aiRes: r.error ? null : d ? aiScore(r.text, { producer: r.producer, duplicates: d }) : r.baseAi };
  });
}

async function addFromBytes(buf, name, mime, extra) {
  const rec = { id: uid(), addedAt: Date.now(), fileName: name, fileType: fileKind(name, mime), ...extra };
  try {
    const { text, producer } = await extract(buf, name, mime);
    return analyse({ ...rec, text, producer });
  } catch (e) {
    if (!(e instanceof ExtractError)) report(e, { step: 'extract', fileType: rec.fileType, fileSize: sizeBucket(buf.byteLength) });
    return { ...rec, error: e.message || String(e), name: name, text: '' };
  }
}

async function ingest(files) {
  files = files.filter(f => fileKind(f.name, f.type) !== 'unknown');
  if (!files.length) return;
  const tag = $('#tagInput').value.trim();
  const prog = $('#prog');
  prog.hidden = false; prog.max = files.length; prog.value = 0;
  const out = [];
  for (const f of files) {
    $('#progText').textContent = ` ${prog.value + 1}/${files.length}`;
    out.push(await addFromBytes(await f.arrayBuffer(), f.name, f.type, { source: 'file', tag }));
    prog.value++;
    if (out.length >= 25) { await db.put(out.splice(0)); await refresh(); }
  }
  await db.put(out);
  prog.hidden = true; $('#progText').textContent = ` ${files.length} processed.`;
  await refresh();
}

async function drainInbox() {
  const inbox = await load('inbox', []);
  if (!inbox.length) return;
  await store('inbox', []);
  const out = [];
  for (const cap of inbox) {
    const extra = { source: 'ATS page', tag: cap.title, pageUrl: cap.url };
    for (const f of cap.files) {
      const bin = Uint8Array.from(atob(f.b64), c => c.charCodeAt(0));
      out.push(await addFromBytes(bin.buffer, f.name, f.type, extra));
    }
    if (!cap.files.length) {
      out.push(cap.text.replace(/\s/g, '').length > 50
        ? analyse({ id: uid(), addedAt: Date.now(), fileName: '(page text)', fileType: 'page', text: cap.text, producer: '', ...extra })
        : { id: uid(), addedAt: Date.now(), fileName: '(page)', error: 'No CV found on this page.', name: cap.title, text: '', ...extra });
    }
  }
  await db.put(out);
  await refresh();
}

// ---------- filtering / rendering ----------
const F = () => ({
  q: $('#fq').value.trim().toLowerCase(), loc: $('#floc').value.trim().toLowerCase(), lang: $('#flang').value,
  skills: $('#fskills').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean), mode: $('#fmode').value,
  min: $('#fmin').value === '' ? null : +$('#fmin').value, max: $('#fmax').value === '' ? null : +$('#fmax').value,
  ai: $('#fai').value === '' ? null : +$('#fai').value, tag: $('#ftag').value,
});

function filtered() {
  const f = F();
  return rows.filter(r => {
    if (f.q && !`${r.name} ${r.email} ${r.fileName} ${r.text}`.toLowerCase().includes(f.q)) return false;
    if (f.loc && !(r.location || '').toLowerCase().includes(f.loc)) return false;
    if (f.lang && !(r.languages || []).includes(f.lang) && r.cvLanguage !== f.lang) return false;
    if (f.skills.length) {
      const have = (r.skills || []).map(s => s.toLowerCase()), text = (r.text || '').toLowerCase();
      const hit = s => have.includes(s) || text.includes(s);
      if (f.mode === 'all' ? !f.skills.every(hit) : !f.skills.some(hit)) return false;
    }
    if (f.min !== null && !(r.years >= f.min)) return false;
    if (f.max !== null && !(r.years <= f.max)) return false;
    if (f.ai !== null && r.aiRes && r.aiRes.score > f.ai) return false;
    if (f.tag && r.tag !== f.tag) return false;
    return true;
  }).sort((a, b) => {
    const v = r => sortKey === 'ai' ? r.aiRes?.score ?? -1 : Array.isArray(r[sortKey]) ? r[sortKey].length : r[sortKey] ?? '';
    const x = v(a), y = v(b);
    return (x > y ? 1 : x < y ? -1 : 0) * (sortAsc ? 1 : -1);
  });
}

function render() {
  const list = filtered();
  $('#count').textContent = `${list.length} of ${rows.length} CVs`;
  $('#empty').hidden = rows.length > 0;
  $('#tbl tbody').innerHTML = list.map(r => r.error ? `
    <tr class="err" data-id="${r.id}"><td>${esc(r.name || r.fileName)}</td><td colspan="5">⚠ ${esc(r.error)}</td><td></td><td>${esc(r.tag)}</td><td>${new Date(r.addedAt).toLocaleDateString('en-GB')}</td></tr>` : `
    <tr data-id="${r.id}">
      <td>${esc(r.name || '(unknown)')}<div class="note">${esc(r.email)}</div></td>
      <td>${esc(r.location)}</td>
      <td>${esc((r.languages.length ? r.languages : [r.cvLanguage]).filter(Boolean).join(', '))}</td>
      <td>${r.years || ''}</td>
      <td class="skills">${esc(r.skills.slice(0, 12).join(', '))}${r.skills.length > 12 ? ' …' : ''}</td>
      <td>${esc(r.education)}</td>
      <td><span class="ai ${r.aiRes.level}" title="${esc(r.aiRes.reasons.join('\n'))}">${r.aiRes.score}</span></td>
      <td>${esc(r.tag)}</td>
      <td>${new Date(r.addedAt).toLocaleDateString('en-GB')}</td>
    </tr>`).join('');
  document.querySelectorAll('th').forEach(th => {
    th.classList.toggle('sorted', th.dataset.k === sortKey);
    th.classList.toggle('asc', th.dataset.k === sortKey && sortAsc);
  });
}

function fillSelect(sel, values, first) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${first}</option>` + values.map(v => `<option>${esc(v)}</option>`).join('');
  sel.value = values.includes(cur) ? cur : '';
}

async function refresh() {
  rows = withDupes(await db.all());
  fillSelect($('#flang'), [...new Set(rows.flatMap(r => [...(r.languages || []), r.cvLanguage]).filter(Boolean))].sort(), 'Any language');
  fillSelect($('#ftag'), [...new Set(rows.map(r => r.tag).filter(Boolean))].sort(), 'All vacancies');
  render();
}

function openDrawer(id) {
  const r = rows.find(x => x.id === id);
  if (!r) return;
  const dl = [['Name', r.name], ['Email', r.email], ['Phone', r.phone], ['LinkedIn', r.linkedin], ['Location', r.location],
    ['Languages', (r.languages || []).join(', ')], ['CV written in', r.cvLanguage], ['Years of experience', r.years], ['Education', r.education],
    ['Skills', (r.skills || []).join(', ')], ['Vacancy', r.tag], ['Source', `${r.source || ''} – ${r.fileName || ''}`], ['PDF made with', r.producer]];
  $('#drawerBody').innerHTML = `
    <h2>${esc(r.name || r.fileName)}</h2>
    ${r.error ? `<p>⚠ ${esc(r.error)}</p>` : `
    <h3>AI score: <span class="ai ${r.aiRes.level}">${r.aiRes.score}</span></h3>
    <ul>${r.aiRes.reasons.map(x => `<li>${esc(x)}</li>`).join('') || '<li>No signals found.</li>'}</ul>
    <p class="note">An indication, not proof. Use it to prioritise, not to reject.</p>
    <dl>${dl.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <h3>Text</h3><pre>${esc(r.text)}</pre>`}
    <button class="danger" id="delOne">Delete this candidate</button>`;
  $('#delOne').onclick = async () => { await db.remove(id); $('#drawer').hidden = true; refresh(); };
  $('#drawer').hidden = false;
}

function exportCsv() {
  const cols = ['name', 'email', 'phone', 'linkedin', 'location', 'languages', 'cvLanguage', 'years', 'education', 'skills', 'ai', 'aiReasons', 'tag', 'fileName', 'addedAt'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = filtered().map(r => cols.map(c => cell(
    c === 'ai' ? r.aiRes?.score : c === 'aiReasons' ? r.aiRes?.reasons.join(' | ') :
    c === 'addedAt' ? new Date(r.addedAt).toISOString() : Array.isArray(r[c]) ? r[c].join(', ') : r[c])).join(','));
  const blob = new Blob(['﻿' + [cols.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `cv-screener-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

// Folder drops arrive as entries, not files.
async function filesFromDrop(dt) {
  const out = [];
  const walk = async entry => {
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const e of batch) await walk(e); } while (batch.length);
    }
  };
  const entries = [...dt.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files];
  for (const e of entries) await walk(e);
  return out;
}

// ---------- wiring ----------
const drop = $('#drop');
drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = async e => { e.preventDefault(); drop.classList.remove('over'); ingest(await filesFromDrop(e.dataTransfer)); };
$('#files').onchange = e => { ingest([...e.target.files]); e.target.value = ''; };
$('#folder').onchange = e => { ingest([...e.target.files]); e.target.value = ''; };
$('#filters').oninput = render;
$('#reset').onclick = () => { $('#filters').querySelectorAll('input').forEach(i => i.value = ''); $('#filters').querySelectorAll('select').forEach(s => s.selectedIndex = 0); render(); };
document.querySelector('thead').onclick = e => {
  const k = e.target.dataset.k; if (!k) return;
  sortAsc = sortKey === k ? !sortAsc : k === 'name' || k === 'location'; sortKey = k; render();
};
$('#tbl tbody').onclick = e => { const tr = e.target.closest('tr'); if (tr) openDrawer(tr.dataset.id); };
$('#closeDrawer').onclick = () => { $('#drawer').hidden = true; };
$('#exportBtn').onclick = exportCsv;
$('#clearAll').onclick = async () => { if (confirm('Delete all CVs from this browser?')) { await db.clear(); refresh(); } };
$('#reportBtn').onclick = async () => {
  const comment = prompt('What went wrong? (please do not include candidate details)');
  if (comment === null) return;
  await report(new Error('Manual report'), { step: 'manual', manual: true, comment });
  alert('Thanks, your report has been sent.');
};
$('#settingsBtn').onclick = () => { $('#extraSkills').value = extraSkills.join('\n'); $('#settings').showModal(); };
$('#saveSkills').onclick = async () => {
  extraSkills = $('#extraSkills').value.split('\n').map(s => s.trim()).filter(Boolean);
  await store('extraSkills', extraSkills);
  const all = await db.all();
  await db.put(all.filter(r => !r.error).map(analyse));
  refresh();
};
chrome.runtime.onMessage.addListener((m, _s, reply) => {
  if (m?.type !== 'focus') return;
  chrome.tabs.getCurrent(t => {
    chrome.tabs.update(t.id, { active: true });
    chrome.windows.update(t.windowId, { focused: true });
    reply(true);
  });
  return true;
});
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.inbox?.newValue?.length) drainInbox(); });

(async () => {
  extraSkills = await load('extraSkills', []);
  await refresh();
  await drainInbox();
})().catch(e => report(e, { step: 'init' }));
