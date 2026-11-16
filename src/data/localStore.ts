import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb'

export interface StoredFile {
  path: string
  data: unknown
  remoteSha: string | null
}

export interface OutboxEntry {
  path: string
  op: 'put' | 'delete'
  /** Eindeutiger Zeitstempel (ISO, UTC); ändert sich bei jeder neuen Operation auf den Pfad. */
  queuedAt: string
  /** SHA der Remote-Fassung zum Zeitpunkt des Eintrags (für `delete` maßgeblich). */
  baseSha: string | null
}

export type SecretKey = 'githubToken' | 'githubRepo'

export type LocalWrite = { path: string; op: 'put'; data: unknown } | { path: string; op: 'delete' }

interface SecondBrainDB extends DBSchema {
  files: { key: string; value: StoredFile }
  outbox: { key: string; value: OutboxEntry }
  secrets: { key: string; value: string }
}

type WriteTx = IDBPTransaction<SecondBrainDB, ['files', 'outbox'], 'readwrite'>

const DB_NAME = 'secondbrain'

let dbPromise: Promise<IDBPDatabase<SecondBrainDB>> | null = null

function getDb(): Promise<IDBPDatabase<SecondBrainDB>> {
  dbPromise ??= openDB<SecondBrainDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('files', { keyPath: 'path' })
      db.createObjectStore('outbox', { keyPath: 'path' })
      db.createObjectStore('secrets')
    },
  })
  return dbPromise
}

/** Schließt die Verbindung und löscht optional die Datenbank (für Tests). */
export async function resetDb(deleteData = false): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  if (deleteData) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  }
}

// --- Lesen ---------------------------------------------------------------

export async function getFile(path: string): Promise<StoredFile | undefined> {
  return (await getDb()).get('files', path)
}

/** Alle Dateien, deren Pfad mit `prefix` beginnt, sortiert nach Pfad. */
export async function listFiles(prefix: string): Promise<StoredFile[]> {
  const db = await getDb()
  const range = IDBKeyRange.bound(prefix, prefix + '￿')
  return db.getAll('files', range)
}

export async function getOutbox(): Promise<OutboxEntry[]> {
  return (await getDb()).getAll('outbox')
}

// --- Lokale Schreibaktionen (mit Outbox, atomar) ---------------------------

/** Zuletzt vergebener Zeitstempel (ms): `queuedAt` steigt streng, damit die Outbox-Reihenfolge der Schreibreihenfolge folgt. */
let lastQueuedMs = 0

function nextQueuedAt(previous: string | undefined): string {
  let ms = Math.max(Date.now(), lastQueuedMs + 1)
  let stamp = new Date(ms).toISOString()
  while (stamp === previous) stamp = new Date(++ms).toISOString()
  lastQueuedMs = ms
  return stamp
}

async function applyWrite(tx: WriteTx, write: LocalWrite): Promise<void> {
  const files = tx.objectStore('files')
  const outbox = tx.objectStore('outbox')
  const existing = await files.get(write.path)
  const queued = await outbox.get(write.path)
  const baseSha = existing?.remoteSha ?? queued?.baseSha ?? null
  if (write.op === 'put') {
    await files.put({ path: write.path, data: write.data, remoteSha: baseSha })
    await outbox.put({
      path: write.path,
      op: 'put',
      queuedAt: nextQueuedAt(queued?.queuedAt),
      baseSha,
    })
  } else if (existing) {
    await files.delete(write.path)
    await outbox.put({
      path: write.path,
      op: 'delete',
      queuedAt: nextQueuedAt(queued?.queuedAt),
      baseSha,
    })
  }
}

/** Führt mehrere Schreibaktionen in einer Transaktion aus. Löschen nicht vorhandener Dateien ist ein No-op. */
export async function commitLocal(writes: LocalWrite[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['files', 'outbox'], 'readwrite')
  for (const write of writes) await applyWrite(tx, write)
  await tx.done
}

/** Schreibt die Datei lokal und merkt sie in der Outbox vor. */
export async function putFileLocal(path: string, data: unknown): Promise<void> {
  await commitLocal([{ path, op: 'put', data }])
}

/** Entfernt die Datei lokal und merkt das Löschen in der Outbox vor (No-op, wenn nicht vorhanden). */
export async function deleteFileLocal(path: string): Promise<void> {
  await commitLocal([{ path, op: 'delete' }])
}

/**
 * Liest die Datei, berechnet mit `update` (synchron!) die neuen Daten und schreibt sie samt
 * Outbox in derselben Transaktion. Wirft `update`, wird nichts geschrieben.
 */
export async function updateFileLocal(
  path: string,
  update: (current: unknown) => unknown,
): Promise<unknown> {
  const db = await getDb()
  const tx = db.transaction(['files', 'outbox'], 'readwrite')
  const existing = await tx.objectStore('files').get(path)
  let data: unknown
  try {
    data = update(existing?.data)
  } catch (error) {
    tx.abort()
    await tx.done.catch(() => undefined)
    throw error
  }
  await applyWrite(tx, { path, op: 'put', data })
  await tx.done
  return data
}

// --- Für den Sync (Aufgabe 03): ohne Outbox --------------------------------

export async function putFileFromRemote(path: string, data: unknown, sha: string): Promise<void> {
  await (await getDb()).put('files', { path, data, remoteSha: sha })
}

export async function deleteFileFromRemote(path: string): Promise<void> {
  await (await getDb()).delete('files', path)
}

/**
 * Entfernt den Outbox-Eintrag. Mit `queuedAt` nur, wenn der aktuelle Eintrag noch derselbe ist
 * (zwischenzeitlich neu eingereihte Änderungen bleiben erhalten). Liefert, ob entfernt wurde.
 */
export async function removeOutboxEntry(path: string, queuedAt?: string): Promise<boolean> {
  const db = await getDb()
  const tx = db.transaction('outbox', 'readwrite')
  const current = await tx.store.get(path)
  const remove = current !== undefined && (queuedAt === undefined || current.queuedAt === queuedAt)
  if (remove) await tx.store.delete(path)
  await tx.done
  return remove
}

/**
 * Übernimmt eine Remote-Fassung nur, wenn für den Pfad kein Outbox-Eintrag offen ist
 * (atomar). Liefert, ob geschrieben wurde.
 */
export async function putFileFromRemoteIfClean(
  path: string,
  data: unknown,
  sha: string,
): Promise<boolean> {
  const db = await getDb()
  const tx = db.transaction(['files', 'outbox'], 'readwrite')
  const queued = await tx.objectStore('outbox').get(path)
  if (!queued) await tx.objectStore('files').put({ path, data, remoteSha: sha })
  await tx.done
  return !queued
}

/** Löscht die lokale Datei nur, wenn kein Outbox-Eintrag offen ist (atomar). */
export async function deleteFileFromRemoteIfClean(path: string): Promise<boolean> {
  const db = await getDb()
  const tx = db.transaction(['files', 'outbox'], 'readwrite')
  const queued = await tx.objectStore('outbox').get(path)
  if (!queued) await tx.objectStore('files').delete(path)
  await tx.done
  return !queued
}

/**
 * Beendet einen Outbox-Eintrag zugunsten der Remote-Fassung (`null` = Remote existiert nicht):
 * entfernt den Eintrag und überschreibt die lokale Datei – aber nur, wenn der Eintrag noch
 * derselbe (`queuedAt`) ist (atomar). Liefert, ob das geschah.
 */
export async function settleOutboxWithRemote(
  path: string,
  queuedAt: string,
  remote: { data: unknown; sha: string } | null,
): Promise<boolean> {
  const db = await getDb()
  const tx = db.transaction(['files', 'outbox'], 'readwrite')
  const queued = await tx.objectStore('outbox').get(path)
  const same = queued !== undefined && queued.queuedAt === queuedAt
  if (same) {
    await tx.objectStore('outbox').delete(path)
    if (remote)
      await tx.objectStore('files').put({ path, data: remote.data, remoteSha: remote.sha })
    else await tx.objectStore('files').delete(path)
  }
  await tx.done
  return same
}

export async function setRemoteSha(path: string, sha: string | null): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('files', 'readwrite')
  const existing = await tx.store.get(path)
  if (existing) await tx.store.put({ ...existing, remoteSha: sha })
  await tx.done
}

// --- Lokale Zugangsdaten (SPEC §3.7) ---------------------------------------

export async function getSecret(key: SecretKey): Promise<string | undefined> {
  return (await getDb()).get('secrets', key)
}

export async function setSecret(key: SecretKey, value: string): Promise<void> {
  await (await getDb()).put('secrets', value, key)
}

export async function deleteSecret(key: SecretKey): Promise<void> {
  await (await getDb()).delete('secrets', key)
}
