import {
  commitLocal,
  deleteFileLocal,
  getFile,
  getOutbox,
  putFileFromRemote,
  putFileLocal,
  removeOutboxEntry,
  resetDb,
  updateFileLocal,
} from './localStore'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

describe('localStore (atomar)', () => {
  it('put nach delete übernimmt baseSha aus dem Outbox-Eintrag', async () => {
    await putFileFromRemote('items/a.json', { v: 1 }, 'sha1')
    await deleteFileLocal('items/a.json')
    await putFileLocal('items/a.json', { v: 2 })
    expect((await getOutbox())[0]).toMatchObject({ op: 'put', baseSha: 'sha1' })
    expect((await getFile('items/a.json'))?.remoteSha).toBe('sha1')
  })

  it('updateFileLocal liest, schreibt und reiht in einer Transaktion ein', async () => {
    await putFileFromRemote('items/a.json', { n: 1 }, 'sha1')
    await updateFileLocal('items/a.json', (cur) => ({ n: (cur as { n: number }).n + 1 }))
    expect((await getFile('items/a.json'))?.data).toEqual({ n: 2 })
    expect((await getOutbox())[0]).toMatchObject({ op: 'put', baseSha: 'sha1' })
  })

  it('updateFileLocal schreibt nichts, wenn die Funktion wirft', async () => {
    await expect(
      updateFileLocal('items/a.json', () => {
        throw new Error('nein')
      }),
    ).rejects.toThrow('nein')
    expect(await getOutbox()).toHaveLength(0)
    expect(await getFile('items/a.json')).toBeUndefined()
  })

  it('commitLocal führt mehrere Schreibaktionen aus, Löschen ohne Datei ist No-op', async () => {
    await putFileFromRemote('inbox/x.json', {}, 's')
    await commitLocal([
      { path: 'items/x.json', op: 'put', data: { a: 1 } },
      { path: 'inbox/x.json', op: 'delete' },
      { path: 'inbox/gone.json', op: 'delete' },
    ])
    const outbox = await getOutbox()
    expect(outbox.map((e) => [e.path, e.op]).sort()).toEqual([
      ['inbox/x.json', 'delete'],
      ['items/x.json', 'put'],
    ])
  })

  it('removeOutboxEntry entfernt nur bei passendem queuedAt', async () => {
    await putFileLocal('items/a.json', { v: 1 })
    const first = (await getOutbox())[0]
    await putFileLocal('items/a.json', { v: 2 })
    const second = (await getOutbox())[0]
    expect(second.queuedAt).not.toBe(first.queuedAt)
    expect(await removeOutboxEntry('items/a.json', first.queuedAt)).toBe(false)
    expect(await getOutbox()).toHaveLength(1)
    expect(await removeOutboxEntry('items/a.json', second.queuedAt)).toBe(true)
    expect(await getOutbox()).toHaveLength(0)
    expect(await removeOutboxEntry('items/a.json')).toBe(false)
  })
})
