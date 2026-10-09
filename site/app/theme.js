// Light / dark / auto. Loaded in <head>, before the page paints, so a dark choice never flashes white.
// localStorage rather than chrome.storage: it is synchronous, and a theme is a per-device convenience.
(() => {
  const KEY = 'cvs:theme', ORDER = ['auto', 'dark', 'light'];
  const LABEL = { auto: '🌓 Auto', dark: '🌙 Dark', light: '☀️ Light' };
  const get = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } };
  const apply = t => {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = t;
    const b = document.getElementById('themeBtn');
    if (b) { b.textContent = LABEL[t]; b.title = `Colours: ${t === 'auto' ? 'follow this device' : t} – click to change`; }
  };
  apply(get());
  document.addEventListener('DOMContentLoaded', () => {
    apply(get());
    document.getElementById('themeBtn')?.addEventListener('click', () => {
      const next = ORDER[(ORDER.indexOf(get()) + 1) % ORDER.length];
      try { localStorage.setItem(KEY, next); } catch { /* private mode: applies until reload */ }
      apply(next);
    });
  });
})();
