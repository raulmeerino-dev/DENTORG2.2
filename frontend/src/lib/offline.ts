type PendingRecord = { type: 'paciente' | 'cita'; payload: unknown };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('dentorg2-offline', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addOfflinePending(record: PendingRecord) {
  const db = await openDb();
  const tx = db.transaction('pending', 'readwrite');
  tx.objectStore('pending').add({ ...record, createdAt: new Date().toISOString() });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflinePending() {
  const db = await openDb();
  const tx = db.transaction('pending', 'readonly');
  const request = tx.objectStore('pending').getAll();
  return await new Promise<Array<PendingRecord & { id: number }>>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearOfflinePending() {
  const db = await openDb();
  const tx = db.transaction('pending', 'readwrite');
  tx.objectStore('pending').clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
