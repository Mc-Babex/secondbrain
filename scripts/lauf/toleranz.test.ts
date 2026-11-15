// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runAbschluss } from './abschluss'
import { runAnwenden } from './anwenden'
import { validInbox } from './fixtures'
import {
  createRepos,
  GIT_TEST_TIMEOUT,
  isolateGitConfig,
  putJson,
  readText,
  sh,
  type Repos,
} from './gitFixtures'
import { runPlanen } from './planen'
import { runPruefen } from './pruefen'
import { runStart } from './start'

const NOW = '2026-10-21T14:05:00+02:00'
const FOREIGN: Record<string, string> = {
  '.github/workflows/sortieren.yml': 'name: sortieren\non: workflow_dispatch\n',
  '.github/scripts/dispatch.mjs': 'console.log("x")\n',
  'runs/started.json': '{"startedAt":"2026-10-21T14:00:00+02:00"}\n',
  'runs/trigger.json': '{"requestedAt":"2026-10-21T14:00:00+02:00"}\n',
}
const FOREIGN_NAME = /sortieren\.yml|dispatch\.mjs|started\.json|trigger\.json/

let restore: () => Promise<void>
let repos: Repos
beforeAll(async () => {
  restore = await isolateGitConfig()
})
afterAll(() => restore())
afterEach(() => repos.cleanup())

describe('Lauf-Skripte neben .github/ und runs/started.json|trigger.json', () => {
  it(
    'laufen durch und lassen diese Dateien unberührt',
    async () => {
      repos = await createRepos({ '.gitignore': '.lauf/\n', ...FOREIGN })
      const dir = repos.lauf
      await putJson(dir, `inbox/${validInbox.id}.json`, validInbox)
      const argv = ['--daten', dir, '--jetzt', NOW]

      const start = await runStart({ argv, env: {} })
      expect(start.exitCode).toBe(0)
      expect(start.lines[0]).toBe('ARBEIT 1')
      expect(start.lines.join('\n')).not.toMatch(FOREIGN_NAME)

      await putJson(dir, '.lauf/termine.json', { events: [] })
      await putJson(dir, '.lauf/entscheidungen.json', {
        decisions: [
          {
            inboxId: validInbox.id,
            newCategory: null,
            items: [
              {
                type: 'notiz',
                title: 'Notiz',
                notes: '',
                categoryId: 'privat',
                important: false,
                durationMin: null,
                when: null,
              },
            ],
          },
        ],
      })
      expect((await runPlanen({ argv, env: {} })).exitCode).toBe(0)
      const applied = await runAnwenden({ argv, env: {} })
      expect(applied.exitCode).toBe(0)
      expect(applied.lines.join('\n')).not.toMatch(FOREIGN_NAME)

      const check = await runPruefen({ argv, env: {} })
      expect(check.exitCode).toBe(0)
      expect(check.lines.join('\n')).not.toMatch(FOREIGN_NAME)

      const finish = await runAbschluss({ argv, env: {} })
      expect(finish.exitCode).toBe(0)
      expect(await sh(dir, 'show', '--name-only', '--format=', 'HEAD')).not.toMatch(FOREIGN_NAME)

      for (const [path, content] of Object.entries(FOREIGN)) {
        expect(await readText(dir, path)).toBe(content)
      }
    },
    GIT_TEST_TIMEOUT,
  )
})
