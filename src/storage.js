let connection;
async function db() {
  if (connection) return connection;
  connection = await new Promise((resolve, reject) => {
    const r = indexedDB.open("lab-replay", 4);
    r.onupgradeneeded = () => {
      for (const name of ["takes", "jobs", "courses", "attempts", "voiceovers"])
        if (!r.result.objectStoreNames.contains(name))
          r.result.createObjectStore(name, { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return connection;
}
async function transaction(store, mode, action) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const r = action(tx.objectStore(store));
    tx.oncomplete = () => resolve(r.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Storage interrupted"));
  });
}
export const all = (store) => transaction(store, "readonly", (s) => s.getAll());
export const put = (store, item) =>
  transaction(store, "readwrite", (s) => s.put(item));
export const remove = (store, id) =>
  transaction(store, "readwrite", (s) => s.delete(id));
