// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runAnwenden } from './anwenden'
import { readRepoFile, writeJsonFile } from './dataRepo'
import { runPlanen } from './planen'
import { runPruefen } from './pruefen'
import { MAX_INBOX_PER_RUN, runStart } from './start'

const NOW = '2026-10-21T14:05:00+02:00'
const COUNT = 30
const two = (n: number): string => String(n).padStart(2, '0')
const idOf = (n: number): string => `20261021-1400${two(n)}-a${String(n).padStart(3, '0')}`
const createdAt = (n: number): string => `2026-10-21T13:${two(n)}:00+02:00`
const decision = (n: number) => ({
  inboxId: idOf(n),
  newCategory: null,
  items: [
    {
      type: 'notiz',
      title: `Notiz ${n}`,
      notes: '',
      categoryId: 'privat',
      important: false,
      durationMin: null,
      when: null,
    },
  ],
})

let dir: string
const argv = () => ['--daten', dir, '--jetzt', NOW, '--ohne-git']
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sb-obergrenze-'))
  // Neueste zuerst angelegt: die Auswahl darf nicht von der Dateireihenfolge abhängen.
  for (let n = COUNT - 1; n >= 0; n--) {
    await writeJsonFile(dir, `inbox/${idOf(n)}.json`, {
      id: idOf(n),
      text: `Text ${n}`,
      createdAt: createdAt(n),
      source: 'text',
    })
  }
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('Obergrenze pro Lauf', () => {
  it('gibt 29 Einträge aus (die ältesten) und weist auf den restlichen hin', async () => {
    const result = await runStart({ argv: argv(), env: {} })
    expect(MAX_INBOX_PER_RUN).toBe(29)
    expect(result.lines[0]).toBe('ARBEIT 29')
    const ids = result.lines.filter((l) => l.startsWith('--- ')).map((l) => l.split(' ')[1])
    expect(ids).toEqual(Array.from({ length: 29 }, (_, n) => idOf(n)))
    expect(result.lines).toContain('Hinweis: 1 weiterer Eintrag bleibt für den nächsten Lauf.')
  })

  it('ganzer Lauf lässt den 30. unverändert im Eingangskorb', async () => {
    await runStart({ argv: argv(), env: {} })
    const last = await readRepoFile(dir, `inbox/${idOf(29)}.json`)
    await writeJsonFile(dir, '.lauf/entscheidungen.json', {
      decisions: Array.from({ length: 29 }, (_, n) => decision(n)),
    })
    await writeJsonFile(dir, '.lauf/termine.json', { events: [] })

    const planned = await runPlanen({ argv: argv(), env: {} })
    expect(planned.exitCode).toBe(0)
    const applied = await runAnwenden({ argv: argv(), env: {} })
    expect(applied.exitCode).toBe(0)
    expect(applied.lines[0]).toContain('29 einsortiert')

    expect(await readRepoFile(dir, `inbox/${idOf(29)}.json`)).toEqual(last)
    expect(await readRepoFile(dir, `inbox/${idOf(0)}.json`)).toBeNull()
    expect((await runPruefen({ argv: argv(), env: {} })).exitCode).toBe(0)
  })

  it('Entscheidung zu einem nicht ausgewählten Eintrag ist ein Fehler', async () => {
    await runStart({ argv: argv(), env: {} })
    await writeJsonFile(dir, '.lauf/entscheidungen.json', {
      decisions: Array.from({ length: 30 }, (_, n) => decision(n)),
    })
    await writeJsonFile(dir, '.lauf/termine.json', { events: [] })
    const planned = await runPlanen({ argv: argv(), env: {} })
    expect(planned.exitCode).toBe(1)
    expect(planned.lines.join('\n')).toContain(idOf(29))
  })
})
