// @vitest-environment node
// Testsatz 2 (docs/sortier-tests-2.md): Titel und Notiz (SPEC §8.3.4).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeJsonFile } from './dataRepo'
import type { DecisionItem, DecisionsFile } from './files'
import { runPlanen } from './planen'
import { runPruefen } from './pruefen'
import { runStart } from './start'
import { runTestdaten } from './testdaten'
import { inboxIdOf, loadTestSpec, testSetFromArgs } from './testspec'
import { runVergleich } from './vergleich'

const spec = loadTestSpec(undefined, 2)

const item = (patch: Partial<DecisionItem> & Pick<DecisionItem, 'title'>): DecisionItem => ({
  type: 'aufgabe',
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

const IDEAL: Record<number, DecisionItem> = {
  1: item({
    title: 'Fotobuch für Oma',
    type: 'notiz',
    notes:
      'Idee für den Geburtstag von Oma: ich könnte ein Fotobuch mit den Bildern der letzten Jahre machen. Außerdem wäre es schön, wenn alle Cousins einen kurzen Gruß aufschreiben. Wir müssten die Bilder bis Mitte November gesammelt haben, damit die Druckerei genug Zeit hat. Vielleicht kann Lena die Gestaltung übernehmen, sie hat damit schon Erfahrung. Die Kosten sollten bei etwa 40 Euro liegen.',
  }),
  2: item({
    title: 'Umzug vorbereiten',
    notes: 'Kartons im Keller holen\nBücher aussortieren\nMietvertrag für den Vermieter kopieren',
  }),
  3: item({
    title: 'Besprechung mit Dr. Weber',
    type: 'termin',
    categoryId: 'studium',
    notes:
      'Institut für Statistik, Raum 2.14, bitte den Zwischenbericht und die Simulationsergebnisse ausgedruckt mitbringen (Dr. Weber)',
    when: { date: '2026-10-30', time: '15:00' },
  }),
  4: item({ title: 'Wohnung putzen' }),
  5: item({
    title: 'Buchtipps',
    type: 'notiz',
    notes: 'Der Schwarm\nSapiens\nProjekt Hail Mary',
  }),
  6: item({ title: 'Milch', type: 'notiz', categoryId: 'einkauf' }),
  7: item({
    title: 'Klingel melden',
    notes:
      'Bei der Hausverwaltung wegen der kaputten Klingel im dritten Stock nachfragen und einen Reparaturtermin vereinbaren',
  }),
  8: item({ title: 'Fahrradreifen aufpumpen' }),
  9: item({ title: 'Kleiderschrank ausmisten', important: true, plan: true, durationMin: 120 }),
  10: item({ title: 'Auto waschen', plan: true, when: { date: '2026-10-24', time: null } }),
  11: item({
    title: 'Mittagessen mit Anna',
    type: 'termin',
    when: { date: '2026-10-26', time: '12:15' },
  }),
  12: item({
    title: 'Paket abholen',
    durationMin: 15,
    plan: true,
    when: { date: '2026-10-23', time: null },
  }),
  13: item({
    title: 'Konzept für das Seminar schreiben',
    categoryId: 'studium',
    durationMin: 420,
    plan: true,
    when: { date: '2026-10-27', time: null },
  }),
  14: item({ title: 'Wäsche waschen', plan: true, when: { date: '2026-10-26', time: null } }),
}

const ideal = (): DecisionsFile => ({
  decisions: spec.cases.map((c) => ({
    inboxId: inboxIdOf(c.nr),
    newCategory: null,
    items: [structuredClone(IDEAL[c.nr])],
  })),
})

let dir: string
beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'sb-satz2-')), 'daten')
  expect((await runTestdaten({ argv: ['--ziel', dir, '--satz', '2'] })).exitCode).toBe(0)
})
afterEach(() => rm(join(dir, '..'), { recursive: true, force: true }))

const planWith = async (decisions: DecisionsFile): Promise<void> => {
  await writeJsonFile(dir, '.lauf/entscheidungen.json', decisions)
  const result = await runPlanen({ argv: ['--daten', dir, '--jetzt', spec.now], env: {} })
  expect(result.lines.join('\n')).not.toContain('✗')
  expect(result.exitCode).toBe(0)
}
const compare = () => runVergleich({ argv: ['--daten', dir, '--satz', '2'], env: {} })
const failedLine = (lines: string[], nr: number): string =>
  lines.find((l) => l.startsWith(`✗ ${nr}`)) ?? ''

describe('Testsatz 2', () => {
  it('liest --satz (Standard 1, ungültig = null)', () => {
    expect(testSetFromArgs([])).toBe(1)
    expect(testSetFromArgs(['--satz', '2'])).toBe(2)
    expect(testSetFromArgs(['--satz', '3'])).toBe(3)
    expect(testSetFromArgs(['--satz', '9'])).toBeNull()
  })

  it('hat höchstens 29 Fälle', () => {
    expect(spec.cases.length).toBeLessThanOrEqual(29)
    expect(spec.cases.length).toBeGreaterThanOrEqual(4)
  })

  it('lauf:testdaten --satz 2 erzeugt einen gültigen Ordner, den lauf:start liest', async () => {
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
    const start = await runStart({
      argv: ['--daten', dir, '--ohne-git', '--jetzt', spec.now],
      env: {},
    })
    expect(start.lines[0]).toBe(`ARBEIT ${spec.cases.length}`)
    expect(start.lines).toContain(spec.cases[1].text)
  })

  it('lauf:testdaten verweigert ungültiges --satz', async () => {
    const result = await runTestdaten({ argv: ['--ziel', join(dir, '..', 'x'), '--satz', '9'] })
    expect(result.exitCode).toBe(1)
  })

  it('lauf:vergleich --satz 2 besteht mit den idealen Entscheidungen', async () => {
    await planWith(ideal())
    const result = await compare()
    expect(result.lines.at(-1)).toBe(`ERGEBNIS: ${spec.cases.length}/${spec.cases.length}`)
    expect(result.exitCode).toBe(0)
  })

  it('meldet einen zu langen Titel (titleMaxLen)', async () => {
    const d = ideal()
    d.decisions[0].items[0].title = 'x'.repeat(61)
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(failedLine(result.lines, 1)).toContain('Titel 61 Zeichen statt höchstens 60')
  })

  it('meldet fehlende Teile in der Notiz (notesContains), ohne Groß-/Kleinschreibung zu verlangen', async () => {
    const d = ideal()
    d.decisions[1].items[0].notes = 'KARTONS IM KELLER HOLEN\nBücher aussortieren'
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    const line = failedLine(result.lines, 2)
    expect(line).toContain('Notiz enthält nicht „Mietvertrag für den Vermieter kopieren“')
    expect(line).not.toContain('Notiz enthält nicht „Kartons')
  })

  it('normalisiert Zeilenumbrüche und Leerzeichen in der Notiz', async () => {
    const d = ideal()
    d.decisions[1].items[0].notes =
      'Kartons   im Keller\nholen\n\nBücher aussortieren\nMietvertrag für den Vermieter kopieren'
    await planWith(d)
    expect((await compare()).exitCode).toBe(0)
  })

  it('meldet eine Notiz, die leer sein sollte (notesEmpty)', async () => {
    const d = ideal()
    d.decisions[3].items[0].notes = 'Wohnung putzen'
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(failedLine(result.lines, 4)).toContain('Notiz nicht leer')
  })

  it('Fall 14: die Serien-Vorkommen stehen in der Ausgangslage, der Block beginnt 10:30', async () => {
    await planWith(ideal())
    expect((await compare()).exitCode).toBe(0)
    const events = spec.events.filter((e) => e.recurringEventId === 'vorlesung')
    expect(events.map((e) => e.start?.slice(0, 10))).toEqual([
      '2026-10-26',
      '2026-10-28',
      '2026-11-02',
      '2026-11-04',
    ])
  })

  it('Fall 14: ohne Berücksichtigung der Serie (Block 09:00) schlägt der Vergleich fehl', async () => {
    const d = ideal()
    d.decisions[13].items[0].when = { date: '2026-10-26', time: '09:00' }
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(failedLine(result.lines, 14)).toContain('Zeit 2026-10-26T09:00')
  })

  it('meldet einen als Termin falsch eingeplanten Fall weiterhin (Zeit)', async () => {
    const d = ideal()
    d.decisions[2].items[0].when = { date: '2026-10-30', time: '16:00' }
    await planWith(d)
    expect(failedLine((await compare()).lines, 3)).toContain('Zeit 2026-10-30T16:00')
  })
})
