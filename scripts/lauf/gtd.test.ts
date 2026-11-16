// @vitest-environment node
// Claude-Lauf nach GTD (Aufgabe 97): start, planen, anwenden, pruefen mit Projekten und neuen Feldern.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Item, Project } from '../../src/data/types'
import { runAnwenden } from './anwenden'
import { readRepoFile, writeJsonFile } from './dataRepo'
import { validItem } from './fixtures'
import { runPlanen } from './planen'
import { runPruefen } from './pruefen'
import { runStart } from './start'

const NOW = '2026-10-17T09:35:00+02:00'
const SETTINGS = { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }
const INBOX_ID = '20261017-093000-n001'
const INBOX_ID_2 = '20261017-093100-n002'
const PROJECT_ID = '20261010-100000-p001'
const STEP_1 = '20261010-100100-s001'
const STEP_2 = '20261010-100200-s002'

const project = (patch: Partial<Project> = {}): Project => ({
  id: PROJECT_ID,
  title: 'Analysis 1',
  notes: 'Übungsblätter und Klausurvorbereitung',
  categoryId: 'arbeit',
  status: 'aktiv',
  series: [],
  createdAt: '2026-10-10T10:00:00+02:00',
  updatedAt: '2026-10-10T10:00:00+02:00',
  completedAt: null,
  v: 2,
  ...patch,
})

const step = (id: string, order: number, title: string, patch: Partial<Item> = {}): Item => ({
  ...validItem,
  id,
  title,
  schedule: null,
  important: false,
  durationMin: null,
  gtd: 'naechster-schritt',
  projectId: PROJECT_ID,
  projectOrder: order,
  v: 2,
  ...patch,
})

const inboxFile = (id: string, text: string, createdAt: string) => ({
  id,
  text,
  createdAt,
  source: 'text',
})

const decisionItem = (patch: Record<string, unknown>) => ({
  type: 'aufgabe',
  title: 'Aufgabe',
  notes: '',
  categoryId: 'privat',
  important: false,
  durationMin: null,
  when: null,
  plan: false,
  gtd: 'naechster-schritt',
  dueDate: null,
  projectId: null,
  ...patch,
})

describe('Lauf-Skripte nach GTD', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sb-gtd-'))
    await writeJsonFile(dir, 'settings.json', SETTINGS)
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const start = () => runStart({ argv: ['--daten', dir, '--jetzt', NOW, '--ohne-git'], env: {} })
  const planen = () => runPlanen({ argv: ['--daten', dir, '--jetzt', NOW], env: {} })
  const anwenden = () => runAnwenden({ argv: ['--daten', dir, '--jetzt', NOW], env: {} })
  const pruefen = () => runPruefen({ argv: ['--daten', dir], env: {} })
  const put = (path: string, data: unknown) => writeJsonFile(dir, path, data)
  const read = async (path: string) => (await readRepoFile(dir, path))?.data

  it('start: nur eine wichtige Aufgabe ohne Termin und leere Inbox ⇒ LEER', async () => {
    await put(`items/${STEP_1}.json`, step(STEP_1, 1, 'Wichtig', { important: true }))
    expect((await start()).lines).toEqual(['LEER'])
  })

  it('start: Inbox mit sortError ⇒ LEER; ohne ⇒ ARBEIT', async () => {
    const entry = inboxFile(INBOX_ID, 'Etwas', '2026-10-17T09:30:00+02:00')
    await put(`inbox/${INBOX_ID}.json`, {
      ...entry,
      sortError: { message: 'm', at: NOW },
    })
    expect((await start()).lines).toEqual(['LEER'])
    await put(`inbox/${INBOX_ID_2}.json`, { ...entry, id: INBOX_ID_2 })
    expect((await start()).lines[0]).toBe('ARBEIT 1')
  })

  it('start: gibt aktive Projekte mit gekürzter Notiz und offenen Schritten aus', async () => {
    await put(`inbox/${INBOX_ID}.json`, inboxFile(INBOX_ID, 'Etwas', '2026-10-17T09:30:00+02:00'))
    await put(`projects/${PROJECT_ID}.json`, project({ notes: `${'x'.repeat(250)}\nZeile 2` }))
    await put(
      `projects/20261011-100000-p002.json`,
      project({ id: '20261011-100000-p002', status: 'erledigt' }),
    )
    await put(`items/${STEP_2}.json`, step(STEP_2, 2, 'Zweiter Schritt'))
    await put(`items/${STEP_1}.json`, step(STEP_1, 1, 'Erster Schritt'))
    await put(
      `items/20261010-100300-s003.json`,
      step('20261010-100300-s003', 3, 'Erledigt', { status: 'erledigt', completedAt: NOW }),
    )
    const lines = (await start()).lines
    const at = lines.findIndex((l) => l.startsWith('Aktive Projekte ('))
    expect(at).toBeGreaterThan(0)
    expect(lines.slice(at + 1)).toEqual([
      `- ${PROJECT_ID} | Analysis 1 | arbeit | ${'x'.repeat(200)}…`,
      '    Schritt: Erster Schritt',
      '    Schritt: Zweiter Schritt',
    ])
    expect(lines.join('\n')).not.toContain('Einzuplanende Aufgaben')
  })

  it('start: ohne Projekte steht „Aktive Projekte: keine“', async () => {
    await put(`inbox/${INBOX_ID}.json`, inboxFile(INBOX_ID, 'Etwas', '2026-10-17T09:30:00+02:00'))
    expect((await start()).lines).toContain('Aktive Projekte: keine')
  })

  it('Lauf mit neuem Projekt und Schritt zu bestehendem Projekt läuft komplett durch', async () => {
    await put(
      `inbox/${INBOX_ID}.json`,
      inboxFile(INBOX_ID, 'Neues Projekt Umzug: Kisten besorgen', '2026-10-17T09:30:00+02:00'),
    )
    await put(
      `inbox/${INBOX_ID_2}.json`,
      inboxFile(INBOX_ID_2, 'Übungsblatt 5 abgeben', '2026-10-17T09:31:00+02:00'),
    )
    await put(`projects/${PROJECT_ID}.json`, project())
    await put(`items/${STEP_1}.json`, step(STEP_1, 1, 'Blatt 4'))
    expect((await start()).lines[0]).toBe('ARBEIT 2')
    await put('.lauf/entscheidungen.json', {
      decisions: [
        {
          inboxId: INBOX_ID,
          newCategory: null,
          newProject: {
            title: 'Umzug',
            notes: 'Neues Projekt Umzug: Kisten besorgen',
            categoryId: 'privat',
          },
          items: [decisionItem({ title: 'Kisten besorgen', projectId: '@neu' })],
        },
        {
          inboxId: INBOX_ID_2,
          newCategory: null,
          items: [
            decisionItem({
              title: 'Übungsblatt 5 abgeben',
              categoryId: 'arbeit',
              projectId: PROJECT_ID,
              durationMin: 2,
              when: { date: '2026-10-23', time: null },
            }),
          ],
        },
      ],
    })
    await put('.lauf/termine.json', { events: [] })
    const planned = await planen()
    expect(planned.exitCode, planned.lines.join('\n')).toBe(0)
    expect(planned.lines.at(-1)).toBe('ANZULEGENDE TERMINE: 0')
    expect(planned.lines.join('\n')).toContain('Neues Projekt „Umzug“')

    const applied = await anwenden()
    expect(applied.exitCode, applied.lines.join('\n')).toBe(0)
    expect(applied.lines[0]).toBe(
      'ANGEWENDET: 2 einsortiert, 0 übersprungen, 0 Fehler, 1 Projekte angelegt',
    )

    const last = (await read('runs/last.json')) as { projectIds: string[]; itemIds: string[] }
    expect(last.projectIds).toHaveLength(1)
    const created = (await read(`projects/${last.projectIds[0]}.json`)) as Project
    expect(created).toMatchObject({
      title: 'Umzug',
      notes: 'Neues Projekt Umzug: Kisten besorgen',
      categoryId: 'privat',
      status: 'aktiv',
      series: [],
      v: 2,
    })
    const first = (await read(`items/${INBOX_ID}.json`)) as Item
    expect(first).toMatchObject({ projectId: created.id, projectOrder: 1, v: 2 })
    const second = (await read(`items/${INBOX_ID_2}.json`)) as Item
    expect(second).toMatchObject({
      projectId: PROJECT_ID,
      projectOrder: 2,
      categoryId: 'arbeit',
      durationMin: 2,
      schedule: null,
      dueDate: '2026-10-23',
      gtd: 'naechster-schritt',
    })
    expect(await read(`inbox/${INBOX_ID}.json`)).toBeUndefined()
    expect((await pruefen()).exitCode).toBe(0)
  })

  it('planen: wichtig ohne plan erzeugt keinen Termin und kein plan.json-Event', async () => {
    await put(`inbox/${INBOX_ID}.json`, inboxFile(INBOX_ID, 'Wichtig: Steuer', NOW))
    await put('.lauf/entscheidungen.json', {
      decisions: [
        {
          inboxId: INBOX_ID,
          newCategory: null,
          items: [decisionItem({ title: 'Steuer', important: true })],
        },
      ],
    })
    await put('.lauf/termine.json', { events: [] })
    expect((await planen()).lines.at(-1)).toBe('ANZULEGENDE TERMINE: 0')
    const plan = (await read('.lauf/plan.json')) as {
      events: unknown[]
      entries: { items: Item[] }[]
    }
    expect(plan.events).toEqual([])
    expect(plan.entries[0].items[0]).toMatchObject({ important: true, schedule: null })
  })

  it('planen: gtd "warten" ohne waiting liefert eine verständliche Meldung (Exit 1)', async () => {
    await put(`inbox/${INBOX_ID}.json`, inboxFile(INBOX_ID, 'Warte auf Becker', NOW))
    await put('.lauf/entscheidungen.json', {
      decisions: [
        {
          inboxId: INBOX_ID,
          newCategory: null,
          items: [decisionItem({ title: 'Antwort Becker', gtd: 'warten' })],
        },
      ],
    })
    await put('.lauf/termine.json', { events: [] })
    const result = await planen()
    expect(result.exitCode).toBe(1)
    expect(result.lines.join('\n')).toContain('"waiting"')
  })

  it('anwenden: lässt einen Eintrag aus, dessen Projekt inzwischen fehlt', async () => {
    await put(`inbox/${INBOX_ID}.json`, inboxFile(INBOX_ID, 'Schritt', NOW))
    await put(`projects/${PROJECT_ID}.json`, project())
    await put('.lauf/start.json', { startedAt: NOW, inboxIds: [INBOX_ID] })
    await put('.lauf/entscheidungen.json', {
      decisions: [
        {
          inboxId: INBOX_ID,
          newCategory: null,
          items: [decisionItem({ projectId: PROJECT_ID })],
        },
      ],
    })
    await put('.lauf/termine.json', { events: [] })
    expect((await planen()).exitCode).toBe(0)
    await put(`projects/${PROJECT_ID}.json`, project({ status: 'erledigt' }))
    const result = await anwenden()
    expect(result.exitCode).toBe(0)
    expect(result.lines.join('\n')).toContain('gibt es nicht mehr oder es ist abgeschlossen')
    expect(await read(`items/${INBOX_ID}.json`)).toBeUndefined()
  })

  describe('lauf:pruefen', () => {
    it('akzeptiert projects/ und Einträge mit neuen Feldern', async () => {
      await put(`projects/${PROJECT_ID}.json`, {
        ...project(),
        unbekannt: { x: 1 },
        series: [{ id: 's1', irgendwas: true }],
      })
      await put(
        `items/${STEP_1}.json`,
        step(STEP_1, 1, 'Warten', {
          gtd: 'warten',
          waiting: { person: 'Becker', since: '2026-10-10', followUpOn: null },
          dueDate: '2026-10-30',
        }),
      )
      expect(await pruefen()).toEqual({ exitCode: 0, lines: ['OK (3 Dateien)'] })
    })

    it('meldet ein ungültiges Projekt', async () => {
      await put(`projects/${PROJECT_ID}.json`, { ...project(), status: 'offen', title: '' })
      const result = await pruefen()
      expect(result.exitCode).toBe(1)
      expect(result.lines.join('\n')).toContain(`projects/${PROJECT_ID}.json: Feld "status"`)
      expect(result.lines.join('\n')).toContain('Feld "title"')
    })

    it('meldet Projekt mit unbekannter Ablage', async () => {
      await put(`projects/${PROJECT_ID}.json`, project({ categoryId: 'gibtsnicht' }))
      expect((await pruefen()).lines.join('\n')).toContain('Ablage "gibtsnicht" existiert nicht')
    })

    it('meldet neue Item-Felder mit falschem Typ und durationMin 0', async () => {
      await put(`items/${STEP_1}.json`, {
        ...step(STEP_1, 1, 'Kaputt'),
        gtd: 'bald',
        dueDate: '30.10.',
        waiting: { person: 5 },
        durationMin: 0,
      })
      const text = (await pruefen()).lines.join('\n')
      expect(text).toContain('Feld "gtd" ist ungültig')
      expect(text).toContain('Feld "dueDate" ist ungültig')
      expect(text).toContain('Feld "waiting" ist ungültig')
      expect(text).toContain('Feld "durationMin" ist ungültig')
    })
  })
})
