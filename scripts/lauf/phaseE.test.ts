// @vitest-environment node
// Vorhandene wichtige Aufgaben ohne Termin (SPEC §8.4 e, Aufgabe 36): start, planen, anwenden.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Item } from '../../src/data/types'
import { runAnwenden } from './anwenden'
import { readRepoFile, writeJsonFile } from './dataRepo'
import { isPlanFile, type CalendarEvent, type PlanFile } from './files'
import { validItem } from './fixtures'
import { buildPlan } from './plan'
import { runPlanen } from './planen'
import { runPruefen } from './pruefen'
import { runStart } from './start'

const NOW = '2026-10-17T09:35:00+02:00'
const SETTINGS = { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }
const ID_1 = '20261010-100000-a001'
const ID_2 = '20261011-100000-a002'
const ID_3 = '20261012-100000-a003'
const ID_4 = '20261013-100000-a004'
const INBOX_ID = '20261017-093000-n001'

const eItem = (id: string, patch: Partial<Item> = {}): Item => ({
  ...validItem,
  id,
  title: `Aufgabe ${id.slice(-4)}`,
  important: true,
  durationMin: null,
  schedule: null,
  createdAt: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T10:00:00+02:00`,
  ...patch,
})

const planEntryFor = (id: string): PlanFile => ({
  now: NOW,
  entries: [],
  events: [
    {
      itemId: id,
      title: 'Aufgabe',
      start: '2026-10-18T09:00:00+02:00',
      end: '2026-10-18T09:30:00+02:00',
      description: '',
    },
  ],
  errors: [],
  existing: [{ itemId: id, title: 'Aufgabe', start: '2026-10-18T09:00:00+02:00', durationMin: 30 }],
})

describe('buildPlan: Phase e', () => {
  const plan = (
    existingItems: Item[],
    decisions: unknown = { decisions: [] },
    events: CalendarEvent[] = [],
  ) => {
    const result = buildPlan({
      now: new Date(NOW),
      inbox:
        decisions === DECISION ? [{ id: INBOX_ID, createdAt: '2026-10-17T09:30:00+02:00' }] : [],
      decisions,
      events: { events },
      categories: [{ id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: '' }],
      settings: SETTINGS,
      existingItemIds: existingItems.map((i) => i.id),
      existingItems,
      newId: () => '20261017-093500-zzzz',
    })
    if (!result.ok) throw new Error(result.errors.join('; '))
    return result.plan
  }
  const DECISION = {
    decisions: [
      {
        inboxId: INBOX_ID,
        newCategory: null,
        items: [
          {
            type: 'aufgabe',
            title: 'Neu',
            notes: '',
            categoryId: 'privat',
            important: true,
            durationMin: 30,
            when: null,
          },
        ],
      },
    ],
  }

  it('plant ab Tagesanfang nach a–d: 15 Min. zuerst, Standard 30, ohne Überschneidung', () => {
    const items = [
      eItem(ID_1, { durationMin: 30 }),
      eItem(ID_2, { durationMin: 15 }),
      eItem(ID_3, { durationMin: null }),
    ]
    const busy = [
      { title: 'Block', start: '2026-10-18T09:30:00+02:00', end: '2026-10-18T10:00:00+02:00' },
    ]
    const result = plan(items, DECISION, busy)
    const existing = (id: string) => result.existing?.find((e) => e.itemId === id)
    expect(result.entries[0].items[0].schedule?.start).toBe('2026-10-18T09:00:00+02:00')
    expect(existing(ID_2)).toMatchObject({ start: '2026-10-18T10:00:00+02:00', durationMin: 15 })
    expect(existing(ID_1)).toMatchObject({ start: '2026-10-18T10:15:00+02:00', durationMin: 30 })
    expect(existing(ID_3)).toMatchObject({ start: '2026-10-18T10:45:00+02:00', durationMin: 30 })
    expect(result.events.map((e) => e.itemId)).toEqual(expect.arrayContaining([ID_1, ID_2, ID_3]))
    expect(isPlanFile(result)).toBe(true)
  })

  it('ignoriert erledigte, nicht wichtige, eingeplante Aufgaben und Notizen', () => {
    const items = [
      eItem(ID_1, { status: 'erledigt', completedAt: NOW }),
      eItem(ID_2, { important: false }),
      eItem(ID_3, { schedule: { start: '2026-10-19T09:00:00+02:00', durationMin: 30 } }),
      eItem(ID_4, { type: 'notiz' }),
    ]
    const result = plan(items)
    expect(result.existing).toBeUndefined()
    expect(result.events).toEqual([])
  })

  it('meldet fehlenden Slot in errors und lässt die Aufgabe unverändert', () => {
    const events = Array.from({ length: 15 }, (_, d) => {
      const day = new Date(Date.UTC(2026, 9, 18 + d)).toISOString().slice(0, 10)
      return {
        title: 'voll',
        start: `${day}T08:00:00+02:00`,
        end: `${day}T20:00:00+02:00`,
      }
    })
    const result = plan([eItem(ID_1)], { decisions: [] }, events)
    expect(result.existing).toBeUndefined()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].inboxId).toBeNull()
    expect(result.errors[0].message).toContain('Aufgabe a001')
  })
})

describe('Skripte mit Phase e', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sb-phase-e-'))
    await writeJsonFile(dir, 'settings.json', SETTINGS)
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const start = () => runStart({ argv: ['--daten', dir, '--jetzt', NOW, '--ohne-git'], env: {} })
  const planen = () => runPlanen({ argv: ['--daten', dir, '--jetzt', NOW], env: {} })
  const anwenden = () => runAnwenden({ argv: ['--daten', dir, '--jetzt', NOW], env: {} })
  const put = (item: unknown, id: string) => writeJsonFile(dir, `items/${id}.json`, item)
  const read = async (path: string) => (await readRepoFile(dir, path))?.data

  it('start: nur Phase-e-Aufgaben ⇒ ARBEIT mit Abschnitt, 15 Min. zuerst', async () => {
    await put(eItem(ID_1, { durationMin: 45, title: 'Lang' }), ID_1)
    await put(eItem(ID_2, { durationMin: 15, title: 'Kurz' }), ID_2)
    await put(eItem(ID_3, { title: 'Standard' }), ID_3)
    const result = await start()
    expect(result.exitCode).toBe(0)
    expect(result.lines[0]).toBe('ARBEIT 0')
    const at = result.lines.indexOf('Eingangskorb: leer')
    expect(at).toBeGreaterThan(0)
    expect(result.lines.slice(at + 1)).toEqual([
      'Einzuplanende Aufgaben (id | Titel | Dauer; keine Entscheidung nötig):',
      `- ${ID_2} | Kurz | 15 Min.`,
      `- ${ID_1} | Lang | 45 Min.`,
      `- ${ID_3} | Standard | 30 Min.`,
    ])
  })

  it('start: weder Inbox noch Phase e ⇒ LEER (erledigt/unwichtig/eingeplant/Notiz zählen nicht)', async () => {
    await put(eItem(ID_1, { status: 'erledigt', completedAt: NOW }), ID_1)
    await put(eItem(ID_2, { important: false }), ID_2)
    await put(
      eItem(ID_3, { schedule: { start: '2026-10-19T09:00:00+02:00', durationMin: 30 } }),
      ID_3,
    )
    await put(eItem(ID_4, { type: 'notiz' }), ID_4)
    expect((await start()).lines).toEqual(['LEER'])
  })

  it('anwenden: ergänzt schedule + calendarEventId, erhält unbekannte Felder, schreibt last.json', async () => {
    await put({ ...eItem(ID_1), unknownField: { x: 1 } }, ID_1)
    await writeJsonFile(dir, '.lauf/start.json', { startedAt: NOW })
    await writeJsonFile(dir, '.lauf/plan.json', planEntryFor(ID_1))
    await writeJsonFile(dir, '.lauf/termin-ids.json', {
      created: [{ itemId: ID_1, eventId: 'evt-1' }],
      failed: [],
    })
    const result = await anwenden()
    expect(result.exitCode).toBe(0)
    expect(await read(`items/${ID_1}.json`)).toEqual({
      ...eItem(ID_1),
      unknownField: { x: 1 },
      schedule: { start: '2026-10-18T09:00:00+02:00', durationMin: 30, calendarEventId: 'evt-1' },
      updatedAt: NOW,
    })
    expect(await read('runs/last.json')).toEqual({
      startedAt: NOW,
      finishedAt: NOW,
      processed: 0,
      itemIds: [ID_1],
      skipped: [],
      errors: [],
    })
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
  })

  it('anwenden: geänderte Aufgabe bleibt unangetastet, Fehler nennt den verwaisten Termin', async () => {
    const done = eItem(ID_1, { status: 'erledigt', completedAt: NOW })
    await put(done, ID_1)
    await writeJsonFile(dir, '.lauf/start.json', { startedAt: NOW })
    await writeJsonFile(dir, '.lauf/plan.json', planEntryFor(ID_1))
    await writeJsonFile(dir, '.lauf/termin-ids.json', {
      created: [{ itemId: ID_1, eventId: 'evt-9' }],
      failed: [],
    })
    const result = await anwenden()
    expect(result.exitCode).toBe(0)
    expect(await read(`items/${ID_1}.json`)).toEqual(done)
    expect(await read('runs/last.json')).toMatchObject({
      processed: 0,
      itemIds: [],
      errors: [{ inboxId: null, message: expect.stringContaining('evt-9') }],
    })
    expect(result.lines[0]).toContain('0 vorhandene Aufgaben eingeplant')
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
    expect(result.lines.join('\n')).toContain('evt-9')
    expect(result.lines.join('\n')).toContain('verwaist')
  })

  it('anwenden: schreibt last.json auch, wenn nur ein Hinweis aus dem Plan vorliegt', async () => {
    await put(eItem(ID_1), ID_1)
    await writeJsonFile(dir, '.lauf/start.json', { startedAt: NOW })
    await writeJsonFile(dir, '.lauf/plan.json', {
      now: NOW,
      entries: [],
      events: [],
      errors: [{ inboxId: null, message: 'Kein freier Slot für „Aufgabe a001“.' }],
    })
    expect((await anwenden()).exitCode).toBe(0)
    expect(await read('runs/last.json')).toMatchObject({
      processed: 0,
      itemIds: [],
      errors: [{ inboxId: null, message: 'Kein freier Slot für „Aufgabe a001“.' }],
    })
  })

  it('anwenden: nennt die Zahl eingeplanter vorhandener Aufgaben', async () => {
    await put(eItem(ID_1), ID_1)
    await writeJsonFile(dir, '.lauf/start.json', { startedAt: NOW })
    await writeJsonFile(dir, '.lauf/plan.json', planEntryFor(ID_1))
    await writeJsonFile(dir, '.lauf/termin-ids.json', {
      created: [{ itemId: ID_1, eventId: 'evt-2' }],
      failed: [],
    })
    expect((await anwenden()).lines[0]).toBe(
      'ANGEWENDET: 0 einsortiert, 0 übersprungen, 0 Fehler, 1 vorhandene Aufgaben eingeplant',
    )
  })

  it('Lauf mit leerer Inbox und einer Phase-e-Aufgabe läuft komplett durch', async () => {
    await put(eItem(ID_1, { durationMin: 15 }), ID_1)
    expect((await start()).lines[0]).toBe('ARBEIT 0')
    await writeJsonFile(dir, '.lauf/entscheidungen.json', { decisions: [] })
    await writeJsonFile(dir, '.lauf/termine.json', { events: [] })
    const planned = await planen()
    expect(planned.exitCode).toBe(0)
    expect(planned.lines.at(-1)).toBe('ANZULEGENDE TERMINE: 1')
    await writeJsonFile(dir, '.lauf/termin-ids.json', {
      created: [{ itemId: ID_1, eventId: 'trocken-1' }],
      failed: [],
    })
    expect((await anwenden()).exitCode).toBe(0)
    expect(await read(`items/${ID_1}.json`)).toMatchObject({
      schedule: {
        start: '2026-10-18T09:00:00+02:00',
        durationMin: 15,
        calendarEventId: 'trocken-1',
      },
    })
    expect(await read('runs/last.json')).toMatchObject({ processed: 0, itemIds: [ID_1] })
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
  })
})
