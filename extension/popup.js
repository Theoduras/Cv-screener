import { report } from './lib/report.js';

const msg = t => { document.getElementById('msg').textContent = t; };
// Reuse an open screener tab (it answers 'focus'); otherwise open one. Needs no "tabs" permission.
const openApp = async () => {
  const focused = await chrome.runtime.sendMessage({ type: 'focus' }).catch(() => false);
  if (!focused) await chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
  window.close();
};

document.getElementById('open').onclick = openApp;

// Job ads from the page the recruiter has open (LinkedIn, Indeed, any job board): read, never crawled.
document.getElementById('collect').onclick = async () => {
  msg('Reading vacancies…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) return msg('Open a page with vacancies first.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['collect.js'] });
    const n = (result?.cards?.length || 0) + (result?.ld?.length || 0) + (result?.detail ? 1 : 0);
    if (!n) return msg('No vacancies found on this page. Try a search results page or a single job ad.');
    const { jobInbox = [] } = await chrome.storage.local.get('jobInbox');
    jobInbox.push({ ...result, at: Date.now() });
    await chrome.storage.local.set({ jobInbox });
    msg(`Collected ${result.cards.length || 1} vacanc${result.cards.length === 1 ? 'y' : 'ies'}.`);
    setTimeout(openApp, 600);
  } catch (e) {
    msg('Could not read this page. The error has been reported.');
    report(e, { step: 'collect' });
  }
};

document.getElementById('capture').onclick = async () => {
  msg('Working…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || '')) return msg('Open the candidate in your ATS first.');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['capture.js'] });
    if (!result) throw new Error('capture returned nothing');
    const { inbox = [] } = await chrome.storage.local.get('inbox');
    inbox.push({ ...result, at: Date.now() });
    await chrome.storage.local.set({ inbox });
    if (result.errors.length) report(new Error(result.errors.join('; ')), { step: 'capture-fetch' });
    msg(`Captured ${result.files.length} attachment(s)${result.files.length ? '' : ' – used the page text'}.`);
    setTimeout(openApp, 600);
  } catch (e) {
    msg('Could not read this page. The error has been reported.');
    report(e, { step: 'capture' });
  }
};
