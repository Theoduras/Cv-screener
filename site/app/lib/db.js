// Tiny IndexedDB wrapper. Everything stays in this browser profile.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('cv-screener', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('candidates', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('candidates', mode);
    const out = fn(t.objectStore('candidates'));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

export const all = () => tx('readonly', s => s.getAll());
export const put = rows => tx('readwrite', s => { for (const r of [].concat(rows)) s.put(r); });
export const remove = id => tx('readwrite', s => s.delete(id));
export const clear = () => tx('readwrite', s => s.clear());
