// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validInbox, validItem } from './fixtures'
import { writeJsonFile } from './dataRepo'
import { isPlanFile } from './files'
import { runPlanen } from './planen'

const NOW = '2026-10-17T09:35:00+02:00'
const decisionFor = (categoryId: string) => ({
  decisions: [
    {
      inboxId: validInbox.id,
      newCategory: null,
      items: [
        {
          type: 'aufgabe',
          title: 'Krankenkasse anrufen',
          notes: '',
          categoryId,
          important: true,
          durationMin: 15,
          when: null,
        },
      ],
    },
  ],
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sb-planen-'))
  await writeJsonFile(dir, `inbox/${validInbox.id}.json`, validInbox)
  await writeJsonFile(dir, '.lauf/termine.json', { events: [] })
})
afterEach(() => rm(dir, { recursive: true, force: true }))

const run = () => runPlanen({ argv: ['--daten', dir, '--jetzt', NOW], env: {} })

describe('lauf:planen', () => {
  it('schreibt ein gültiges plan.json und gibt eine Übersicht aus', async () => {
    await writeJsonFile(dir, '.lauf/entscheidungen.json', decisionFor('privat'))
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(result.lines).toEqual([
      `${validInbox.id}  Aufgabe „Krankenkasse anrufen“ → Privat · So 18.10. 09:00–09:15`,
      'ANZULEGENDE TERMINE: 1',
    ])
    const plan: unknown = JSON.parse(await readFile(join(dir, '.lauf/plan.json'), 'utf-8'))
    expect(isPlanFile(plan)).toBe(true)
  })

  it('übernimmt mehrzeilige notes unverändert in plan.json', async () => {
    const notes = 'Erste Zeile.\n\nZweite Zeile mit Details – Ä/Ö.\nDritte Zeile'
    const decisions = decisionFor('privat')
    decisions.decisions[0].items[0].notes = notes
    await writeJsonFile(dir, '.lauf/entscheidungen.json', decisions)
    expect((await run()).exitCode).toBe(0)
    const plan: unknown = JSON.parse(await readFile(join(dir, '.lauf/plan.json'), 'utf-8'))
    if (!isPlanFile(plan)) throw new Error('plan.json ungültig')
    expect(plan.entries[0].items[0].notes).toBe(notes)
  })

  it('zeigt sortError-Einträge mit Meldung', async () => {
    await writeJsonFile(dir, '.lauf/entscheidungen.json', {
      decisions: [
        {
          ...decisionFor('privat').decisions[0],
          items: [
            {
              ...decisionFor('privat').decisions[0].items[0],
              important: false,
              when: { date: '2026-10-16', time: '10:00' },
            },
          ],
        },
      ],
    })
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(result.lines[0]).toContain('Der Zeitpunkt Fr 16.10., 10:00 liegt in der Vergangenheit.')
    expect(result.lines.at(-1)).toBe('ANZULEGENDE TERMINE: 0')
  })

  it('Prüffehler ergeben Exit 1, Meldungen und löschen ein altes plan.json', async () => {
    await writeJsonFile(dir, '.lauf/plan.json', { alt: true })
    await writeJsonFile(dir, '.lauf/entscheidungen.json', decisionFor('sport'))
    const result = await run()
    expect(result.exitCode).toBe(1)
    expect(result.lines).toEqual([`Entscheidung ${validInbox.id}: Ablage „sport“ gibt es nicht.`])
    expect(existsSync(join(dir, '.lauf/plan.json'))).toBe(false)
  })

  it('fehlende Eingabedatei ergibt Exit 1 und eine klare Meldung', async () => {
    const result = await run()
    expect(result.exitCode).toBe(1)
    expect(result.lines).toEqual(['.lauf/entscheidungen.json fehlt.'])
    expect(existsSync(join(dir, '.lauf/plan.json'))).toBe(false)
  })

  it('ungültiger --jetzt-Wert ergibt Exit 1', async () => {
    await writeJsonFile(dir, '.lauf/entscheidungen.json', decisionFor('privat'))
    const result = await runPlanen({ argv: ['--daten', dir, '--jetzt', 'gestern'], env: {} })
    expect(result.exitCode).toBe(1)
  })

  it('fehlender Datenordner ergibt Exit 2', async () => {
    const result = await runPlanen({ argv: ['--daten', join(dir, 'weg')], env: {} })
    expect(result.exitCode).toBe(2)
  })

  it('nennt entfallene Einkaufsartikel in der Übersicht und in plan.json', async () => {
    await writeJsonFile(dir, 'items/20261016-080000-abcd.json', {
      ...validItem,
      id: '20261016-080000-abcd',
      type: 'notiz',
      title: 'Knoblauch',
      categoryId: 'einkauf',
      schedule: null,
      checked: true,
    })
    await writeJsonFile(dir, '.lauf/entscheidungen.json', {
      decisions: [
        {
          inboxId: validInbox.id,
          newCategory: null,
          items: [
            {
              type: 'notiz',
              title: 'knoblauch',
              notes: '',
              categoryId: 'einkauf',
              important: false,
              durationMin: null,
              when: null,
            },
          ],
        },
      ],
    })
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(result.lines).toEqual([
      `${validInbox.id}  Schon auf der Einkaufsliste: knoblauch`,
      'ANZULEGENDE TERMINE: 0',
    ])
    const plan: unknown = JSON.parse(await readFile(join(dir, '.lauf/plan.json'), 'utf-8'))
    expect(plan).toMatchObject({
      duplicates: [
        { inboxId: validInbox.id, title: 'knoblauch', existingItemId: '20261016-080000-abcd' },
      ],
    })
  })
})
