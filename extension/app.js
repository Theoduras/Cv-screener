import * as db from './lib/db.js';
import { extract, fileKind, ExtractError } from './lib/extract.js';
import { parseCV } from './lib/parse.js';
import { aiScore, textHash } from './lib/aiscore.js';
import { tailorScore } from './lib/tailor.js';
import { report, installGlobalHandlers, sizeBucket } from './lib/report.js';
import { compile, highlight, fromWords, plainLabel, termCode, suggest } from './lib/query.js';
import { SKILLS } from './lib/dict.js';

installGlobalHandlers();
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let rows = [], extraSkills = [], sortKey = 'addedAt', sortAsc = false, query = compile(''), saved = [], vacancies = {}, words = { all: [], groups: [[]], none: [] };

const uid = () => crypto.randomUUID();
const store = (k, v) => chrome.storage.local.set({ [k]: v });
const load = async (k, d) => (await chrome.storage.local.get(k))[k] ?? d;

function analyse(rec) {
  const parsed = parseCV(rec.text, { extraSkills });
  return { ...rec, ...parsed, hash: textHash(rec.text), baseAi: aiScore(rec.text, { producer: rec.producer }) };
}

// The "sent/tailored by a tool" score depends on the whole set (duplicates, the same person
// across vacancies) and on the vacancy text, so it is worked out at render time.
const holder = r => (r.email || r.name || '').toLowerCase().trim();
function withDupes(list) {
  const counts = {}, byHolder = {};
  for (const r of list) {
    if (r.error) continue;
    if (r.hash) counts[r.hash] = (counts[r.hash] || 0) + 1;
    const h = holder(r);
    if (h) (byHolder[h] ||= []).push(r);
  }
  return list.map(r => {
    if (r.error) return { ...r, aiRes: null, tailRes: null };
    const d = (counts[r.hash] || 1) - 1;
    // other vacancies this person applied to with a differently worded CV
    const others = new Set((byHolder[holder(r)] || []).filter(o => o.tag !== r.tag && o.hash !== r.hash).map(o => o.tag));
    const tailRes = tailorScore(r, { vacancyText: vacancies[r.tag] || '', duplicates: d, sameHolder: others.size });
    return { ...r, aiRes: r.baseAi, tailRes };
  });
}

async function addFromBytes(buf, name, mime, extra) {
  const rec = { id: uid(), addedAt: Date.now(), fileName: name, fileType: fileKind(name, mime), ...extra };
  try {
    const { text, producer, meta, hiddenWords } = await extract(buf, name, mime);
    return analyse({ ...rec, text, producer, meta, hiddenWords });
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
  loc: $('#floc').value.trim().toLowerCase(), lang: $('#flang').value,
  min: $('#fmin').value === '' ? null : +$('#fmin').value, max: $('#fmax').value === '' ? null : +$('#fmax').value,
  ai: $('#fai').value, tag: $('#ftag').value,
});

function filtered() {
  const f = F();
  query = compile(`${fromWords(words)} ${$('#fq').value}`);
  return rows.filter(r => {
    if (query.active && (r.error || !query.test(r))) return false;
    if (f.loc && !(r.location || '').toLowerCase().includes(f.loc)) return false;
    if (f.lang && !(r.languages || []).includes(f.lang) && r.cvLanguage !== f.lang) return false;
    if (f.min !== null && !(r.years >= f.min)) return false;
    if (f.max !== null && !(r.years <= f.max)) return false;
    if (f.ai && r.aiRes) {
      const ai = r.aiRes.level === 'high', tool = r.tailRes.level === 'high';
      if (f.ai === 'hideAi' && ai) return false;
      if (f.ai === 'hideTool' && tool) return false;
      if (f.ai === 'hideBoth' && (ai || tool)) return false;
      if (f.ai === 'human' && (r.aiRes.level !== 'low' || r.tailRes.level !== 'low')) return false;
    }
    if (f.tag && r.tag !== f.tag) return false;
    return true;
  }).sort((a, b) => {
    const v = r => sortKey === 'ai' ? r.aiRes?.score ?? -1 : sortKey === 'tool' ? r.tailRes?.score ?? -1 : Array.isArray(r[sortKey]) ? r[sortKey].length : r[sortKey] ?? '';
    const x = v(a), y = v(b);
    return (x > y ? 1 : x < y ? -1 : 0) * (sortAsc ? 1 : -1);
  });
}

function render() {
  const list = filtered();
  $('#count').textContent = `${list.length} of ${rows.length} CVs`;
  renderWords();
  renderResultLine(list);
  const q = query.active;
  $('#qhint').className = query.error ? 'qhint bad' : 'qhint';
  $('#qhint').textContent = query.error || '';
  $('#matchedTh').hidden = !q;
  const matchedCell = r => q ? `<td class="matched">${query.matched(r).map(l => `<span class="hit">${esc(plainLabel(l))} ✓</span>`).join(' ')}</td>` : '';
  $('#empty').hidden = rows.length > 0;
  $('#tbl tbody').innerHTML = list.map(r => r.error ? `
    <tr class="err" data-id="${r.id}"><td>${esc(r.name || r.fileName)}</td><td colspan="${q ? 6 : 5}">⚠ ${esc(r.error)}</td><td></td><td></td><td>${esc(r.tag)}</td><td>${new Date(r.addedAt).toLocaleDateString('en-GB')}</td></tr>` : `
    <tr data-id="${r.id}">
      <td>${esc(r.name || '(unknown)')}<div class="note">${esc(r.email)}</div></td>
      ${matchedCell(r)}
      <td>${esc(r.location)}</td>
      <td>${esc((r.languages.length ? r.languages : [r.cvLanguage]).filter(Boolean).join(', '))}</td>
      <td>${r.years || ''}</td>
      <td class="skills">${esc(r.skills.slice(0, 12).join(', '))}${r.skills.length > 12 ? ' …' : ''}</td>
      <td>${esc(r.education)}</td>
      <td><span class="ai ${r.aiRes.level}" title="Written by AI?\n${esc(r.aiRes.reasons.join('\n') || 'No signals')}">${r.aiRes.score}</span></td>
      <td><span class="ai ${r.tailRes.level}" title="Sent or tailored by a tool?\n${esc(r.tailRes.reasons.join('\n') || 'No signals')}">${r.tailRes.score}</span></td>
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
    <div class="verdicts">
      <section><h3>🤖 Written by AI? <span class="ai ${r.aiRes.level}">${r.aiRes.score}</span></h3>
        <ul>${r.aiRes.reasons.map(x => `<li>${esc(x)}</li>`).join('') || '<li>No signals found.</li>'}</ul></section>
      <section><h3>📨 Sent or tailored by a tool? <span class="ai ${r.tailRes.level}">${r.tailRes.score}</span></h3>
        <ul>${r.tailRes.reasons.map(x => `<li>${esc(x)}</li>`).join('') || '<li>No signals found.</li>'}</ul>
        ${vacancies[r.tag] ? '' : `<p class="note">Tip: add the vacancy text for “${esc(r.tag || 'this vacancy')}” (📄 Vacancy text, at the top) to also check whether this CV copies the job ad.</p>`}</section>
    </div>
    <p class="note">Both are indications, not proof. Use them to prioritise, never to reject on their own – a candidate may tailor their own CV to your vacancy, which is a good thing.</p>
    <dl>${dl.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    ${query.active ? `<p><strong>Matches your search:</strong> ${esc(query.matched(r).map(plainLabel).join(', ') || 'none')}</p>` : ''}
    <h3>Text</h3><pre>${highlight(esc(r.text), query.terms, r)}</pre>`}
    <button class="danger" id="delOne">Delete this candidate</button>`;
  $('#delOne').onclick = async () => { await db.remove(id); $('#drawer').hidden = true; refresh(); };
  $('#drawer').hidden = false;
}

function exportCsv() {
  const cols = ['name', 'email', 'phone', 'linkedin', 'location', 'languages', 'cvLanguage', 'years', 'education', 'skills', 'ai', 'aiReasons', 'tool', 'toolReasons', 'tag', 'fileName', 'addedAt'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = filtered().map(r => cols.map(c => cell(
    c === 'ai' ? r.aiRes?.score : c === 'aiReasons' ? r.aiRes?.reasons.join(' | ') :
    c === 'tool' ? r.tailRes?.score : c === 'toolReasons' ? r.tailRes?.reasons.join(' | ') :
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
$('#reset').onclick = () => {
  words = emptyWords();
  document.querySelectorAll('#finder input').forEach(i => i.value = '');
  document.querySelectorAll('#finder select').forEach(s => s.selectedIndex = 0);
  render();
};
$('#advanced').oninput = render;

// ---------- plain-word boxes ----------
// words = { all: [term], groups: [[term], …], none: [term] }, term = { text, mode, field }
const emptyWords = () => ({ all: [], groups: [[]], none: [] });
const KIND_NAME = { all: 'Must have', none: 'Leave out' };
const kindName = k => KIND_NAME[k] || 'At least one of';
const MODE_TAG = { exact: 'exact', starts: 'starts with' };
const FIELD_TAG = { skill: 'in skills', loc: 'in location', edu: 'in education', lang: 'in languages', name: 'in name' };
const list = kind => kind.startsWith('g:') ? words.groups[+kind.slice(2)] : words[kind];
function normalise(w) {
  // saved searches from 0.3 stored plain strings and a single `any` list
  const t = x => typeof x === 'string' ? { text: x, mode: 'similar', field: 'any' } : x;
  return { all: (w?.all || []).map(t), groups: (w?.groups || [w?.any || []]).map(g => g.map(t)), none: (w?.none || []).map(t) };
}
function addWords(kind, raw) {
  const target = list(kind);
  const add = raw.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    .filter(w => !target.some(x => x.text.toLowerCase() === w.toLowerCase()))
    .map(text => ({ text, mode: 'similar', field: 'any' }));
  if (!add.length) return;
  target.push(...add);
  render();
}
function removeWord(kind, i) { list(kind).splice(i, 1); render(); }
const termText = t => `${t.mode === 'exact' ? '“' + t.text + '”' : t.text}${t.mode === 'starts' ? '…' : ''}${t.field !== 'any' ? ' ' + FIELD_TAG[t.field] : ''}`;
const joinOr = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' or ' + xs.at(-1);
function summary() {
  const parts = [];
  if (words.all.length) parts.push(`have ${words.all.map(termText).join(' and ')}`);
  for (const g of words.groups) if (g.length) parts.push(g.length > 1 ? `have at least one of ${joinOr(g.map(termText))}` : `have ${termText(g[0])}`);
  let s = parts.length ? 'Candidates who ' + parts.join(', and who ') : '';
  if (words.none.length) s += (s ? ', but ' : 'Candidates who ') + `don't mention ${joinOr(words.none.map(termText))}`;
  const extra = [];
  if ($('#floc').value.trim()) extra.push(`in ${$('#floc').value.trim()}`);
  if ($('#flang').value) extra.push(`who speak ${$('#flang').value}`);
  if ($('#fmin').value) extra.push(`with ${$('#fmin').value}+ years of experience`);
  extra.push({ hideAi: 'hiding likely AI-written CVs', hideTool: 'hiding CVs likely sent or tailored by a tool',
    hideBoth: 'hiding likely AI-written and tool-sent CVs', human: 'only CVs with no AI or tool signals' }[$('#fai').value] || '');
  if ($('#ftag').value) extra.push(`for ${$('#ftag').value}`);
  extra.splice(0, extra.length, ...extra.filter(Boolean));
  if (!s && !extra.length) return '';
  return (s || 'All candidates') + (extra.length ? ' · ' + extra.join(' · ') : '') + '.';
}
function ensureGroupFields() {
  const box = $('#groups');
  while (box.children.length > words.groups.length) box.lastElementChild.remove();
  while (box.children.length < words.groups.length) {
    const i = box.children.length;
    box.insertAdjacentHTML('beforeend', `<div class="group">${i ? '<span class="and">and also at least one of</span>' : ''}
      <div class="chipfield" data-kind="g:${i}"><span class="chips"></span><input placeholder="${i ? 'e.g. Dutch, Flemish' : 'e.g. SAP, Oracle'}" autocomplete="off" aria-label="At least one of"></div>
      ${i ? `<button type="button" class="link small del-group" data-g="${i}">remove this list</button>` : ''}</div>`);
  }
}
// Words to suggest from: known skills first (ties go to the earlier word), then the CVs' own words by frequency.
let vocabCacheKey = null, vocabCacheVal = [];
function vocabulary() {
  if (vocabCacheKey === rows) return vocabCacheVal;
  const freq = {};
  for (const r of rows) for (const w of new Set((r.text || '').toLowerCase().match(/[\p{L}]{3,}/gu) || [])) freq[w] = (freq[w] || 0) + 1;
  const known = [...new Set([...extraSkills.map(s => s.toLowerCase()), ...SKILLS.filter(s => /^[\p{L}\p{N}]+$/u.test(s))])];
  vocabCacheKey = rows;
  return (vocabCacheVal = [...known, ...Object.keys(freq).sort((a, b) => freq[b] - freq[a])]);
}
function renderWords() {
  ensureGroupFields();
  const count = t => { const c = compile(termCode(t)); return rows.filter(r => !r.error && c.test(r)).length; };
  document.querySelectorAll('.chipfield').forEach(f => {
    const kind = f.dataset.kind, cls = kind.startsWith('g:') ? 'any' : kind;
    f.querySelector('.chips').innerHTML = list(kind).map((t, i) => {
      const badges = [MODE_TAG[t.mode], FIELD_TAG[t.field]].filter(Boolean).map(b => `<small class="badge">${b}</small>`).join('');
      const n = count(t);
      const alt = n === 0 && rows.length && /^[\p{L}\p{N}]+$/u.test(t.text) ? suggest(t.text, vocabulary()) : null;
      return `<span class="word ${cls}"><button type="button" class="wtext" data-edit="${kind}" data-i="${i}" title="Click for options: exact match, starts with, where to look">${esc(t.text)}${badges}<small class="cnt" title="CVs that contain this">${n}</small></button><button type="button" class="wdel" data-kind="${kind}" data-i="${i}" aria-label="Remove ${esc(t.text)}">×</button></span>` +
        (alt ? `<button type="button" class="dym" data-kind="${kind}" data-i="${i}" data-word="${esc(alt)}">Did you mean <b>${esc(alt)}</b>?</button>` : '');
    }).join('');
  });
  $('#summary').textContent = summary();
  const chosen = new Set([...words.all, ...words.groups.flat(), ...words.none].map(t => t.text.toLowerCase()));
  const counts = {};
  for (const r of rows) for (const s of r.skills || []) if (!chosen.has(s)) counts[s] = (counts[s] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('#suggest').innerHTML = top.length ? '<span class="suggest-label">Quick add:</span>' +
    top.map(([s, n]) => `<button type="button" class="sugg" data-word="${esc(s)}" title="Found in ${n} CV(s) – click to add to Must have">+ ${esc(s)}</button>`).join('') : '';
}
function renderResultLine(list) {
  const el = $('#resultLine');
  if (!rows.length) { el.innerHTML = ''; $('#tbl').hidden = false; return; }
  $('#tbl').hidden = !list.length;
  if (list.length) { el.innerHTML = `Showing <strong>${list.length}</strong> of ${rows.length} candidates`; el.className = ''; return; }
  const kinds = [['all', words.all], ...words.groups.map((g, i) => [`g:${i}`, g]), ['none', words.none]];
  const all = kinds.flatMap(([k, ws]) => ws.map((t, i) => [k, t, i]));
  el.className = 'none-found';
  el.innerHTML = 'No candidates match all of this. ' + (all.length
    ? 'Try removing a word: ' + all.map(([k, t, i]) => `<button type="button" class="word ${k.startsWith('g:') ? 'any' : k} wdel" data-kind="${k}" data-i="${i}" title="Remove from ${kindName(k)}">${esc(t.text)} ×</button>`).join(' ') +
      ' <span class="note">Or loosen Where, Speaks, Experience or AI above.</span>'
    : 'Try changing the choices above, or press <strong>Start over</strong>.');
}

// typing: delegated, because the "at least one of" lists come and go
const fieldOf = el => el.closest?.('.chipfield');
document.addEventListener('keydown', e => {
  const f = fieldOf(e.target); if (!f || e.target.tagName !== 'INPUT') return;
  const input = e.target, kind = f.dataset.kind;
  if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) { e.preventDefault(); addWords(kind, input.value); input.value = ''; }
  else if (e.key === 'Backspace' && !input.value && list(kind).length) removeWord(kind, list(kind).length - 1);
});
// typing a word and clicking elsewhere still counts – people don't always press Enter
document.addEventListener('focusout', e => {
  const f = fieldOf(e.target);
  if (f && e.target.tagName === 'INPUT' && e.target.value.trim()) { addWords(f.dataset.kind, e.target.value); e.target.value = ''; }
});
$('#addGroup').onclick = () => {
  words.groups.push([]); render();
  $(`.chipfield[data-kind="g:${words.groups.length - 1}"] input`).focus();
};

// the word editor
let editing = null;
function openEditor(kind, i, anchor) {
  editing = { kind, i };
  const t = list(kind)[i], ed = $('#tagEditor');
  ed.querySelector('.te-title').textContent = `Options for “${t.text}”`;
  const single = /^[\p{L}\p{N}]+$/u.test(t.text);
  ed.querySelector('.te-starts').hidden = !single;
  ed.querySelector(`input[value="${single || t.mode === 'exact' ? t.mode : 'exact'}"]`).checked = true;
  $('#te-field').value = t.field;
  ed.querySelectorAll('[data-move]').forEach(b => b.classList.toggle('current', b.dataset.move === (kind.startsWith('g:') ? 'g:0' : kind)));
  ed.hidden = false;
  const r = anchor.getBoundingClientRect();
  ed.style.top = `${scrollY + r.bottom + 6}px`;
  ed.style.left = `${Math.max(8, Math.min(scrollX + r.left, scrollX + innerWidth - ed.offsetWidth - 8))}px`;
}
const closeEditor = () => { $('#tagEditor').hidden = true; editing = null; };
$('#tagEditor').addEventListener('change', e => {
  if (!editing) return;
  const t = list(editing.kind)[editing.i];
  if (e.target.name === 'te-mode') t.mode = e.target.value;
  if (e.target.id === 'te-field') t.field = e.target.value;
  render();
});
$('#tagEditor').addEventListener('click', e => {
  if (!editing) return;
  const mv = e.target.closest('[data-move]');
  if (mv && mv.dataset.move !== editing.kind) {
    const [t] = list(editing.kind).splice(editing.i, 1);
    list(mv.dataset.move).push(t);
    closeEditor(); render();
  }
});
$('#te-done').onclick = closeEditor;
$('#te-delete').onclick = () => { if (editing) removeWord(editing.kind, editing.i); closeEditor(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeEditor(); });

document.addEventListener('click', e => {
  const edit = e.target.closest('.wtext');
  if (edit) { openEditor(edit.dataset.edit, +edit.dataset.i, edit); return; }
  if (!e.target.closest('#tagEditor')) closeEditor();
  const del = e.target.closest('.wdel');
  if (del) { removeWord(del.dataset.kind, +del.dataset.i); return; }
  const g = e.target.closest('.del-group');
  if (g) { words.groups.splice(+g.dataset.g, 1); render(); return; }
  const s = e.target.closest('.sugg');
  if (s) { addWords('all', s.dataset.word); return; }
  const dym = e.target.closest('.dym');
  if (dym) { list(dym.dataset.kind)[+dym.dataset.i].text = dym.dataset.word; render(); }
});
$('#advToggle').onclick = () => {
  const adv = $('#advanced');
  adv.hidden = !adv.hidden;
  $('#advToggle').textContent = adv.hidden ? 'Advanced search ▸' : 'Advanced search ▾';
};
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

// ---------- saved searches ----------
const FILTER_IDS = ['fq', 'floc', 'flang', 'fmin', 'fmax', 'fai', 'ftag'];
function renderSaved() {
  $('#savedWrap').hidden = !saved.length;
  $('#saved').innerHTML = saved.map((s, i) =>
    `<span class="chip"><button class="chip-apply" data-i="${i}" title="${esc(describe(s))}">${esc(s.name)}</button><button class="chip-del" data-i="${i}" aria-label="Delete ${esc(s.name)}">×</button></span>`).join('');
}
function describe(s) {
  const w = normalise(s.words);
  const t = xs => xs.map(termText).join(', ');
  return [w.all.length && 'Must have: ' + t(w.all), ...w.groups.filter(g => g.length).map(g => 'At least one of: ' + t(g)),
    w.none.length && 'Leave out: ' + t(w.none), s.state.fq].filter(Boolean).join(' · ') || 'Filters only';
}
$('#saveSearch').onclick = async () => {
  const name = prompt('Give this search a name, so you can use it again with one click.\n(For example: "Nurses Utrecht")');
  if (!name?.trim()) return;
  const state = Object.fromEntries(FILTER_IDS.map(id => [id, $('#' + id).value]));
  saved = [...saved.filter(s => s.name !== name.trim()), { name: name.trim(), state, words: structuredClone(words) }];
  await store('savedSearches', saved);
  renderSaved();
};
$('#saved').onclick = async e => {
  const i = +e.target.dataset.i;
  if (e.target.classList.contains('chip-del')) { saved.splice(i, 1); await store('savedSearches', saved); renderSaved(); return; }
  if (!e.target.classList.contains('chip-apply')) return;
  for (const [id, v] of Object.entries(saved[i].state)) { const el = $('#' + id); if (el) el.value = v; }
  words = normalise(structuredClone(saved[i].words));
  if (saved[i].state.fq || saved[i].state.fmax) { $('#advanced').hidden = false; $('#advToggle').textContent = 'Advanced search ▾'; }
  render();
};
$('#qhelpBtn').onclick = () => { $('#qhelp').hidden = !$('#qhelp').hidden; };
$('#qhelp').onclick = e => { const ex = e.target.closest('code'); if (ex) { $('#fq').value = ex.textContent; render(); } };

// ---------- vacancy text (for the "copies the job ad" signal) ----------
$('#vacBtn').onclick = () => {
  const tags = [...new Set(rows.map(r => r.tag).filter(Boolean))];
  $('#vacTags').innerHTML = tags.map(t => `<option value="${esc(t)}">`).join('');
  $('#vacTag').value = $('#tagInput').value.trim() || $('#ftag').value || tags[0] || '';
  $('#vacText').value = vacancies[$('#vacTag').value] || '';
  $('#vacDialog').showModal();
};
$('#vacTag').oninput = () => { $('#vacText').value = vacancies[$('#vacTag').value.trim()] || ''; };
$('#vacSave').onclick = async () => {
  const tag = $('#vacTag').value.trim();
  if (!tag) return;
  if ($('#vacText').value.trim()) vacancies[tag] = $('#vacText').value; else delete vacancies[tag];
  await store('vacancies', vacancies);
  refresh();
};

(async () => {
  extraSkills = await load('extraSkills', []);
  vacancies = await load('vacancies', {});
  saved = await load('savedSearches', []);
  renderSaved();
  await refresh();
  await drainInbox();
})().catch(e => report(e, { step: 'init' }));
