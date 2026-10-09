// Tiny IndexedDB wrapper. Everything stays in this browser profile.
// v2 adds "jobs": the ads the vacancy finder collected.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('cv-screener', 2);
  r.onupgradeneeded = () => {
    const names = r.result.objectStoreNames;
    if (!names.contains('candidates')) r.result.createObjectStore('candidates', { keyPath: 'id' });
    if (!names.contains('jobs')) r.result.createObjectStore('jobs', { keyPath: 'id' });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}

export const all = () => tx('candidates', 'readonly', s => s.getAll());
export const put = rows => tx('candidates', 'readwrite', s => { for (const r of [].concat(rows)) s.put(r); });
export const remove = id => tx('candidates', 'readwrite', s => s.delete(id));
export const clear = () => tx('candidates', 'readwrite', s => s.clear());

export const jobs = {
  all: () => tx('jobs', 'readonly', s => s.getAll()),
  put: rows => tx('jobs', 'readwrite', s => { for (const r of [].concat(rows)) s.put(r); }),
  clear: () => tx('jobs', 'readwrite', s => s.clear()),
};
