// @vitest-environment node
// Gesamttest: „ideale“ Entscheidungen zu den 29 Testsätzen aus docs/sortier-tests.md.
import { describe, expect, it } from 'vitest'
import type { Item } from '../../src/data/types'
import { validatePlanFile } from './files'
import { buildPlan, type PlanInboxEntry } from './plan'
import { idealDecisions } from './sortierFixtures'
import {
  createdAtOf,
  inboxIdOf as idOf,
  loadTestSpec,
  testCategories,
  testExistingItems,
  type ExpectedItem,
} from './testspec'

const spec = loadTestSpec()

function run() {
  const inbox: PlanInboxEntry[] = spec.cases.map((c) => ({
    id: idOf(c.nr),
    createdAt: createdAtOf(c.nr),
  }))
  let counter = 0
  return buildPlan({
    now: new Date(spec.now),
    inbox,
    decisions: idealDecisions(spec),
    events: { events: spec.events },
    categories: testCategories(spec),
    settings: { planningWindow: spec.planningWindow, pause: spec.pause, timezone: 'Europe/Berlin' },
    existingItemIds: testExistingItems(spec).map((i) => i.id),
    existingItems: testExistingItems(spec),
    newId: () => `20261021-140500-n${String(counter++).padStart(3, '0')}`,
  })
}

describe('Gesamttest gegen docs/sortier-tests.md', () => {
  const result = run()

  it('deckt alle 29 Testsätze ab und plant ohne Prüffehler', () => {
    expect(spec.cases).toHaveLength(29)
    expect(result.ok ? [] : result.errors).toEqual([])
  })

  it('ergibt eine gültige plan.json', () => {
    if (!result.ok) throw new Error('Plan fehlt')
    expect(validatePlanFile(result.plan)).toEqual([])
  })

  for (const c of spec.cases) {
    it(`Fall ${c.nr}: ${c.text}`, () => {
      if (!result.ok) throw new Error('Plan fehlt')
      const entry = result.plan.entries.find((e) => e.inboxId === idOf(c.nr))
      if (!entry) throw new Error('Eintrag fehlt')
      const expected = c.expect
      if (expected[0]?.sortError) {
        expect(entry.result).toBe('sortError')
        expect(entry.items).toEqual([])
        expect(entry.message).toBeTruthy()
        return
      }
      expect(entry.result).toBe('ok')
      expect(entry.items).toHaveLength(expected.length)
      if (c.newCategory) expect(entry.newCategory).toMatchObject(c.newCategory)
      entry.items.forEach((actual, i) => compare(actual, expected[i]))
    })
  }

  it('vermerkt die entfallenen Einkaufsartikel in duplicates', () => {
    if (!result.ok) throw new Error('Plan fehlt')
    expect(result.plan.duplicates).toEqual([
      { inboxId: idOf(24), title: 'Knoblauch', existingItemId: null },
      {
        inboxId: idOf(25),
        title: 'Butter',
        existingItemId: testExistingItems(spec)[0].id,
      },
    ])
  })

  it('events enthält genau die eingeplanten Items mit Ende und Beschreibung', () => {
    if (!result.ok) throw new Error('Plan fehlt')
    const scheduled = [
      ...result.plan.entries
        .flatMap((e) => e.items)
        .flatMap((i) => (i.schedule ? [{ id: i.id, title: i.title, ...i.schedule }] : [])),
    ]
    expect(result.plan.events.map((e) => e.itemId).sort()).toEqual(
      scheduled.map((i) => i.id).sort(),
    )
    for (const event of result.plan.events) {
      const planned = scheduled.find((i) => i.id === event.itemId)
      expect(event.title).toBe(planned?.title)
      expect(event.start).toBe(planned?.start)
      const minutes = (Date.parse(event.end) - Date.parse(event.start)) / 60_000
      expect(minutes).toBe(planned?.durationMin)
      expect(event.description).toBe(
        `Erstellt mit SecondBrain (Claude-Lauf)\nEintrag: ${event.itemId}`,
      )
    }
    expect(result.plan.errors).toEqual([])
  })
})

function compare(actual: Item, expected: ExpectedItem): void {
  if (expected.type !== undefined) expect(actual.type).toBe(expected.type)
  if (expected.categoryId !== undefined) expect(actual.categoryId).toBe(expected.categoryId)
  if (expected.important !== undefined) expect(actual.important).toBe(expected.important)
  if (expected.checked !== undefined) expect(actual.checked).toBe(expected.checked)
  if (typeof expected.durationMin === 'number')
    expect(actual.durationMin).toBe(expected.durationMin)
  if (Array.isArray(expected.durationMin)) {
    expect(actual.durationMin).toBeGreaterThanOrEqual(expected.durationMin[0])
    expect(actual.durationMin).toBeLessThanOrEqual(expected.durationMin[1])
  }
  if (expected.schedule === null) expect(actual.schedule).toBeNull()
  else if (expected.schedule !== undefined) {
    expect(actual.schedule).toEqual(expected.schedule)
  }
}
