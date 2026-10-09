// File/bytes -> { text, producer }. Uses the vendored pdf.js (window.pdfjsLib) and mammoth (window.mammoth).

export class ExtractError extends Error {}

export function fileKind(name = '', mime = '') {
  const n = name.toLowerCase();
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (n.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  if (n.endsWith('.doc') || mime === 'application/msword') return 'doc';
  if (/\.(txt|md|rtf)$/.test(n) || mime.startsWith('text/plain')) return 'txt';
  if (/\.html?$/.test(n) || mime.startsWith('text/html')) return 'html';
  return 'unknown';
}

async function pdfText(buf) {
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.js');
  const pdf = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  let producer = '';
  try {
    const { info } = await pdf.getMetadata();
    producer = [info?.Producer, info?.Creator].filter(Boolean).join(' / ');
  } catch { /* metadata is optional */ }
  const pages = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 15); i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let out = '', lastY = null;
    for (const it of tc.items) {
      const y = it.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
      out += it.str + (it.hasEOL ? '\n' : '');
      if (y !== undefined) lastY = y;
    }
    pages.push(out);
  }
  await pdf.destroy();
  return { text: pages.join('\n'), producer };
}

export async function extract(buf, name, mime) {
  const kind = fileKind(name, mime);
  let res;
  if (kind === 'pdf') res = await pdfText(buf);
  else if (kind === 'docx') res = { text: (await window.mammoth.extractRawText({ arrayBuffer: buf })).value, producer: '' };
  else if (kind === 'txt') res = { text: new TextDecoder().decode(buf), producer: '' };
  else if (kind === 'html') {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(buf), 'text/html');
    res = { text: doc.body?.innerText || doc.body?.textContent || '', producer: '' };
  } else if (kind === 'doc') throw new ExtractError('Oud Word-formaat (.doc) wordt niet ondersteund – sla op als .docx of PDF.');
  else throw new ExtractError('Bestandstype niet ondersteund.');
  if (res.text.replace(/\s/g, '').length < 50)
    throw new ExtractError('Geen tekst gevonden – waarschijnlijk een gescande PDF of afbeelding.');
  return { ...res, kind };
}
