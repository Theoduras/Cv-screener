import * as db from './lib/db.js';
import { load, store, isExtension, onInbox, onFocusRequest } from './lib/platform.js';
import { extract, fileKind, ExtractError } from './lib/extract.js';
import { parseCV } from './lib/parse.js';
import { aiScore, textHash, level, AI_VERSION } from './lib/aiscore.js';
import { tailorScore, shingleSet, overlap } from './lib/tailor.js';
import { docKind, linkLetters } from './lib/doctype.js';
import { report, installGlobalHandlers, sizeBucket } from './lib/report.js';
import { compile, highlight, fromWords, plainLabel, termCode, suggest } from './lib/query.js';
import { SKILLS } from './lib/dict.js';
import { initVacancies, drainJobInbox, onShow as showVacancies, renderJobs, savedJobs, jobById } from './vacancies.js';

installGlobalHandlers();
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let selected = new Set(), lastSel = null, shownIds = [], lists = [];
let rows = [], extraSkills = [], sortKey = 'addedAt', sortAsc = false, query = compile(''), saved = [], vacancies = {}, words = { all: [], groups: [[]], none: [] };

const uid = () => crypto.randomUUID();

function analyse(rec) {
  const parsed = parseCV(rec.text, { extraSkills });
  const kind = rec.kindManual || docKind(rec.text, rec.fileName);
  const baseAi = aiScore(rec.text, { producer: rec.producer, kind, location: parsed.location, years: parsed.years });
  return { ...rec, ...parsed, kind, hash: textHash(rec.text), baseAi, aiVersion: AI_VERSION };
}

// The "sent/tailored by a tool" score depends on the whole set (duplicates, the same person
// across vacancies) and on the vacancy text, so it is worked out at render time.
const holder = r => (r.email || r.name || '').toLowerCase().trim();
// Letters that say nearly the same thing: compare only pairs that share one of each letter's 8
// "smallest" phrases (a cheap MinHash), so a thousand letters is not half a million comparisons.
function letterSimilarity(letters, holderOf) {
  const sets = new Map(letters.map(l => [l.id, shingleSet(l.text)]));
  const buckets = new Map();
  for (const l of letters) for (const k of [...sets.get(l.id)].sort().slice(0, 8)) (buckets.get(k) || buckets.set(k, []).get(k)).push(l);
  const out = Object.fromEntries(letters.map(l => [l.id, { others: new Set(), tags: new Set() }]));
  const seen = new Set();
  for (const group of buckets.values()) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    const a = group[i], b = group[j], key = a.id < b.id ? a.id + b.id : b.id + a.id;
    if (seen.has(key)) continue; seen.add(key);
    if (overlap(sets.get(a.id), sets.get(b.id)) < 0.8) continue;
    const ha = holderOf(a), hb = holderOf(b);
    if (ha && ha === hb) {
      if (a.tag !== b.tag && a.hash !== b.hash) { out[a.id].tags.add(b.tag); out[b.id].tags.add(a.tag); }
    } else { out[a.id].others.add(b.id); out[b.id].others.add(a.id); }
  }
  return out;
}
// A hyper-polished letter on a plain, functional CV: the letter was likely written for them.
function polishGap(letter, cv) {
  const cvWording = cv.aiRes?.wording || 0;
  if (cvWording >= 1 || (letter.aiRes?.wording || 0) - cvWording < 2.5) return letter;
  const score = Math.min(100, letter.aiRes.score + 10);
  return { ...letter, aiRes: { ...letter.aiRes, score, level: level(score), reasons: [...letter.aiRes.reasons, 'The letter reads far more polished than the CV (+10)'] } };
}

const worse = (a, b) => b && b.score > a.score ? b : a;

function withDupes(list) {
  const ok = list.filter(r => !r.error);
  const byId = Object.fromEntries(list.map(r => [r.id, r]));
  const links = linkLetters(ok);
  const lettersOf = {};
  for (const [lid, cid] of Object.entries(links)) (lettersOf[cid] ||= []).push(byId[lid]);
  const holderOf = d => holder(d) || (links[d.id] ? holder(byId[links[d.id]]) : '');
  const counts = {}, byHolder = {};
  for (const r of ok) {
    if (r.kind === 'letter') continue;
    if (r.hash) counts[r.hash] = (counts[r.hash] || 0) + 1;
    const h = holder(r);
    if (h) (byHolder[h] ||= []).push(r);
  }
  const sim = letterSimilarity(ok.filter(r => r.kind === 'letter'), holderOf);
  const score = d => {
    const opts = { vacancyText: vacancies[d.tag] || '', tag: d.tag };
    if (d.kind === 'letter') Object.assign(opts, { similarLetters: sim[d.id].others.size, sameLetterVacancies: sim[d.id].tags.size });
    else {
      // other vacancies this person applied to with a differently worded CV
      const others = new Set((byHolder[holder(d)] || []).filter(o => o.tag !== d.tag && o.hash !== d.hash).map(o => o.tag));
      Object.assign(opts, { duplicates: (counts[d.hash] || 1) - 1, sameHolder: others.size });
    }
    return { ...d, aiRes: d.baseAi, tailRes: tailorScore(d, opts) };
  };
  const out = [];
  for (const r of list) {
    if (r.error) { out.push({ ...r, aiRes: null, tailRes: null, letters: [] }); continue; }
    if (r.kind === 'letter' && links[r.id]) continue; // shown with its CV
    const doc = score(r);
    if (r.kind === 'letter') { out.push({ ...doc, letterOnly: true, letters: [], letterText: r.text }); continue; }
    const letters = (lettersOf[r.id] || []).map(l => polishGap(score(l), doc));
    // the table shows the worse of CV and letter, and says which one it was
    const ai = letters.reduce((m, l) => worse(m, { ...l.aiRes, from: 'cover letter' }), { ...doc.aiRes, from: 'CV' });
    const tool = letters.reduce((m, l) => worse(m, { ...l.tailRes, from: 'cover letter' }), { ...doc.tailRes, from: 'CV' });
    out.push({ ...doc, letters, letterText: letters.map(l => l.text).join('\n\n'), cvAi: doc.aiRes, cvTool: doc.tailRes, aiRes: ai, tailRes: tool });
  }
  return out;
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
  if (await drainJobInbox()) showTab('vacs');
  const inbox = await load('inbox', []);
  if (!inbox.length) return;
  await store('inbox', []);
  const out = [];
  for (const cap of inbox) {
    const extra = { source: 'ATS page', tag: cap.title, pageUrl: cap.url, captureId: `${cap.at}|${cap.url}` };
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
  ai: $('#fai').value, tag: $('#ftag').value, letter: $('#fletter').value, list: $('#flist').value,
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
    if (f.list && !lists.find(l => l.id === f.list)?.members.includes(r.id)) return false;
    const hasLetter = r.letterOnly || r.letters?.length > 0;
    if (f.letter === 'has' && !hasLetter) return false;
    if (f.letter === 'missing' && hasLetter) return false;
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
  const matchedCell = r => q ? `<td class="matched" data-label="Matched">${query.matched(r).map(l => `<span class="hit">${esc(plainLabel(l))} ✓</span>`).join(' ')}</td>` : '';
  $('#empty').hidden = rows.length > 0;
  shownIds = list.map(r => r.id);
  const sel = r => `<td class="sel"><input type="checkbox" class="rowsel" data-id="${r.id}"${selected.has(r.id) ? ' checked' : ''} aria-label="Select ${esc(r.name || r.fileName)}"></td>`;
  const onLists = r => listsOf(r.id).map(l => ` <span class="list-tag" title="On the list ${esc(l.name)}">📋 ${esc(l.name)}</span>`).join('');
  $('#tbl tbody').innerHTML = list.map(r => r.error ? `
    <tr class="err" data-id="${r.id}">${sel(r)}<td>${esc(r.name || r.fileName)}</td><td colspan="${q ? 6 : 5}">⚠ ${esc(r.error)}</td><td></td><td></td><td>${esc(r.tag)}</td><td>${new Date(r.addedAt).toLocaleDateString('en-GB')}</td></tr>` : `
    <tr data-id="${r.id}"${selected.has(r.id) ? ' class="is-sel"' : ''}>${sel(r)}
      <td>${esc(r.name || '(unknown)')}${r.letters.length ? ' <span class="doc-mark" title="Has a cover letter">📝</span>' : ''}${r.letterOnly ? ' <span class="doc-only">cover letter only</span>' : ''}${onLists(r)}<div class="note">${esc(r.email)}</div></td>
      ${matchedCell(r)}
      <td data-label="Location">${esc(r.location)}</td>
      <td data-label="Languages">${esc((r.languages.length ? r.languages : [r.cvLanguage]).filter(Boolean).join(', '))}</td>
      <td data-label="Years">${r.years || ''}</td>
      <td class="skills" data-label="Skills">${esc(r.skills.slice(0, 12).join(', '))}${r.skills.length > 12 ? ' …' : ''}</td>
      <td data-label="Education">${esc(r.education)}</td>
      <td class="score" data-label="🤖 AI"><span class="ai ${r.aiRes.level}" title="Written by AI?${r.letters.length ? ` (worst: ${r.aiRes.from})` : ''}\n${esc(r.aiRes.reasons.join('\n') || 'No signals')}">${r.aiRes.score}</span></td>
      <td class="score" data-label="📨 Tool"><span class="ai ${r.tailRes.level}" title="Sent or tailored by a tool?${r.letters.length ? ` (worst: ${r.tailRes.from})` : ''}\n${esc(r.tailRes.reasons.join('\n') || 'No signals')}">${r.tailRes.score}</span></td>
      <td data-label="Vacancy">${esc(r.tag)}</td>
      <td data-label="Added">${new Date(r.addedAt).toLocaleDateString('en-GB')}</td>
    </tr>`).join('');
  document.querySelectorAll('th').forEach(th => {
    th.classList.toggle('sorted', th.dataset.k === sortKey);
    th.classList.toggle('asc', th.dataset.k === sortKey && sortAsc);
  });
  renderSelection();
}

function fillSelect(sel, values, first) {
  const cur = sel.value;
  sel.innerHTML = `<option value="">${first}</option>` + values.map(v => `<option>${esc(v)}</option>`).join('');
  sel.value = values.includes(cur) ? cur : '';
}

async function refresh() {
  rows = withDupes(await db.all());
  await pruneLists();
  fillSelect($('#flang'), [...new Set(rows.flatMap(r => [...(r.languages || []), r.cvLanguage]).filter(Boolean))].sort(), 'Any language');
  fillSelect($('#ftag'), [...new Set(rows.map(r => r.tag).filter(Boolean))].sort(), 'All vacancies');
  renderLists();
  render();
}

// The two checks, per document when there is a CV and a letter.
function verdicts(docs) {
  const block = (title, pick) => `<section><h3>${title} ${docs.map(d => `<span class="ai ${pick(d.doc).level}" title="${d.label}">${docs.length > 1 ? d.label + ' ' : ''}${pick(d.doc).score}</span>`).join(' ')}</h3>
    ${docs.map(d => `${docs.length > 1 ? `<h4>${d.label}</h4>` : ''}<ul>${pick(d.doc).reasons.map(x => `<li>${esc(x)}</li>`).join('') || '<li>No signals found.</li>'}</ul>`).join('')}</section>`;
  const tag = docs[0].doc.tag;
  return `<div class="verdicts">${block('🤖 Written by AI?', d => d.aiRes)}${block('📨 Sent or tailored by a tool?', d => d.tailRes)}
    ${vacancies[tag] ? '' : `<p class="note">Tip: add the vacancy text for “${esc(tag || 'this vacancy')}” (📄 Vacancy text, at the top) to also check whether the CV or letter copies the job ad, or names another job.</p>`}</div>`;
}

function openDrawer(id) {
  const r = rows.find(x => x.id === id);
  if (!r) return;
  // a letter shown on its own carries its own scores; a CV row carries the worse of CV and letter, so use the CV's own
  const docs = r.error ? [] : r.letterOnly ? [{ label: 'Cover letter', kind: 'letter', doc: r }]
    : [{ label: 'CV', kind: 'cv', doc: { ...r, aiRes: r.cvAi, tailRes: r.cvTool } },
       ...r.letters.map((l, i) => ({ label: r.letters.length > 1 ? `Cover letter ${i + 1}` : 'Cover letter', kind: 'letter', doc: l }))];
  const dl = [['Name', r.name], ['Email', r.email], ['Phone', r.phone], ['LinkedIn', r.linkedin], ['Location', r.location],
    ['Languages', (r.languages || []).join(', ')], ['CV written in', r.cvLanguage], ['Years of experience', r.years], ['Education', r.education],
    ['Skills', (r.skills || []).join(', ')], ['Vacancy', r.tag], ['Source', `${r.source || ''} – ${r.fileName || ''}`], ['PDF made with', r.producer]];
  $('#drawerBody').innerHTML = `
    <h2>${esc(r.name || r.fileName)}</h2>
    ${r.error ? `<p>⚠ ${esc(r.error)}</p>` : `
    ${verdicts(docs)}
    <p class="note">These are indications, not proof. Use them to prioritise, never to reject on their own – a candidate may tailor their own CV or letter to your vacancy, which is a good thing.</p>
    <dl>${dl.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <p class="on-lists">📋 ${listsOf(r.id).length ? 'On ' + listsOf(r.id).map(l => `<b>${esc(l.name)}</b>`).join(', ') : 'Not on a list yet'} · <button type="button" class="link small" id="drawerList">Add to a list</button> · <button type="button" class="link small" id="drawerVac">Add to a vacancy</button></p>
    ${query.active ? `<p><strong>Matches your search:</strong> ${esc(query.matched(r).map(plainLabel).join(', ') || 'none')}</p>` : ''}
    <div class="doc-tabs" role="tablist">${docs.map((d, i) => `<button type="button" role="tab" class="doc-tab${i === 0 ? ' on' : ''}" data-doc="${i}">${d.label}</button>`).join('')}</div>
    ${docs.map((d, i) => `<div class="doc-pane" data-doc="${i}"${i ? ' hidden' : ''}>
      <p class="note">${esc(d.doc.fileName || '')} · <button type="button" class="link small kind-flip" data-id="${d.doc.id}" data-kind="${d.kind === 'letter' ? 'cv' : 'letter'}">${d.kind === 'letter' ? 'This is a CV, not a cover letter' : 'This is a cover letter, not a CV'}</button></p>
      <pre>${highlight(esc(d.doc.text), query.terms, { ...r, text: d.doc.text, letterText: '' })}</pre></div>`).join('')}`}
    <button class="danger" id="delOne">Delete this candidate${r.letters?.length ? ' and their cover letter' : ''}</button>`;
  $('#drawerList')?.addEventListener('click', () => openAdd('list', [r.id]));
  $('#drawerVac')?.addEventListener('click', () => openAdd('vacancy', [r.id]));
  $('#delOne').onclick = async () => { for (const d of [r, ...(r.letters || [])]) await db.remove(d.id); $('#drawer').hidden = true; refresh(); };
  $('#drawerBody').querySelectorAll('.doc-tab').forEach(t => t.onclick = () => {
    $('#drawerBody').querySelectorAll('.doc-tab').forEach(x => x.classList.toggle('on', x === t));
    $('#drawerBody').querySelectorAll('.doc-pane').forEach(p => { p.hidden = p.dataset.doc !== t.dataset.doc; });
  });
  $('#drawerBody').querySelectorAll('.kind-flip').forEach(b => b.onclick = async () => {
    const rec = (await db.all()).find(x => x.id === b.dataset.id);
    if (!rec) return;
    await db.put({ ...rec, kind: b.dataset.kind, kindManual: b.dataset.kind });
    $('#drawer').hidden = true;
    await refresh();
  });
  $('#drawerBody').dataset.id = id;
  $('#drawer').hidden = false;
}

function exportCsv(list = filtered()) {
  const cols = ['name', 'email', 'phone', 'linkedin', 'location', 'languages', 'cvLanguage', 'years', 'education', 'skills', 'ai', 'aiReasons', 'tool', 'toolReasons', 'has_cover_letter', 'letter_ai', 'letter_tool', 'tag', 'lists', 'fileName', 'addedAt'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = list.map(r => cols.map(c => cell(
    c === 'lists' ? listsOf(r.id).map(l => l.name).join(' | ') :
    c === 'ai' ? r.aiRes?.score : c === 'aiReasons' ? r.aiRes?.reasons.join(' | ') :
    c === 'tool' ? r.tailRes?.score : c === 'toolReasons' ? r.tailRes?.reasons.join(' | ') :
    c === 'has_cover_letter' ? (r.letterOnly || r.letters?.length ? 'yes' : 'no') :
    c === 'letter_ai' ? (r.letterOnly ? r.aiRes?.score : r.letters?.[0]?.aiRes.score) : c === 'letter_tool' ? (r.letterOnly ? r.tailRes?.score : r.letters?.[0]?.tailRes.score) :
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
const FIELD_TAG = { skill: 'in skills', loc: 'in location', edu: 'in education', lang: 'in languages', name: 'in name', cv: 'in CV', letter: 'in cover letter' };
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
  if ($('#fletter').value) extra.push($('#fletter').value === 'has' ? 'with a cover letter' : 'without a cover letter');
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
// Esc closes the innermost thing: the word editor, then a dialog (which does that itself), then the candidate panel.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#tagEditor').hidden) return closeEditor();
  if (document.querySelector('dialog[open]')) return;
  if (!$('#drawer').hidden) closeDrawer();
});

document.addEventListener('click', e => {
  const edit = e.target.closest('.wtext');
  if (edit) { openEditor(edit.dataset.edit, +edit.dataset.i, edit); return; }
  if (!e.target.closest('#tagEditor')) closeEditor();
  const del = e.target.closest('.wdel');
  if (del) { removeWord(del.dataset.kind, +del.dataset.i); return; }
  const g = e.target.closest('.del-group');
  if (g) { words.groups.splice(+g.dataset.g, 1); render(); return; }
  const s = e.target.closest('.sugg[data-word]');
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
$('#tbl tbody').onclick = e => {
  const cell = e.target.closest('td.sel');
  if (cell) { const cb = cell.querySelector('input'); if (e.target !== cb) cb.checked = !cb.checked; select(cb.dataset.id, cb.checked, e.shiftKey); return; }
  const tr = e.target.closest('tr'); if (tr) openDrawer(tr.dataset.id);
};
const closeDrawer = () => { $('#drawer').hidden = true; };
$('#closeDrawer').onclick = closeDrawer;
$('#exportBtn').onclick = () => exportCsv();
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
onFocusRequest();
onInbox(drainInbox);

// ---------- selecting candidates, and lists ----------
// A list is a named group of candidates, optionally put on a vacancy (a req tag, or an ad from "Find vacancies").
const listsOf = id => lists.filter(l => l.members.includes(id));
const vacLabel = key => key?.startsWith('job:') ? (j => j ? `${j.title}${j.company ? ' – ' + j.company : ''}` : 'a saved vacancy')(jobById(key.slice(4))) : key?.slice(4) || '';
const saveLists = () => store('lists', lists);

function select(id, on, range) {
  const ids = range && lastSel && shownIds.includes(lastSel) ? shownIds.slice(Math.min(shownIds.indexOf(lastSel), shownIds.indexOf(id)), Math.max(shownIds.indexOf(lastSel), shownIds.indexOf(id)) + 1) : [id];
  for (const x of ids) on ? selected.add(x) : selected.delete(x);
  lastSel = id;
  renderSelection();
}
function renderSelection() {
  document.querySelectorAll('.rowsel').forEach(cb => { cb.checked = selected.has(cb.dataset.id); cb.closest('tr').classList.toggle('is-sel', cb.checked); });
  const shownSel = shownIds.filter(id => selected.has(id)).length;
  $('#selAll').checked = shownIds.length > 0 && shownSel === shownIds.length;
  $('#selAll').indeterminate = shownSel > 0 && shownSel < shownIds.length;
  $('#selAllM').checked = $('#selAll').checked; $('#selAllM').indeterminate = $('#selAll').indeterminate;
  $('#selBar').hidden = !selected.size;
  $('#selCount').innerHTML = `<b>${selected.size}</b> selected${selected.size > shownSel ? ` <span class="note">(${selected.size - shownSel} not in this view)</span>` : ''}`;
}
$('#selAll').onclick = e => { e.stopPropagation(); for (const id of shownIds) e.target.checked ? selected.add(id) : selected.delete(id); renderSelection(); };
$('#selAllM').onchange = e => { for (const id of shownIds) e.target.checked ? selected.add(id) : selected.delete(id); renderSelection(); };
// phones have no column headers to click: the same sorting as a dropdown
$('#sortM').onchange = e => { const [k, dir] = e.target.value.split(':'); sortKey = k; sortAsc = dir === 'asc'; render(); };
$('#selClear').onclick = () => { selected.clear(); renderSelection(); };
$('#selExport').onclick = () => exportCsv(rows.filter(r => selected.has(r.id)));
$('#selList').onclick = () => openAdd('list', [...selected]);
$('#selVac').onclick = () => openAdd('vacancy', [...selected]);

function renderLists() {
  $('#listsWrap').hidden = !lists.length;
  $('#lists').innerHTML = lists.map(l => `<span class="chip list-chip"><button class="list-apply" data-id="${l.id}" title="Show only this list">📋 ${esc(l.name)} <span class="cnt">${l.members.length}</span></button><button class="list-del" data-id="${l.id}" aria-label="Delete the list ${esc(l.name)}">×</button></span>`).join('');
  const cur = $('#flist').value;
  $('#flist').innerHTML = '<option value="">All candidates</option>' + lists.map(l => `<option value="${l.id}">${esc(l.name)} (${l.members.length})</option>`).join('');
  $('#flist').value = lists.some(l => l.id === cur) ? cur : '';
  renderJobs();
}
$('#lists').onclick = async e => {
  const del = e.target.closest('.list-del'), app = e.target.closest('.list-apply');
  if (del) {
    const l = lists.find(x => x.id === del.dataset.id);
    if (!confirm(`Delete the list "${l.name}"? The candidates themselves stay.`)) return;
    lists = lists.filter(x => x !== l); await saveLists(); renderLists(); render(); return;
  }
  if (app) { $('#flist').value = $('#flist').value === app.dataset.id ? '' : app.dataset.id; render(); }
};
// candidates deleted since: drop them from every list
async function pruneLists() {
  const ids = new Set(rows.map(r => r.id));
  let changed = false;
  for (const l of lists) { const keep = l.members.filter(id => ids.has(id)); if (keep.length !== l.members.length) { l.members = keep; changed = true; } }
  for (const id of selected) if (!ids.has(id)) selected.delete(id);
  if (changed) await saveLists();
}

let adding = null;
function openAdd(mode, ids) {
  if (!ids.length) return;
  adding = { mode, ids };
  const n = ids.length, who = n === 1 ? (rows.find(r => r.id === ids[0])?.name || '1 candidate') : `${n} candidates`;
  $('#addTitle').textContent = mode === 'list' ? `Add ${who} to a list` : `Add ${who} to a vacancy`;
  $('#addList').innerHTML = lists.map(l => `<option value="${l.id}">${esc(l.name)} (${l.members.length})</option>`).join('') + '<option value="__new">＋ New list…</option>';
  $('#addList').value = lists.length ? lists[lists.length - 1].id : '__new';
  const tags = [...new Set([...rows.map(r => r.tag), ...Object.keys(vacancies)].filter(Boolean))].sort();
  const ads = savedJobs().slice(0, 300);
  $('#addVac').innerHTML = (mode === 'list' ? '<option value="">— not on a vacancy —</option>' : '') +
    (tags.length ? `<optgroup label="Your vacancies / reqs">${tags.map(t => `<option value="tag:${esc(t)}">${esc(t)}</option>`).join('')}</optgroup>` : '') +
    (ads.length ? `<optgroup label="Found vacancies">${ads.map(j => `<option value="job:${j.id}">${esc(j.title)}${j.company ? ' – ' + esc(j.company) : ''}</option>`).join('')}</optgroup>` : '') +
    '<option value="__new">＋ New vacancy / req…</option>';
  const fromTag = $('#ftag').value || $('#tagInput').value.trim();
  $('#addVac').value = mode === 'vacancy' ? (fromTag && tags.includes(fromTag) ? 'tag:' + fromTag : tags.length || ads.length ? $('#addVac').options[0].value : '__new') : '';
  $('#addName').value = ''; $('#addVacName').value = '';
  syncAdd();
  $('#addDialog').showModal();
}
function syncAdd() {
  const list = adding?.mode === 'list';
  $('#addListWrap').hidden = !list;
  $('#addNameWrap').hidden = !list || $('#addList').value !== '__new';
  $('#addVacLabel').textContent = list ? 'Put this list on a vacancy (optional)' : 'Vacancy';
  $('#addVacNameWrap').hidden = $('#addVac').value !== '__new';
}
$('#addList').onchange = syncAdd;
$('#addVac').onchange = syncAdd;
$('#addDialog').onclose = async () => {
  if ($('#addDialog').returnValue !== 'save' || !adding) return;
  let vac = $('#addVac').value;
  if (vac === '__new') vac = $('#addVacName').value.trim() ? 'tag:' + $('#addVacName').value.trim() : '';
  let list;
  if (adding.mode === 'list') {
    list = lists.find(l => l.id === $('#addList').value);
    if (!list) list = { id: uid(), name: $('#addName').value.trim() || `List ${lists.length + 1}`, members: [], created: Date.now() };
    if (vac) list.vacancy = vac;
  } else {
    if (!vac) return;
    list = lists.find(l => l.vacancy === vac && l.auto) || { id: uid(), name: `Shortlist – ${vacLabel(vac)}`.slice(0, 80), vacancy: vac, auto: true, members: [], created: Date.now() };
  }
  if (!lists.includes(list)) lists.push(list);
  const before = list.members.length;
  list.members = [...new Set([...list.members, ...adding.ids])];
  if (adding.ids.length > 1 || selected.has(adding.ids[0])) selected.clear();
  toast(`${list.members.length - before} added to “${list.name}”${list.vacancy ? ` (vacancy: ${vacLabel(list.vacancy)})` : ''}.`);
  adding = null;
  renderLists(); render();
  if (!$('#drawer').hidden) openDrawer($('#drawerBody').dataset.id);
  await saveLists();
};
function toast(msg) {
  const t = document.getElementById('toast') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toast', role: 'status' }));
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---------- tabs ----------
function showTab(name) {
  document.querySelectorAll('#tabs .tab').forEach(t => { t.classList.toggle('on', t.dataset.tab === name); t.setAttribute('aria-selected', t.dataset.tab === name); });
  $('#tab-cands').hidden = name !== 'cands';
  $('#tab-vacs').hidden = name !== 'vacs';
  closeDrawer();
  if (name === 'vacs') showVacancies();
}
$('#tabs').onclick = e => { const t = e.target.closest('.tab'); if (t) showTab(t.dataset.tab); };

// a found ad becomes the vacancy text for a req, which the 📨 copy check compares CVs against
function useAsVacancy(job) {
  if (!job) return;
  $('#vacTags').innerHTML = [...new Set([...rows.map(r => r.tag), ...Object.keys(vacancies)].filter(Boolean))].map(t => `<option value="${esc(t)}">`).join('');
  $('#vacTag').value = `${job.title}${job.company ? ' – ' + job.company : ''}`.slice(0, 80);
  $('#vacText').value = job.text || `${job.title}\n${job.company}\n${job.location}`;
  $('#vacDialog').showModal();
}

// ---------- saved searches ----------
const FILTER_IDS = ['fq', 'floc', 'flang', 'fmin', 'fmax', 'fai', 'ftag', 'flist'];
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
  lists = await load('lists', []);
  // the AI check improved since these were stored: score them again
  const stale = (await db.all()).filter(r => !r.error && r.aiVersion !== AI_VERSION);
  if (stale.length) await db.put(stale.map(analyse));
  renderSaved();
  await initVacancies({ useAsVacancy, listCount: id => new Set(lists.filter(l => l.vacancy === 'job:' + id).flatMap(l => l.members)).size });
  await refresh();
  if (isExtension) await drainInbox();
  else document.body.classList.add('is-web');
})().catch(e => report(e, { step: 'init' }));
