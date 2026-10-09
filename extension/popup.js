import { report } from './lib/report.js';

const msg = t => { document.getElementById('msg').textContent = t; };
// Reuse an open screener tab (it answers 'focus'); otherwise open one. Needs no "tabs" permission.
const openApp = async () => {
  const focused = await chrome.runtime.sendMessage({ type: 'focus' }).catch(() => false);
  if (!focused) await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  window.close();
};

document.getElementById('open').onclick = openApp;

document.getElementById('capture').onclick = async () => {
  msg('Bezig…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) return msg('Open eerst de kandidaat in je ATS.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
    if (!result) throw new Error('capture returned nothing');
    const { inbox = [] } = await chrome.storage.local.get('inbox');
    inbox.push({ ...result, at: Date.now() });
    await chrome.storage.local.set({ inbox });
    if (result.errors.length) report(new Error(result.errors.join('; ')), { step: 'capture-fetch' });
    msg(`Opgehaald: ${result.files.length} bijlage(n)${result.files.length ? '' : ' – paginatekst gebruikt'}.`);
    setTimeout(openApp, 600);
  } catch (e) {
    msg('Kon deze pagina niet lezen. De fout is gemeld.');
    report(e, { step: 'capture' });
  }
};
