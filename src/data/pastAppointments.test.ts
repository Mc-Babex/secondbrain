import { getFile, getOutbox, putFileFromRemote, resetDb, setSecret } from './localStore'
import { resetSyncStatus, setSyncStatus } from './syncStatus'
import {
  archivePastAppointments,
  createItem,
  getCategories,
  listItems,
  restoreItem,
} from './repository'
import {
  startPastAppointmentsArchiver,
  stopPastAppointmentsArchiver,
} from './pastAppointmentsTrigger'

beforeEach(() => resetDb(true))
afterAll(() => resetDb(true))

const past = { start: '2026-10-22T14:00:00+02:00', durationMin: 60 }
const NOW = new Date('2026-10-23T09:00:00+02:00')

describe('archivePastAppointments', () => {
  it('setzt genau die Felder, completedAt = Ende, eine Outbox-Änderung, kein Netz', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const t = await createItem({
      type: 'termin',
      title: 'Zahnarzt',
      categoryId: 'privat',
      schedule: past,
    })
    const future = await createItem({
      type: 'termin',
      title: 'Später',
      categoryId: 'privat',
      schedule: { start: '2026-10-24T10:00:00+02:00', durationMin: 30 },
    })
    const task = await createItem({ type: 'aufgabe', title: 'A', categoryId: 'privat' })
    const archiveId = (await getCategories()).find((c) => c.kind === 'archiv')?.id

    expect(await archivePastAppointments(NOW)).toBe(1)

    const items = await listItems()
    expect(items.find((i) => i.id === t.id)).toMatchObject({
      status: 'erledigt',
      completedAt: '2026-10-22T15:00:00+02:00',
      originalCategoryId: 'privat',
      categoryId: archiveId,
      schedule: past,
    })
    expect(items.find((i) => i.id === future.id)?.status).toBe('offen')
    expect(items.find((i) => i.id === task.id)?.status).toBe('offen')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()

    const outbox = await getOutbox()
    expect(outbox.filter((e) => e.path === `items/${t.id}.json`)).toHaveLength(1)
    expect(await archivePastAppointments(NOW)).toBe(0)
    expect(await getOutbox()).toEqual(outbox)
  })

  it('erhält unbekannte Felder', async () => {
    const t = await createItem({ type: 'termin', title: 'X', categoryId: 'privat', schedule: past })
    const stored = await getFile(`items/${t.id}.json`)
    await putFileFromRemote(`items/${t.id}.json`, { ...(stored?.data as object), extra: 7 }, 'sha')
    await archivePastAppointments(NOW)
    expect((await getFile(`items/${t.id}.json`))?.data).toMatchObject({ extra: 7 })
  })

  it('restoreItem setzt schedule null bei vergangenem Termin', async () => {
    const t = await createItem({ type: 'termin', title: 'X', categoryId: 'privat', schedule: past })
    await archivePastAppointments(NOW)
    const back = await restoreItem(t.id)
    expect(back).toMatchObject({ status: 'offen', categoryId: 'privat', schedule: null })
  })
})

describe('Auslöser', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    stopPastAppointmentsArchiver()
    resetSyncStatus()
    vi.useRealTimers()
  })

  async function status(id: string): Promise<string | undefined> {
    return (await listItems()).find((i) => i.id === id)?.status
  }

  it('läuft beim Start, bei visibilitychange und per Intervall – ohne Token', async () => {
    const a = await createItem({ type: 'termin', title: 'A', categoryId: 'privat', schedule: past })
    startPastAppointmentsArchiver()
    await vi.waitFor(async () => expect(await status(a.id)).toBe('erledigt'))

    const b = await createItem({
      type: 'termin',
      title: 'B',
      categoryId: 'privat',
      schedule: { start: '2026-10-23T09:30:00+02:00', durationMin: 30 },
    })
    vi.setSystemTime(new Date('2026-10-23T10:01:00+02:00'))
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(async () => expect(await status(b.id)).toBe('erledigt'))

    const c = await createItem({
      type: 'termin',
      title: 'C',
      categoryId: 'privat',
      schedule: { start: '2026-10-23T10:10:00+02:00', durationMin: 10 },
    })
    vi.setSystemTime(new Date('2026-10-23T10:30:00+02:00'))
    vi.advanceTimersByTime(5 * 60 * 1000)
    await vi.waitFor(async () => expect(await status(c.id)).toBe('erledigt'))
  })
})

describe('Auslöser mit Token', () => {
  beforeEach(async () => {
    await setSecret('githubToken', 'test-token')
    await setSecret('githubRepo', 'besitzer/name')
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
    })
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    stopPastAppointmentsArchiver()
    resetSyncStatus()
    vi.useRealTimers()
  })

  async function status(id: string): Promise<string | undefined> {
    return (await listItems()).find((i) => i.id === id)?.status
  }

  it('wartet auf den ersten Abgleich und läuft danach', async () => {
    const a = await createItem({ type: 'termin', title: 'A', categoryId: 'privat', schedule: past })
    setSyncStatus({ state: 'laeuft' })
    startPastAppointmentsArchiver()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await status(a.id)).toBe('offen')
    setSyncStatus({ state: 'synchron' })
    await vi.waitFor(async () => expect(await status(a.id)).toBe('erledigt'))
  })

  it('läuft auch nach einem Sync-Fehler/offline', async () => {
    const a = await createItem({ type: 'termin', title: 'A', categoryId: 'privat', schedule: past })
    setSyncStatus({ state: 'laeuft' })
    startPastAppointmentsArchiver()
    await vi.advanceTimersByTimeAsync(1000)
    setSyncStatus({ state: 'offline', message: 'offline' })
    await vi.waitFor(async () => expect(await status(a.id)).toBe('erledigt'))
  })

  it('läuft nach 30 s, wenn der Sync hängt', async () => {
    const a = await createItem({ type: 'termin', title: 'A', categoryId: 'privat', schedule: past })
    setSyncStatus({ state: 'laeuft' })
    startPastAppointmentsArchiver()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(28_000)
    expect(await status(a.id)).toBe('offen')
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(async () => expect(await status(a.id)).toBe('erledigt'))
  })
})
