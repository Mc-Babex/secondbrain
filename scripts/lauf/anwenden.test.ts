// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Category, Item } from '../../src/data/types'
import { runAnwenden } from './anwenden'
import { readRepoFile, writeJsonFile } from './dataRepo'
import type { EventIdsFile, PlanEntry, PlanFile } from './files'
import { validInbox, validItem } from './fixtures'
import { runPruefen } from './pruefen'

const NOW = '2026-10-21T14:07:30+02:00'
const STARTED = '2026-10-21T14:05:00+02:00'
const ID_A = validInbox.id
const ID_B = '20261017-093001-m4n5'
const ID_C = '20261017-093002-p6q7'
const PLAN_NOW = '2026-10-21T14:05:00+02:00'

const scheduled: Item = {
  ...validItem,
  schedule: { start: '2026-10-22T09:00:00+02:00', durationMin: 15 },
}
const unscheduled: Item = { ...validItem, id: ID_B, title: 'Notiz', type: 'notiz', schedule: null }

const entryOk = (inboxId: string, items: Item[], newCategory: Category | null = null) => ({
  inboxId,
  result: 'ok' as const,
  message: null,
  newCategory,
  items,
})
const inboxFile = (id: string, extra: object = {}) => ({ ...validInbox, id, ...extra })
const planOf = (entries: PlanEntry[], over: Partial<PlanFile> = {}): PlanFile => ({
  now: PLAN_NOW,
  entries,
  events: entries.flatMap((e) =>
    e.items
      .filter((i) => i.schedule)
      .map((i) => ({
        itemId: i.id,
        title: i.title,
        start: i.schedule?.start ?? '',
        end: i.schedule?.start ?? '',
        description: '',
      })),
  ),
  errors: [],
  ...over,
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sb-anwenden-'))
  await writeJsonFile(dir, '.lauf/start.json', { startedAt: STARTED })
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const run = () => runAnwenden({ argv: ['--daten', dir, '--jetzt', NOW], env: {} })
const setup = async (plan: PlanFile, ids?: EventIdsFile, inboxIds: string[] = [ID_A]) => {
  for (const id of inboxIds) await writeJsonFile(dir, `inbox/${id}.json`, inboxFile(id))
  await writeJsonFile(dir, '.lauf/plan.json', plan)
  if (ids) await writeJsonFile(dir, '.lauf/termin-ids.json', ids)
}
const read = async (path: string) => (await readRepoFile(dir, path))?.data

describe('lauf:anwenden', () => {
  it('schreibt Items mit calendarEventId, löscht die Inbox-Datei und schreibt runs/last.json laut SPEC', async () => {
    await setup(planOf([entryOk(ID_A, [scheduled, unscheduled])]), {
      created: [{ itemId: scheduled.id, eventId: 'evt-1' }],
      failed: [],
    })
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(result.lines[0]).toBe(
      'ANGEWENDET: 1 einsortiert, 0 übersprungen, 0 Fehler, 0 Projekte angelegt',
    )
    expect(await read(`items/${scheduled.id}.json`)).toEqual({
      ...scheduled,
      schedule: { ...scheduled.schedule, calendarEventId: 'evt-1' },
    })
    expect(await read(`items/${ID_B}.json`)).toEqual(unscheduled)
    expect(existsSync(join(dir, `inbox/${ID_A}.json`))).toBe(false)
    expect(await read('runs/last.json')).toEqual({
      startedAt: STARTED,
      finishedAt: NOW,
      processed: 1,
      itemIds: [scheduled.id, ID_B],
      skipped: [],
      errors: [],
    })
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
  })

  it('schreibt mehrzeilige notes unverändert in items/', async () => {
    const withNotes: Item = {
      ...unscheduled,
      notes: 'Zeile 1.\n\nZeile 2 – mit Umlauten äöü.\nZeile 3',
    }
    await setup(planOf([entryOk(ID_A, [withNotes])]))
    expect((await run()).exitCode).toBe(0)
    expect(await read(`items/${ID_B}.json`)).toEqual(withNotes)
  })

  it('verarbeitet einen Eintrag ohne Items (nur entfallene Artikel)', async () => {
    await setup(planOf([entryOk(ID_A, [])]))
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, `inbox/${ID_A}.json`))).toBe(false)
    expect(await read('runs/last.json')).toEqual({
      startedAt: STARTED,
      finishedAt: NOW,
      processed: 1,
      itemIds: [],
      skipped: [],
      errors: [],
    })
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
  })

  it('speichert bei fehlgeschlagenem Termin schedule: null und meldet den Fehler', async () => {
    await setup(planOf([entryOk(ID_A, [scheduled])]), {
      created: [],
      failed: [{ itemId: scheduled.id, message: 'Kalender nicht erreichbar' }],
    })
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(await read(`items/${scheduled.id}.json`)).toMatchObject({ schedule: null })
    const last = (await read('runs/last.json')) as { errors: unknown[] }
    expect(last.errors).toEqual([
      {
        inboxId: ID_A,
        message:
          'Kalendertermin für „Krankenkasse anrufen“ konnte nicht angelegt werden: Kalender nicht erreichbar',
      },
    ])
  })

  it('behandelt eine fehlende Termin-ID wie einen fehlgeschlagenen Termin', async () => {
    await setup(planOf([entryOk(ID_A, [scheduled])]), { created: [], failed: [] })
    await run()
    expect(await read(`items/${scheduled.id}.json`)).toMatchObject({ schedule: null })
    const last = (await read('runs/last.json')) as { errors: { message: string }[] }
    expect(last.errors[0].message).toContain('konnte nicht angelegt werden')
  })

  it('verlangt termin-ids.json nur, wenn der Plan Termine hat', async () => {
    await setup(planOf([entryOk(ID_A, [scheduled])]))
    const missing = await run()
    expect(missing.exitCode).toBe(1)
    expect(missing.lines).toEqual(['.lauf/termin-ids.json fehlt.'])
    await rm(join(dir, '.lauf/plan.json'))
    await writeJsonFile(dir, '.lauf/plan.json', planOf([entryOk(ID_A, [unscheduled])]))
    expect((await run()).exitCode).toBe(0)
  })

  it('setzt sortError und erhält alle übrigen Felder der Inbox-Datei', async () => {
    await writeJsonFile(dir, `inbox/${ID_A}.json`, inboxFile(ID_A, { extra: { x: 1 } }))
    await writeJsonFile(
      dir,
      '.lauf/plan.json',
      planOf([
        {
          inboxId: ID_A,
          result: 'sortError',
          message: 'Kein freier Slot.',
          newCategory: null,
          items: [],
        },
      ]),
    )
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(await read(`inbox/${ID_A}.json`)).toEqual({
      ...validInbox,
      extra: { x: 1 },
      sortError: { message: 'Kein freier Slot.', at: NOW },
    })
    expect(await read('runs/last.json')).toMatchObject({
      processed: 0,
      itemIds: [],
      skipped: [{ inboxId: ID_A, message: 'Kein freier Slot.' }],
    })
  })

  const fitness: Category = {
    id: 'fitness',
    name: 'Fitness',
    kind: 'normal',
    order: 6,
    description: 'Sport',
  }
  const inFitness = { ...unscheduled, categoryId: 'fitness' }

  it('hängt eine neue Ablage an vorhandene categories.json an und erhält unbekannte Felder', async () => {
    const existing = {
      categories: [
        { id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: '', foo: 'bar' },
        { id: 'einkauf', name: 'Einkauf', kind: 'einkauf', order: 2, description: '' },
        { id: 'erledigt', name: 'Erledigt', kind: 'archiv', order: 3, description: '' },
      ],
      version: 7,
    }
    await writeJsonFile(dir, 'categories.json', existing)
    await setup(planOf([entryOk(ID_A, [inFitness], fitness)]))
    expect((await run()).exitCode).toBe(0)
    expect(await read('categories.json')).toEqual({
      ...existing,
      categories: [...existing.categories, fitness],
    })
  })

  it('legt categories.json mit Standardwerten plus neuer Ablage an, wenn sie fehlt', async () => {
    await setup(planOf([entryOk(ID_A, [inFitness], fitness)]))
    expect((await run()).exitCode).toBe(0)
    const data = (await read('categories.json')) as { categories: Category[] }
    expect(data.categories.map((c) => c.id)).toEqual([
      'privat',
      'arbeit',
      'einkauf',
      'erledigt',
      'fitness',
    ])
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
  })

  it('lässt einen Eintrag aus, dessen Inbox-Datei fehlt, und nennt angelegte Termin-IDs', async () => {
    await setup(
      planOf([entryOk(ID_A, [scheduled]), entryOk(ID_C, [unscheduled])]),
      { created: [{ itemId: scheduled.id, eventId: 'evt-9' }], failed: [] },
      [ID_C],
    )
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, `items/${scheduled.id}.json`))).toBe(false)
    const last = (await read('runs/last.json')) as {
      processed: number
      errors: { inboxId: string; message: string }[]
    }
    expect(last.processed).toBe(1)
    expect(last.errors).toHaveLength(1)
    expect(last.errors[0].inboxId).toBe(ID_A)
    expect(last.errors[0].message).toContain('nicht mehr im Eingangskorb')
    expect(last.errors[0].message).toContain('evt-9')
  })

  it('lässt einen Eintrag aus, dessen Item schon existiert', async () => {
    await writeJsonFile(dir, `items/${ID_B}.json`, unscheduled)
    await setup(planOf([entryOk(ID_A, [unscheduled])]))
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(existsSync(join(dir, `inbox/${ID_A}.json`))).toBe(true)
    expect(existsSync(join(dir, 'runs/last.json'))).toBe(false)
    expect(result.lines.join('\n')).toContain(`items/${ID_B}.json gibt es schon`)
  })

  it('schreibt nichts, wenn eine vom Lauf geschriebene Datei ungültig wäre (Exit 1)', async () => {
    const wrong = { ...unscheduled, categoryId: 'gibt-es-nicht' }
    await setup(planOf([entryOk(ID_A, [wrong])]))
    const result = await run()
    expect(result.exitCode).toBe(1)
    expect(result.lines.join('\n')).toContain('Ablage "gibt-es-nicht" existiert nicht')
    expect(existsSync(join(dir, `items/${ID_B}.json`))).toBe(false)
    expect(existsSync(join(dir, `inbox/${ID_A}.json`))).toBe(true)
    expect(existsSync(join(dir, 'runs/last.json'))).toBe(false)
  })

  it('wird von bereits vorhandenen Fehlern in anderen Dateien nicht blockiert', async () => {
    await writeJsonFile(dir, 'suggestions/20261017-093009-zz99.json', { id: 'kaputt' })
    await setup(planOf([entryOk(ID_A, [unscheduled])]), undefined)
    const result = await run()
    expect(result.exitCode).toBe(0)
    const last = (await read('runs/last.json')) as {
      errors: { inboxId: unknown; message: string }[]
    }
    expect(last.errors).toHaveLength(
      last.errors.filter((e) =>
        e.message.startsWith('Vorhandener Fehler: suggestions/20261017-093009-zz99.json: '),
      ).length,
    )
    expect(last.errors.length).toBeGreaterThan(0)
    expect(last.errors.every((e) => e.inboxId === null)).toBe(true)
  })

  it('übernimmt Plan-Fehler in errors, vor Termin-Fehlern', async () => {
    await setup(
      planOf([entryOk(ID_A, [scheduled])], {
        errors: [{ inboxId: ID_C, message: 'Plan-Hinweis' }],
      }),
      { created: [], failed: [{ itemId: scheduled.id, message: 'x' }] },
    )
    await run()
    const last = (await read('runs/last.json')) as { errors: { message: string }[] }
    expect(last.errors.map((e) => e.message.slice(0, 12))).toEqual(['Plan-Hinweis', 'Kalenderterm'])
  })

  it('meldet fehlende oder ungültige Zwischendateien mit Exit 1', async () => {
    const missing = await run()
    expect(missing.exitCode).toBe(1)
    expect(missing.lines).toEqual(['.lauf/plan.json fehlt.'])
    await writeJsonFile(dir, '.lauf/plan.json', { now: 'x' })
    expect((await run()).lines.join('\n')).toContain('.lauf/plan.json: ')
  })
})
