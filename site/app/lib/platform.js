// The same screener runs as the Chrome extension and as a plain web page (site/app/).
// Everything that differs between the two lives here.
export const isExtension = !!(globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local);

// Small settings (saved searches, custom skills, vacancy texts). CVs themselves live in IndexedDB in both.
export async function load(key, fallback) {
  if (isExtension) return (await chrome.storage.local.get(key))[key] ?? fallback;
  try { const v = localStorage.getItem('cvs:' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export async function store(key, value) {
  if (isExtension) return chrome.storage.local.set({ [key]: value });
  try { localStorage.setItem('cvs:' + key, JSON.stringify(value)); } catch { /* full or blocked: settings just won't persist */ }
}

// A file shipped next to the page (the pdf.js worker).
export const assetUrl = path => isExtension ? chrome.runtime.getURL(path) : new URL(path, location.href).href;

export const version = () => isExtension ? chrome.runtime.getManifest().version : (document.querySelector('meta[name="cvs-version"]')?.content || 'web');

// Extension only: captures from an ATS tab arrive through storage, and the popup can ask this tab to come forward.
export function onInbox(fn) {
  if (isExtension) chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.inbox?.newValue?.length) fn(); });
}
export function onFocusRequest() {
  if (!isExtension) return;
  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m?.type !== 'focus') return;
    chrome.tabs.getCurrent(t => {
      chrome.tabs.update(t.id, { active: true });
      chrome.windows.update(t.windowId, { focused: true });
      reply(true);
    });
    return true;
  });
}
