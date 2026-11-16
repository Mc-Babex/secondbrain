// @vitest-environment node
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { validInbox } from './fixtures'
import {
  commitAndPush,
  createRepos,
  GIT_TEST_TIMEOUT,
  isolateGitConfig,
  putJson,
  readJson,
  readText,
  sh,
  type Repos,
} from './gitFixtures'
import { runStart } from './start'

const NOW = '2026-10-21T14:05:00+02:00'
const inbox = (id: string, createdAt: string, text: string, extra: object = {}) => ({
  id,
  text,
  createdAt,
  source: 'text',
  ...extra,
})
const A = '20261021-140100-a1b2'
const B = '20261021-140300-c3d4'
const C = '20261021-140200-e5f6'

describe('lauf:start ohne Git', () => {
  let dir: string
  const run = () => runStart({ argv: ['--daten', dir, '--jetzt', NOW, '--ohne-git'], env: {} })
  const fresh = async () => {
    dir = await mkdtemp(join(tmpdir(), 'sb-start-'))
  }
  afterEach(() => rm(dir, { recursive: true, force: true }))

  it('gibt LEER bei leerer Inbox aus und legt .lauf/start.json an', async () => {
    await fresh()
    await putJson(dir, '.lauf/alt.json', {})
    const result = await run()
    expect(result).toEqual({ exitCode: 0, lines: ['LEER'] })
    expect(await readJson(dir, '.lauf/start.json')).toEqual({ startedAt: NOW, inboxIds: [] })
    expect(existsSync(join(dir, '.lauf/alt.json'))).toBe(false)
  })

  it('gibt LEER aus, wenn alle Einträge einen sortError haben', async () => {
    await fresh()
    await putJson(
      dir,
      `inbox/${A}.json`,
      inbox(A, '2026-10-21T14:01:00+02:00', 'x', { sortError: { message: 'm', at: NOW } }),
    )
    expect((await run()).lines).toEqual(['LEER'])
  })

  it('gibt den vollständigen Kontext aus', async () => {
    await fresh()
    await putJson(dir, `inbox/${B}.json`, inbox(B, '2026-10-21T14:03:00+02:00', 'Zweiter\nText'))
    await putJson(dir, `inbox/${A}.json`, inbox(A, '2026-10-21T14:01:00+02:00', 'Erster'))
    await putJson(
      dir,
      `inbox/${C}.json`,
      inbox(C, '2026-10-21T14:02:00+02:00', 'Mit Fehler', {
        sortError: { message: 'm', at: NOW },
      }),
    )
    const result = await run()
    expect(result.exitCode).toBe(0)
    expect(result.lines).toEqual([
      'ARBEIT 2',
      'Jetzt: Mittwoch, 21.10.2026, 14:05 (2026-10-21T14:05:00+02:00)',
      'Planungsfenster: 09:00–19:00',
      'Pause: 12:00–13:00',
      'Ablagen (id | Name | Art | Beschreibung):',
      '- privat | Privat | normal | Alles Persönliche: Haushalt, Arzttermine, Behörden, Freizeit …',
      '- arbeit | Arbeit | normal | Alles zu Beruf, Job oder Ausbildung',
      '- einkauf | Einkaufsliste | einkauf | ',
      '- erledigt | Erledigt | archiv | Archiv für abgehakte Aufgaben',
      'Termine abrufen von 2026-10-21T00:00:00+02:00 bis 2026-11-04T23:59:00+01:00',
      'Eingangskorb:',
      `--- ${A} | 2026-10-21T14:01:00+02:00`,
      'Erster',
      `--- ${B} | 2026-10-21T14:03:00+02:00`,
      'Zweiter\nText',
      'Aktive Projekte: keine',
    ])
  })

  it('lässt eine vorhandene categories.json unverändert und gibt alle Ablagen aus', async () => {
    await fresh()
    await putJson(dir, `inbox/${A}.json`, inbox(A, '2026-10-21T14:01:00+02:00', 'Erster'))
    const categories = {
      categories: [
        { id: 'privat', name: 'Privat', kind: 'normal', order: 1, description: '' },
        { id: 'studium', name: 'Studium', kind: 'normal', order: 2, description: 'Uni' },
        { id: 'einkauf', name: 'Einkaufsliste', kind: 'einkauf', order: 3, description: '' },
        { id: 'erledigt', name: 'Erledigt', kind: 'archiv', order: 4, description: '' },
      ],
    }
    await putJson(dir, 'categories.json', categories)
    const result = await run()
    expect(result.lines).toContain('- studium | Studium | normal | Uni')
    expect(await readJson(dir, 'categories.json')).toEqual(categories)
  })

  it('zeigt die Pause bzw. „Pause: keine“', async () => {
    await fresh()
    await putJson(dir, `inbox/${A}.json`, inbox(A, '2026-10-21T14:01:00+02:00', 'Erster'))
    const base = { planningWindow: { start: '09:00', end: '19:00' }, timezone: 'Europe/Berlin' }
    await putJson(dir, 'settings.json', { ...base, pause: { start: '12:30', end: '13:15' } })
    expect((await run()).lines).toContain('Pause: 12:30–13:15')
    await putJson(dir, 'settings.json', { ...base, pause: null })
    expect((await run()).lines).toContain('Pause: keine')
    await putJson(dir, 'settings.json', { ...base, pause: { start: '13:00', end: '12:00' } })
    expect((await run()).lines).toContain('Pause: keine')
    await putJson(dir, 'settings.json', base)
    expect((await run()).lines).toContain('Pause: 12:00–13:00')
  })

  it('gibt mehrzeilige lange Texte unverändert aus', async () => {
    await fresh()
    const text =
      'Erste Zeile mit Umlauten äöü\n\n  eingerückte Zeile – Gedankenstrich\n"Anführung" & Co.\nLetzte Zeile'
    await putJson(dir, `inbox/${A}.json`, inbox(A, '2026-10-21T14:01:00+02:00', text))
    const result = await run()
    const index = result.lines.indexOf(`--- ${A} | 2026-10-21T14:01:00+02:00`)
    expect(result.lines[index + 1]).toBe(text)
  })

  it('führt mit --ohne-git keinen Git-Befehl aus', async () => {
    await fresh()
    const runGit = vi.fn()
    await runStart({ argv: ['--daten', dir, '--jetzt', NOW, '--ohne-git'], env: {}, runGit })
    expect(runGit).not.toHaveBeenCalled()
  })
})

describe('lauf:start mit Git', () => {
  let restore: () => Promise<void>
  let repos: Repos
  beforeAll(async () => {
    restore = await isolateGitConfig()
  })
  afterAll(() => restore())
  afterEach(() => repos.cleanup())

  const run = () => runStart({ argv: ['--daten', repos.lauf, '--jetzt', NOW], env: {} })
  const setup = async (gitignore = '.lauf/\n') => {
    repos = await createRepos({ '.gitignore': gitignore })
  }

  it(
    'ergänzt .lauf/ in .gitignore einmalig, committet und pusht',
    async () => {
      await setup('node_modules')
      expect((await run()).lines).toEqual(['LEER'])
      expect(await readText(repos.lauf, '.gitignore')).toBe('node_modules\n.lauf/\n')
      expect(await repos.remoteSubjects()).toEqual(['Lauf: .lauf/ ignorieren', 'Start'])
      await run()
      expect(await repos.remoteSubjects()).toEqual(['Lauf: .lauf/ ignorieren', 'Start'])
      expect(await readText(repos.lauf, '.gitignore')).toBe('node_modules\n.lauf/\n')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'holt Änderungen aus dem Remote (pull --rebase)',
    async () => {
      await setup()
      await putJson(repos.app, `inbox/${A}.json`, inbox(A, '2026-10-21T14:01:00+02:00', 'Aus App'))
      await commitAndPush(repos.app, 'App')
      const result = await run()
      expect(result.lines[0]).toBe('ARBEIT 1')
      expect(result.lines).toContain('Aus App')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'committet gültige Reste eines abgebrochenen Laufs',
    async () => {
      await setup()
      await putJson(repos.lauf, `inbox/${validInbox.id}.json`, validInbox)
      await putJson(repos.lauf, '.lauf/plan.json', {})
      const result = await run()
      expect(result.exitCode).toBe(0)
      expect(await repos.remoteSubjects()).toEqual([
        'Lauf: Reste eines abgebrochenen Laufs',
        'Start',
      ])
      expect(await sh(repos.lauf, 'status', '--porcelain')).toBe('')
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'bricht bei ungültigen Resten mit Exit 3 ab und fasst nichts an',
    async () => {
      await setup()
      await putJson(repos.lauf, `inbox/${validInbox.id}.json`, { id: validInbox.id })
      const result = await run()
      expect(result.exitCode).toBe(3)
      expect(result.lines.join('\n')).toContain(`inbox/${validInbox.id}.json`)
      expect(await repos.remoteSubjects()).toEqual(['Start'])
      expect(await sh(repos.lauf, 'log', '--format=%s')).toBe('Start')
      expect(existsSync(join(repos.lauf, '.lauf/start.json'))).toBe(false)
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'pusht einen früher gescheiterten Commit',
    async () => {
      await setup()
      await putJson(repos.lauf, `inbox/${A}.json`, inbox(A, '2026-10-21T14:01:00+02:00', 'x'))
      await sh(repos.lauf, 'add', '-A')
      await sh(repos.lauf, 'commit', '-m', 'Lauf: 1 einsortiert')
      expect(await repos.remoteSubjects()).toEqual(['Start'])
      await run()
      expect(await repos.remoteSubjects()).toEqual(['Lauf: 1 einsortiert', 'Start'])
    },
    GIT_TEST_TIMEOUT,
  )

  it(
    'meldet fehlenden Upstream verständlich auf Deutsch',
    async () => {
      await setup()
      await sh(repos.lauf, 'branch', '--unset-upstream')
      const result = await run()
      expect(result.exitCode).toBe(1)
      expect(result.lines.join('\n')).toContain('kein Remote-Gegenstück (upstream)')
    },
    GIT_TEST_TIMEOUT,
  )
})
