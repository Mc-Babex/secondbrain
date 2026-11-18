import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { instanceId, upcomingOccurrences } from '../lib/series'
import { getOutbox, resetDb } from './localStore'
import {
  addSeries,
  addSkippedDate,
  completeItem,
  createProject,
  deleteItem,
  listItems,
  listProjects,
  pauseSeries,
  removeSkippedDate,
  resumeSeries,
  skipSeriesInstance,
  unskipSeriesInstance,
  updateItem,
  updateSeries,
} from './repository'
import { createDueSeriesInstances } from './seriesInstances'
import { validSeries } from './types'

const FIELDS = {
  titlePattern: 'Übungsblatt {Nr}',
  every: 1,
  weekday: 1,
  startDate: '2026-10-26',
  endDate: null,
  count: null,
  dueWeekday: 5,
  durationMin: 180,
}

const at = (iso: string): void => {
  vi.setSystemTime(new Date(iso))
}

const storedSeries = async () => validSeries((await listProjects())[0])[0]
const titles = async (): Promise<string[][]> =>
  (await listItems()).map((i) => [i.title, i.id.slice(0, 8), i.dueDate ?? ''])

async function setup(fields: Partial<typeof FIELDS> = {}) {
  const project = await createProject({ title: 'Analysis 1', categoryId: 'privat' })
  const series = await addSeries(project.id, { ...FIELDS, ...fields })
  return { project, series }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-11-23T08:00:00+01:00')
  await resetDb(true)
})
afterEach(() => {
  vi.useRealTimers()
})
afterAll(() => resetDb(true))

describe('Ausfall an einer Serien-Instanz', () => {
  it('Blatt 5 fällt aus: fällig Fr 04.12., Ausfall 30.11., Blatt 6 am 07.12.', async () => {
    const { project, series } = await setup()
    await createDueSeriesInstances()
    const five = (await listItems()).find((i) => i.seriesNumber === 5)
    expect(five).toMatchObject({ dueDate: '2026-11-27' })
    expect(five?.id.slice(0, 8)).toBe('20261123')

    const result = await skipSeriesInstance(five?.id ?? '')
    expect(result).toMatchObject({ weeks: 1, item: { dueDate: '2026-12-04' } })
    expect((await storedSeries()).skippedDates).toEqual(['2026-11-30'])
    expect((await listItems()).find((i) => i.seriesNumber === 5)?.dueDate).toBe('2026-12-04')
    // Projektdatei und Instanz liegen beide in der Outbox.
    const queued = (await getOutbox()).map((e) => e.path)
    expect(queued).toContain(`items/${five?.id}.json`)
    expect(queued).toContain(`projects/${project.id}.json`)

    at('2026-12-07T08:00:00+01:00')
    expect(await createDueSeriesInstances()).toBe(1)
    const six = (await listItems()).find((i) => i.seriesNumber === 6)
    expect(six?.id).toBe(instanceId(project.id, series.id, '2026-12-07'))
    expect(six?.dueDate).toBe('2026-12-11')
  })

  it('zweimal Ausfall: fällig 11.12., Blatt 6 am 14.12.', async () => {
    await setup()
    await createDueSeriesInstances()
    const five = (await listItems()).find((i) => i.seriesNumber === 5)
    await skipSeriesInstance(five?.id ?? '')
    await skipSeriesInstance(five?.id ?? '')
    expect((await storedSeries()).skippedDates).toEqual(['2026-11-30', '2026-12-07'])
    expect((await listItems()).find((i) => i.seriesNumber === 5)?.dueDate).toBe('2026-12-11')
    at('2026-12-14T08:00:00+01:00')
    await createDueSeriesInstances()
    expect((await listItems()).find((i) => i.seriesNumber === 6)?.id.slice(0, 8)).toBe('20261214')
  })

  it('bei every 2 zwei Wochen', async () => {
    await setup({ every: 2 })
    await createDueSeriesInstances()
    const third = (await listItems()).find((i) => i.seriesNumber === 3)
    expect(third?.id.slice(0, 8)).toBe('20261123')
    const result = await skipSeriesInstance(third?.id ?? '')
    expect(result.weeks).toBe(2)
    expect(result.item.dueDate).toBe('2026-12-11')
    expect((await storedSeries()).skippedDates).toEqual(['2026-12-07'])
  })

  it('bereits angelegte Folgeblätter rücken nach (künftiges Blatt wird gelöscht)', async () => {
    await setup()
    at('2026-11-30T08:00:00+01:00')
    await createDueSeriesInstances()
    const items = await listItems()
    const five = items.find((i) => i.seriesNumber === 5)
    expect(items.map((i) => i.seriesNumber)).toEqual([1, 2, 3, 4, 5, 6])
    await skipSeriesInstance(five?.id ?? '')
    expect((await listItems()).map((i) => i.seriesNumber)).toEqual([1, 2, 3, 4, 5])
    expect(await storedSeries()).toMatchObject({ lastNumber: 5, lastDate: '2026-11-23' })
  })

  it('lehnt erledigte Einträge ab', async () => {
    await setup()
    await createDueSeriesInstances()
    const first = (await listItems())[0]
    await completeItem(first.id)
    await expect(skipSeriesInstance(first.id)).rejects.toThrow()
  })

  it('bewahrt unbekannte Felder der Instanz', async () => {
    await setup()
    await createDueSeriesInstances()
    const five = (await listItems()).find((i) => i.seriesNumber === 5)
    await updateItem(five?.id ?? '', { extra: 1 } as never)
    await skipSeriesInstance(five?.id ?? '')
    expect((await listItems()).find((i) => i.seriesNumber === 5)).toMatchObject({ extra: 1 })
  })
})

describe('Ausfall zurücknehmen', () => {
  it('entfernt bei zwei Ausfällen nur den letzten; dueDate und Folgeblätter wie vorher', async () => {
    const { project, series } = await setup()
    at('2026-11-30T08:00:00+01:00')
    await createDueSeriesInstances()
    const five = (await listItems()).find((i) => i.seriesNumber === 5)
    await skipSeriesInstance(five?.id ?? '')
    await skipSeriesInstance(five?.id ?? '')
    expect((await storedSeries()).skippedDates).toEqual(['2026-11-30', '2026-12-07'])
    expect((await listItems()).find((i) => i.seriesNumber === 5)?.dueDate).toBe('2026-12-11')

    const result = await unskipSeriesInstance(five?.id ?? '')
    expect(result).toMatchObject({ weeks: 1, item: { dueDate: '2026-12-04' } })
    expect((await storedSeries()).skippedDates).toEqual(['2026-11-30'])
    expect((await listItems()).find((i) => i.seriesNumber === 5)?.dueDate).toBe('2026-12-04')
    expect((await getOutbox()).map((e) => e.path)).toContain(`projects/${project.id}.json`)

    await unskipSeriesInstance(five?.id ?? '')
    expect((await storedSeries()).skippedDates).toEqual([])
    expect((await listItems()).find((i) => i.seriesNumber === 5)?.dueDate).toBe('2026-11-27')
    await createDueSeriesInstances()
    expect((await listItems()).find((i) => i.seriesNumber === 6)?.id).toBe(
      instanceId(project.id, series.id, '2026-11-30'),
    )
  })

  it('Fortschritt ist nach Rückgängig wie vor dem Ausfall', async () => {
    await setup()
    at('2026-11-30T08:00:00+01:00')
    await createDueSeriesInstances()
    const five = (await listItems()).find((i) => i.seriesNumber === 5)
    const before = await storedSeries()
    const sixBefore = (await listItems()).find((i) => i.seriesNumber === 6)
    await skipSeriesInstance(five?.id ?? '')
    expect(await storedSeries()).toMatchObject({ lastNumber: 5, lastDate: '2026-11-23' })
    await unskipSeriesInstance(five?.id ?? '')
    expect(await storedSeries()).toMatchObject({ skippedDates: [], lastNumber: 5 })
    // Das beim Ausfall gelöschte künftige Blatt 6 entsteht beim nächsten Abgleich mit derselben ID neu.
    await createDueSeriesInstances()
    expect(await storedSeries()).toMatchObject({
      lastNumber: before.lastNumber,
      lastDate: before.lastDate,
    })
    expect((await listItems()).find((i) => i.seriesNumber === 6)?.id).toBe(sixBefore?.id)
  })

  it('erledigte spätere Blätter bleiben unverändert', async () => {
    await setup()
    at('2026-11-30T08:00:00+01:00')
    await createDueSeriesInstances()
    const items = await listItems()
    const four = items.find((i) => i.seriesNumber === 4)
    const six = items.find((i) => i.seriesNumber === 6)
    await completeItem(six?.id ?? '')
    await skipSeriesInstance(four?.id ?? '')
    await unskipSeriesInstance(four?.id ?? '')
    expect((await listItems()).find((i) => i.seriesNumber === 6)).toMatchObject({
      id: six?.id,
      status: 'erledigt',
    })
  })

  it('Fehler bei Blatt ohne Ausfall und bei erledigtem Blatt', async () => {
    await setup()
    await createDueSeriesInstances()
    const first = (await listItems())[0]
    await expect(unskipSeriesInstance(first.id)).rejects.toThrow('keinen Ausfall')
    await completeItem(first.id)
    await expect(unskipSeriesInstance(first.id)).rejects.toThrow()
  })

  it('Serie ohne dueWeekday: nur der Ausfall wird entfernt', async () => {
    await setup({ dueWeekday: null as never })
    await createDueSeriesInstances()
    const five = (await listItems()).find((i) => i.seriesNumber === 5)
    await skipSeriesInstance(five?.id ?? '')
    const result = await unskipSeriesInstance(five?.id ?? '')
    expect(result.item.dueDate ?? null).toBeNull()
    expect((await storedSeries()).skippedDates).toEqual([])
  })
})

describe('Ausfall eintragen und entfernen', () => {
  it('ändert die Stichtage der Vorschau; nur künftige Stichtage', async () => {
    const { project, series } = await setup()
    await createDueSeriesInstances()
    expect(upcomingOccurrences(await storedSeries(), 2)).toEqual(['2026-11-30', '2026-12-07'])
    await addSkippedDate(project.id, series.id, '2026-11-30')
    expect(upcomingOccurrences(await storedSeries(), 2)).toEqual(['2026-12-07', '2026-12-14'])
    await expect(addSkippedDate(project.id, series.id, '2026-11-23')).rejects.toThrow()
    await removeSkippedDate(project.id, series.id, '2026-11-30')
    expect((await storedSeries()).skippedDates).toEqual([])
    expect(upcomingOccurrences(await storedSeries(), 1)).toEqual(['2026-11-30'])
  })
})

describe('Pausieren und Fortsetzen', () => {
  it('trägt die Stichtage der Pause als Ausfall ein, Nummerierung läuft weiter', async () => {
    const { project, series } = await setup()
    at('2026-11-02T08:00:00+01:00')
    await createDueSeriesInstances()
    await pauseSeries(project.id, series.id)
    at('2026-11-24T08:00:00+01:00')
    await resumeSeries(project.id, series.id)
    expect(await storedSeries()).toMatchObject({
      state: 'aktiv',
      skippedDates: ['2026-11-09', '2026-11-16', '2026-11-23'],
      lastNumber: 2,
      lastDate: '2026-11-23',
    })
    at('2026-11-30T08:00:00+01:00')
    await createDueSeriesInstances()
    expect((await listItems()).map((i) => [i.seriesNumber, i.id.slice(0, 8)]).at(-1)).toEqual([
      3,
      '20261130',
    ])
  })
})

describe('Bearbeiten berechnet offene Blätter neu', () => {
  it('Start eine Woche später: Blatt 1 bleibt, offenes Blatt 2 bekommt neuen Stichtag und dueDate', async () => {
    const { project, series } = await setup({ startDate: '2026-10-19' })
    at('2026-10-26T08:00:00+01:00')
    await createDueSeriesInstances()
    const [one, two] = await listItems()
    await completeItem(one.id)
    at('2026-11-05T08:00:00+01:00')
    await updateSeries(project.id, series.id, { startDate: '2026-10-26' })
    expect(await titles()).toEqual([
      ['Übungsblatt 1', '20261019', '2026-10-23'],
      ['Übungsblatt 2', '20261102', '2026-11-06'],
    ])
    const moved = (await listItems()).find((i) => i.seriesNumber === 2)
    expect(moved?.id).toBe(instanceId(project.id, series.id, '2026-11-02'))
    expect(moved?.createdAt).toBe(two.createdAt)
    expect(await storedSeries()).toMatchObject({ lastNumber: 2, lastDate: '2026-11-02' })
    // Die alte Datei ist über die Outbox gelöscht.
    expect((await getOutbox()).find((e) => e.path === `items/${two.id}.json`)?.op).toBe('delete')
    // Keine Doppel bei erneuter Anlage.
    expect(await createDueSeriesInstances()).toBe(0)
    at('2026-11-09T08:00:00+01:00')
    await createDueSeriesInstances()
    expect((await listItems()).map((i) => i.seriesNumber)).toEqual([1, 2, 3])
  })

  it('liegt der neue Stichtag nach heute, wird das offene Blatt gelöscht', async () => {
    const { project, series } = await setup({ startDate: '2026-10-19' })
    at('2026-10-26T08:00:00+01:00')
    await createDueSeriesInstances()
    const [one] = await listItems()
    await completeItem(one.id)
    await updateSeries(project.id, series.id, { startDate: '2026-10-26' })
    expect((await listItems()).map((i) => i.seriesNumber)).toEqual([1])
    expect(await storedSeries()).toMatchObject({ lastNumber: 1, lastDate: '2026-10-26' })
  })

  it('von Hand gelöschtes höchstes Blatt bleibt nach Neuberechnung ohne Löschung weg', async () => {
    const { project, series } = await setup({ startDate: '2026-10-19' })
    at('2026-10-26T08:00:00+01:00')
    await createDueSeriesInstances()
    const [, two] = await listItems()
    await deleteItem(two.id)
    await updateSeries(project.id, series.id, { dueWeekday: 4 })
    expect(await storedSeries()).toMatchObject({ lastNumber: 2, lastDate: '2026-10-26' })
    await createDueSeriesInstances()
    expect((await listItems()).map((i) => i.seriesNumber)).toEqual([1])
  })

  it('Ausfälle vor dem neuen Start entfallen; Änderung nur der Dauer rechnet nichts neu', async () => {
    const { project, series } = await setup()
    await addSkippedDate(project.id, series.id, '2026-11-02')
    await addSkippedDate(project.id, series.id, '2026-12-07')
    await updateSeries(project.id, series.id, { startDate: '2026-11-09' })
    expect((await storedSeries()).skippedDates).toEqual(['2026-12-07'])
    await createDueSeriesInstances()
    const before = await titles()
    await updateSeries(project.id, series.id, { durationMin: 60 })
    expect(await titles()).toEqual(before)
  })
})
