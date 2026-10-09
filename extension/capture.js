// Injected into the active ATS tab on demand (popup -> "Pak deze pagina").
// Returns the visible page text plus any CV attachments, fetched with the page's own session.
(async () => {
  const MAX = 8, MAX_BYTES = 20e6;
  const urls = new Set();
  const looksLikeCv = (href, label) =>
    /\.(pdf|docx?)(\?|#|$)/i.test(href) || /\b(cv|resume|curriculum|attachment|bijlage|document|download)\b/i.test(label + ' ' + href);
  for (const a of document.querySelectorAll('a[href]')) {
    if (looksLikeCv(a.href, a.textContent || '') && /^https?:/.test(a.href)) urls.add(a.href);
  }
  for (const el of document.querySelectorAll('iframe[src], embed[src], object[data]')) {
    const u = el.src || el.data;
    if (u && /^https?:/.test(u) && /\.(pdf|docx?)|pdf|document|attachment/i.test(u)) urls.add(u);
  }
  const files = [], errors = [];
  for (const url of [...urls].slice(0, MAX)) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const type = r.headers.get('content-type') || '';
      if (!/pdf|word|officedocument|octet-stream/i.test(type)) continue;
      const buf = await r.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) throw new Error('te groot');
      let bin = '';
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const cd = r.headers.get('content-disposition') || '';
      const name = (cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i) || [])[1] || url.split(/[?#]/)[0].split('/').pop() || 'bijlage';
      files.push({ name: decodeURIComponent(name), type, b64: btoa(bin) });
    } catch (e) { errors.push(String(e.message || e)); }
  }
  return {
    title: document.title.slice(0, 120),
    url: location.origin + location.pathname,
    text: (document.body?.innerText || '').slice(0, 200000),
    files, errors,
  };
})();
