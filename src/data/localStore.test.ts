import {
  deleteFileFromRemote,
  deleteFileLocal,
  deleteSecret,
  getFile,
  getOutbox,
  getSecret,
  listFiles,
  putFileFromRemote,
  putFileLocal,
  removeOutboxEntry,
  resetDb,
  setRemoteSha,
  setSecret,
} from './localStore'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

describe('localStore', () => {
  it('speichert Dateien und listet sie nach Präfix', async () => {
    await putFileLocal('items/b.json', { id: 'b' })
    await putFileLocal('items/a.json', { id: 'a' })
    await putFileLocal('inbox/c.json', { id: 'c' })
    const items = await listFiles('items/')
    expect(items.map((f) => f.path)).toEqual(['items/a.json', 'items/b.json'])
    expect((await getFile('inbox/c.json'))?.data).toEqual({ id: 'c' })
  })

  it('hält pro Pfad höchstens einen Outbox-Eintrag', async () => {
    await putFileLocal('items/a.json', { v: 1 })
    await putFileLocal('items/a.json', { v: 2 })
    const outbox = await getOutbox()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ path: 'items/a.json', op: 'put', baseSha: null })
  })

  it('behält remoteSha beim lokalen Überschreiben', async () => {
    await putFileFromRemote('items/a.json', { v: 1 }, 'sha1')
    await putFileLocal('items/a.json', { v: 2 })
    expect((await getFile('items/a.json'))?.remoteSha).toBe('sha1')
    expect((await getOutbox())[0].baseSha).toBe('sha1')
  })

  it('Löschen ersetzt den put-Eintrag durch delete und führt baseSha mit', async () => {
    await putFileFromRemote('items/a.json', { v: 1 }, 'sha1')
    await putFileLocal('items/a.json', { v: 2 })
    await deleteFileLocal('items/a.json')
    expect(await getFile('items/a.json')).toBeUndefined()
    const outbox = await getOutbox()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ op: 'delete', baseSha: 'sha1' })
  })

  it('Löschen einer nie gesendeten Datei ergibt delete mit baseSha null', async () => {
    await putFileLocal('items/a.json', { v: 1 })
    await deleteFileLocal('items/a.json')
    const outbox = await getOutbox()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ op: 'delete', baseSha: null })
  })

  it('Remote-Funktionen schreiben nicht in die Outbox', async () => {
    await putFileFromRemote('items/a.json', { v: 1 }, 'sha1')
    expect(await getOutbox()).toHaveLength(0)
    await setRemoteSha('items/a.json', 'sha2')
    expect((await getFile('items/a.json'))?.remoteSha).toBe('sha2')
    await deleteFileFromRemote('items/a.json')
    expect(await getFile('items/a.json')).toBeUndefined()
    expect(await getOutbox()).toHaveLength(0)
  })

  it('removeOutboxEntry entfernt den Eintrag', async () => {
    await putFileLocal('items/a.json', {})
    await removeOutboxEntry('items/a.json')
    expect(await getOutbox()).toHaveLength(0)
  })

  it('speichert Zugangsdaten lokal', async () => {
    expect(await getSecret('githubRepo')).toBeUndefined()
    await setSecret('githubRepo', 'x/y')
    expect(await getSecret('githubRepo')).toBe('x/y')
    await deleteSecret('githubRepo')
    expect(await getSecret('githubRepo')).toBeUndefined()
  })
})
