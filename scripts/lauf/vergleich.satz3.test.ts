// @vitest-environment node
// Testsatz 3 (docs/sortier-tests-3.md): GTD-Regeln der Phase 9 (SPEC §8.3, §8.4).
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readRepoFile, writeJsonFile } from './dataRepo'
import type { DecisionsFile } from './files'
import { runPlanen } from './planen'
import { runPruefen } from './pruefen'
import { idealDecisionsSatz3 } from './sortierFixtures'
import { runStart } from './start'
import { runTestdaten } from './testdaten'
import { existingProjectIdOf, inboxIdOf, loadTestSpec } from './testspec'
import { runVergleich } from './vergleich'

const spec = loadTestSpec(undefined, 3)

let dir: string
beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'sb-satz3-')), 'daten')
  expect((await runTestdaten({ argv: ['--ziel', dir, '--satz', '3'] })).exitCode).toBe(0)
})
afterEach(() => rm(join(dir, '..'), { recursive: true, force: true }))

const planWith = async (decisions: DecisionsFile): Promise<void> => {
  await writeJsonFile(dir, '.lauf/entscheidungen.json', decisions)
  const result = await runPlanen({ argv: ['--daten', dir, '--jetzt', spec.now], env: {} })
  expect(result.lines.join('\n')).not.toContain('✗')
  expect(result.exitCode).toBe(0)
}
const compare = () => runVergleich({ argv: ['--daten', dir, '--satz', '3'], env: {} })
const failedLine = (lines: string[], nr: number): string =>
  lines.find((l) => l.startsWith(`✗ ${nr} `)) ?? ''
const decisionOf = (d: DecisionsFile, nr: number) => {
  const found = d.decisions.find((x) => x.inboxId === inboxIdOf(nr))
  if (!found) throw new Error('Fall fehlt')
  return found
}

describe('Testsatz 3: Testdaten', () => {
  it('hat mindestens 10 Fälle und deckt die vorgegebenen Szenarien ab', () => {
    expect(spec.cases.length).toBeGreaterThanOrEqual(10)
    const text = spec.cases.map((c) => c.text).join('\n')
    for (const part of ['Jonas', 'Vermieterin', 'Spanisch', 'Fahrrad', 'Wohnung renovieren']) {
      expect(text).toContain(part)
    }
  })

  it('legt Projekte und Schritte an, die lauf:pruefen akzeptiert', async () => {
    const analysis = await readRepoFile(dir, `projects/${existingProjectIdOf(0)}.json`)
    expect(analysis?.data).toMatchObject({
      title: 'Analysis 1',
      categoryId: 'studium',
      status: 'aktiv',
    })
    const move = await readRepoFile(dir, `projects/${existingProjectIdOf(1)}.json`)
    expect(move?.data).toMatchObject({ title: 'Umzug', categoryId: 'privat', status: 'aktiv' })
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
  })

  it('lauf:start nennt Ablagen „Studium“ und „Privat“ sowie beide Projekte mit Schritt', async () => {
    const start = await runStart({
      argv: ['--daten', dir, '--ohne-git', '--jetzt', spec.now],
      env: {},
    })
    expect(start.lines[0]).toBe(`ARBEIT ${spec.cases.length}`)
    const lines = start.lines.join('\n')
    expect(lines).toContain(`${existingProjectIdOf(0)} | Analysis 1 | studium`)
    expect(lines).toContain(`${existingProjectIdOf(1)} | Umzug | privat`)
    expect(lines).toContain('Schritt: Übungsblatt 3 lösen')
  })
})

describe('Testsatz 3: lauf:vergleich', () => {
  it('besteht mit den idealen Entscheidungen', async () => {
    await planWith(idealDecisionsSatz3(spec))
    const result = await compare()
    expect(result.lines.at(-1)).toBe(`ERGEBNIS: ${spec.cases.length}/${spec.cases.length}`)
    expect(result.exitCode).toBe(0)
  })

  it('meldet einen falschen Status (gtd)', async () => {
    const d = idealDecisionsSatz3(spec)
    decisionOf(d, 3).items[0].gtd = 'naechster-schritt'
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(failedLine(result.lines, 3)).toContain('Status naechster-schritt statt irgendwann')
  })

  it('meldet eine falsche Person und ein fehlendes Nachhaken (waiting)', async () => {
    const d = idealDecisionsSatz3(spec)
    const waiting = decisionOf(d, 2).items[0].waiting
    if (!waiting) throw new Error('waiting fehlt')
    waiting.person = 'Herr Meier'
    waiting.followUpOn = null
    await planWith(d)
    const line = failedLine((await compare()).lines, 2)
    expect(line).toContain('wartet auf „Herr Meier“ statt „Vermieterin“')
    expect(line).toContain('Nachhaken nie statt 2026-10-23')
  })

  it('erkennt, dass „warten“ erwartet, aber „nächster Schritt“ geliefert wurde', async () => {
    const d = idealDecisionsSatz3(spec)
    const first = decisionOf(d, 1).items[0]
    first.gtd = 'naechster-schritt'
    first.waiting = null
    await planWith(d)
    const line = failedLine((await compare()).lines, 1)
    expect(line).toContain('Status naechster-schritt statt warten')
    expect(line).toContain('wartet nicht statt auf Jonas')
  })

  it('meldet eine Frist bei „Nachhaken“ (kein Fälligkeitsdatum)', async () => {
    const d = idealDecisionsSatz3(spec)
    decisionOf(d, 2).items[0].dueDate = '2026-10-23'
    await planWith(d)
    expect(failedLine((await compare()).lines, 2)).toContain('fällig 2026-10-23 statt nie')
  })

  it('meldet eine falsche Frist (dueDate)', async () => {
    const d = idealDecisionsSatz3(spec)
    decisionOf(d, 8).items[0].dueDate = '2026-10-24'
    await planWith(d)
    expect(failedLine((await compare()).lines, 8)).toContain('fällig 2026-10-24 statt 2026-10-23')
  })

  it('meldet einen Termin bei „wichtig“ (Fokus plant nichts ein)', async () => {
    const d = idealDecisionsSatz3(spec)
    const item = decisionOf(d, 8).items[0]
    item.plan = true
    item.when = { date: '2026-10-23', time: null }
    await planWith(d)
    expect(failedLine((await compare()).lines, 8)).toContain('statt kein Termin')
  })

  it('meldet ein falsches vorhandenes Projekt und ein Projekt bei unklarem Satz', async () => {
    const d = idealDecisionsSatz3(spec)
    decisionOf(d, 6).items[0].projectId = existingProjectIdOf(1)
    decisionOf(d, 13).items[0].projectId = existingProjectIdOf(0)
    decisionOf(d, 13).items[0].categoryId = 'studium'
    await planWith(d)
    const lines = (await compare()).lines
    expect(failedLine(lines, 6)).toContain(
      `Projekt ${existingProjectIdOf(1)} statt ${existingProjectIdOf(0)}`,
    )
    expect(failedLine(lines, 13)).toContain(`Projekt ${existingProjectIdOf(0)} statt keins`)
  })

  it('meldet ein fehlendes neues Projekt bzw. ein unerwartetes', async () => {
    const d = idealDecisionsSatz3(spec)
    const fifth = decisionOf(d, 5)
    fifth.newProject = null
    fifth.items[0].projectId = null
    const seventh = decisionOf(d, 7)
    seventh.newProject = { title: 'Kartons', notes: 'Umzugsfirma nach Preisen fragen', categoryId: 'privat' }
    seventh.items[0].projectId = '@neu'
    await planWith(d)
    const lines = (await compare()).lines
    expect(failedLine(lines, 5)).toContain('neues Projekt fehlt')
    expect(failedLine(lines, 7)).toContain('unerwartetes neues Projekt „Kartons“')
  })

  it('prüft Titel, Ablage und Notiz des neuen Projekts', async () => {
    const d = idealDecisionsSatz3(spec)
    const project = decisionOf(d, 5).newProject
    if (!project) throw new Error('newProject fehlt')
    project.title = 'x'.repeat(61)
    project.categoryId = 'studium'
    project.notes = 'Wände streichen'
    await planWith(d)
    const line = failedLine((await compare()).lines, 5)
    expect(line).toContain('Projekttitel 61 Zeichen statt höchstens 60')
    expect(line).toContain('Projekt-Ablage studium statt privat')
    expect(line).toContain('Projektnotiz enthält nicht')
  })

  it('meldet eine zu lange Dauer bei „Link schicken“ (≤ 2 Min.)', async () => {
    const d = idealDecisionsSatz3(spec)
    decisionOf(d, 12).items[0].durationMin = 15
    await planWith(d)
    expect(failedLine((await compare()).lines, 12)).toContain('Dauer 15 statt 1–2')
  })

  it('meldet einen falsch eingeplanten Block (Fall 9: Sprachkurs belegt 09:00–10:30)', async () => {
    const d = idealDecisionsSatz3(spec)
    d.decisions[8].items[0].when = { date: '2026-10-22', time: '09:00' }
    await planWith(d)
    expect(failedLine((await compare()).lines, 9)).toContain('Zeit 2026-10-22T09:00')
  })
})
