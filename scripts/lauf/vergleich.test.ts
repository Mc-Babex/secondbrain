// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAnwenden } from './anwenden'
import { readCategories, readRepoFile, writeJsonFile } from './dataRepo'
import { isPlanFile, type DecisionsFile, type PlanFile } from './files'
import { runPlanen } from './planen'
import { runPruefen } from './pruefen'
import { idealDecisions } from './sortierFixtures'
import { runStart } from './start'
import { runTestdaten } from './testdaten'
import { inboxIdOf, loadTestSpec } from './testspec'
import { diffCase, runVergleich } from './vergleich'

const spec = loadTestSpec()
let dir: string
beforeEach(async () => {
  dir = join(await mkdtemp(join(tmpdir(), 'sb-trocken-')), 'daten')
  expect((await runTestdaten({ argv: ['--ziel', dir] })).exitCode).toBe(0)
})
afterEach(() => rm(join(dir, '..'), { recursive: true, force: true }))

const plan = () => runPlanen({ argv: ['--daten', dir, '--jetzt', spec.now], env: {} })
const compare = () => runVergleich({ argv: ['--daten', dir], env: {} })

async function planWith(decisions: DecisionsFile): Promise<void> {
  await writeJsonFile(dir, '.lauf/entscheidungen.json', decisions)
  expect((await plan()).exitCode).toBe(0)
}

describe('lauf:testdaten', () => {
  it('erzeugt einen Ordner, den lauf:pruefen akzeptiert und lauf:start mit ARBEIT 29 liest', async () => {
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
    const start = await runStart({
      argv: ['--daten', dir, '--ohne-git', '--jetzt', spec.now],
      env: {},
    })
    expect(start.exitCode).toBe(0)
    expect(start.lines[0]).toBe('ARBEIT 29')
  })

  it('legt Termine, Fallzuordnung und Kopien an', async () => {
    const events = await readRepoFile(dir, '.lauf/termine.json')
    expect(events?.data).toEqual({ events: spec.events })
    const map = await readRepoFile(dir, '.lauf/testfaelle.json')
    expect(map?.data).toMatchObject({
      cases: expect.arrayContaining([{ inboxId: inboxIdOf(7), nr: 7 }]),
    })
    expect(existsSync(join(dir, '.testdaten/termine.json'))).toBe(true)
  })

  it('verweigert einen nicht leeren Zielordner und fehlendes --ziel', async () => {
    expect((await runTestdaten({ argv: ['--ziel', dir] })).exitCode).toBe(1)
    expect((await runTestdaten({ argv: [] })).exitCode).toBe(1)
  })

  it('legt umbenannte und eigene Ablagen sowie vorhandene Artikel an', async () => {
    const categories = (await readCategories(dir)).categories
    expect(categories.find((c) => c.id === 'studium')).toMatchObject({
      name: 'Uni',
      description: 'Vorlesungen, Hausarbeiten, Prüfungen',
    })
    expect(categories.find((c) => c.id === 'garten')).toMatchObject({ name: 'Garten' })
    const butter = await readRepoFile(dir, 'items/20261020-090000-e001.json')
    expect(butter?.data).toMatchObject({ title: 'Butter', categoryId: 'einkauf', checked: true })
  })

  it('lauf:start nennt umbenannte und eigene Ablage mit ID, Name und Beschreibung', async () => {
    const start = await runStart({
      argv: ['--daten', dir, '--ohne-git', '--jetzt', spec.now],
      env: {},
    })
    expect(start.lines).toContain('- studium | Uni | normal | Vorlesungen, Hausarbeiten, Prüfungen')
    expect(start.lines).toContain('- garten | Garten | normal | Balkon, Pflanzen, Rasen')
  })

  it('gibt den Befehl für den Trockenlauf mit --jetzt aus', async () => {
    const other = join(dir, '..', 'zweiter')
    const result = await runTestdaten({ argv: ['--ziel', other] })
    expect(result.lines.join('\n')).toContain(`--ohne-git --jetzt ${spec.now}`)
  })
})

describe('lauf:vergleich', () => {
  it('meldet 29/29 mit den idealen Entscheidungen, auch nach lauf:start', async () => {
    await runStart({ argv: ['--daten', dir, '--ohne-git', '--jetzt', spec.now], env: {} })
    // lauf:start hat .lauf/ geleert; Termine liegen als Kopie im Testordner.
    const backup = await readRepoFile(dir, '.testdaten/termine.json')
    await writeJsonFile(dir, '.lauf/termine.json', backup?.data)
    await planWith(idealDecisions(spec))
    const result = await compare()
    expect(result.lines.at(-1)).toBe('ERGEBNIS: 29/29')
    expect(result.exitCode).toBe(0)
    expect(result.lines[0]).toBe('✓ 1')
  })

  const ideal = (): DecisionsFile => idealDecisions(spec)
  const decisionOf = (d: DecisionsFile, nr: number) => {
    const found = d.decisions.find((x) => x.inboxId === inboxIdOf(nr))
    if (!found) throw new Error('Fall fehlt')
    return found
  }

  it('erkennt eine falsche Ablage', async () => {
    const d = ideal()
    decisionOf(d, 7).items[0].categoryId = 'studium'
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.find((l) => l.startsWith('✗ 7'))).toContain('Ablage studium statt arbeit')
    expect(result.lines.at(-1)).toBe('ERGEBNIS: 28/29')
  })

  it('erkennt eine falsche Zeit (Termin um eine Stunde verschoben)', async () => {
    const d = ideal()
    decisionOf(d, 4).items[0].when = { date: '2026-10-22', time: '10:00' }
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.find((l) => l.startsWith('✗ 4'))).toContain('Zeit 2026-10-22T10:00')
  })

  it('erkennt einen fehlenden sortError (Fall 11 einsortiert)', async () => {
    const d = ideal()
    decisionOf(d, 11).items[0].when = null
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.find((l) => l.startsWith('✗ 11'))).toContain('kein sortError')
  })

  async function editPlan(change: (plan: PlanFile) => void): Promise<void> {
    await planWith(ideal())
    const file = await readRepoFile(dir, '.lauf/plan.json')
    if (!file || !isPlanFile(file.data)) throw new Error('plan.json fehlt')
    change(file.data)
    await writeJsonFile(dir, '.lauf/plan.json', file.data)
  }

  it('meldet einen doppelten Plan-Eintrag trotz lauter ✓', async () => {
    await editPlan((plan) => plan.entries.push(plan.entries[0]))
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.some((l) => l.startsWith('✗ Plan:') && l.includes('mehrfach'))).toBe(true)
  })

  it('meldet einen unbekannten Plan-Eintrag', async () => {
    await editPlan((plan) =>
      plan.entries.push({ ...plan.entries[0], inboxId: '20261021-120000-zzzz' }),
    )
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.some((l) => l.startsWith('✗ Plan:') && l.includes('unbekannt'))).toBe(true)
  })

  it('meldet einen fehlenden Plan-Eintrag', async () => {
    await editPlan((plan) => plan.entries.pop())
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.some((l) => l.startsWith('✗ Plan:') && l.includes('fehlt'))).toBe(true)
    expect(result.lines.at(-1)).toBe('ERGEBNIS: 28/29')
  })

  it('erkennt einen sortError mit Items (diffCase, ungültiger Plan wird abgelehnt)', async () => {
    const c = spec.cases.find((x) => x.nr === 11)
    if (!c) throw new Error('Fall 11 fehlt')
    await planWith(ideal())
    const file = await readRepoFile(dir, '.lauf/plan.json')
    if (!file || !isPlanFile(file.data)) throw new Error('plan.json fehlt')
    const donor = file.data.entries.find((e) => e.inboxId === inboxIdOf(2))
    const entry = file.data.entries.find((e) => e.inboxId === inboxIdOf(11))
    if (!donor || !entry) throw new Error('Fall fehlt')
    const broken = { ...entry, items: donor.items }
    expect(diffCase(c, broken).join(' ')).toContain('Einträge angelegt')

    entry.items = donor.items
    await writeJsonFile(dir, '.lauf/plan.json', file.data)
    expect((await compare()).exitCode).toBe(1)
  })

  it('erkennt ein zusätzliches Item bei expect: []', async () => {
    const d = ideal()
    decisionOf(d, 24).items[0].title = 'Käse'
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.find((l) => l.startsWith('✗ 24'))).toContain('1 Einträge statt 0')
    expect(result.lines.at(-1)).toBe('ERGEBNIS: 28/29')
  })

  it('vermerkt Dubletten, wendet an und lässt lauf:pruefen bestehen', async () => {
    await runStart({ argv: ['--daten', dir, '--ohne-git', '--jetzt', spec.now], env: {} })
    const backup = await readRepoFile(dir, '.testdaten/termine.json')
    await writeJsonFile(dir, '.lauf/termine.json', backup?.data)
    await planWith(idealDecisions(spec))
    const planned = await readRepoFile(dir, '.lauf/plan.json')
    if (!planned || !isPlanFile(planned.data)) throw new Error('plan.json fehlt')
    expect(planned.data.duplicates).toEqual([
      { inboxId: inboxIdOf(24), title: 'Knoblauch', existingItemId: null },
      { inboxId: inboxIdOf(25), title: 'Butter', existingItemId: '20261020-090000-e001' },
    ])
    const ids = planned.data.events.map((e, i) => ({ itemId: e.itemId, eventId: `trocken-${i}` }))
    await writeJsonFile(dir, '.lauf/termin-ids.json', { created: ids, failed: [] })
    const applied = await runAnwenden({
      argv: ['--daten', dir, '--ohne-git', '--jetzt', spec.now],
      env: {},
    })
    expect(applied.exitCode).toBe(0)
    expect(existsSync(join(dir, `inbox/${inboxIdOf(24)}.json`))).toBe(false)
    expect(existsSync(join(dir, `inbox/${inboxIdOf(25)}.json`))).toBe(false)
    const last = await readRepoFile(dir, 'runs/last.json')
    expect(last?.data).toMatchObject({ processed: 28, errors: [], skipped: [expect.anything()] })
    const itemIds = (last?.data as { itemIds: string[] }).itemIds
    expect(itemIds).not.toContain(inboxIdOf(24))
    expect(itemIds).not.toContain(inboxIdOf(25))
    expect((await runPruefen({ argv: ['--daten', dir], env: {} })).exitCode).toBe(0)
  })

  it('erkennt eine unerwartete neue Ablage', async () => {
    const d = ideal()
    const decision = decisionOf(d, 2)
    decision.newCategory = { name: 'Haushalt', description: '' }
    decision.items[0].categoryId = '@neu'
    await planWith(d)
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines.find((l) => l.startsWith('✗ 2'))).toContain('unerwartete neue Ablage')
  })

  it('meldet fehlendes plan.json mit Exit 1', async () => {
    const result = await compare()
    expect(result.exitCode).toBe(1)
    expect(result.lines[0]).toContain('plan.json')
  })
})
