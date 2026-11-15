// @vitest-environment node
import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isCategoriesFile, isSettings } from '../../src/data/types'
import { runPruefen } from '../lauf/pruefen'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TEMPLATE = join(ROOT, 'vorlage', 'daten-repo')
const read = (...parts: string[]): Promise<string> => readFile(join(ROOT, ...parts), 'utf-8')
const readTemplateJson = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(join(TEMPLATE, name), 'utf-8')) as unknown

describe('Vorlage vorlage/daten-repo', () => {
  it('lauf:pruefen meldet OK', async () => {
    const result = await runPruefen({ argv: ['--daten', TEMPLATE], env: {} })
    expect(result.exitCode).toBe(0)
    expect(result.lines[0]).toMatch(/^OK/)
  })

  it('categories.json und settings.json erfüllen die App-Type-Guards', async () => {
    expect(isCategoriesFile(await readTemplateJson('categories.json'))).toBe(true)
    const settings = await readTemplateJson('settings.json')
    expect(isSettings(settings)).toBe(true)
    expect(settings).toEqual({
      planningWindow: { start: '09:00', end: '19:00' },
      pause: { start: '12:00', end: '13:00' },
      timezone: 'Europe/Berlin',
      autoSort: false,
    })
    expect(await readTemplateJson('secondbrain.json')).toEqual({ format: 1 })
  })

  it('Ablagen entsprechen SPEC §3.5', async () => {
    const file = (await readTemplateJson('categories.json')) as { categories: unknown[] }
    expect(file.categories).toEqual([
      {
        id: 'privat',
        name: 'Privat',
        kind: 'normal',
        order: 1,
        description: 'Alles Persönliche: Haushalt, Arzttermine, Behörden, Freizeit …',
      },
      {
        id: 'arbeit',
        name: 'Arbeit',
        kind: 'normal',
        order: 2,
        description: 'Alles zu Beruf, Job oder Ausbildung',
      },
      { id: 'einkauf', name: 'Einkaufsliste', kind: 'einkauf', order: 3, description: '' },
      {
        id: 'erledigt',
        name: 'Erledigt',
        kind: 'archiv',
        order: 4,
        description: 'Archiv für abgehakte Aufgaben',
      },
    ])
  })

  it('enthält .gitignore, .gitkeep-Dateien und README', async () => {
    expect(await readFile(join(TEMPLATE, '.gitignore'), 'utf-8')).toContain('.lauf/')
    await readFile(join(TEMPLATE, 'inbox', '.gitkeep'))
    await readFile(join(TEMPLATE, 'items', '.gitkeep'))
    expect(await readFile(join(TEMPLATE, 'README.md'), 'utf-8')).toContain('Privat lassen')
  })
})

describe('Workflow-Dateien', () => {
  it('wiederverwendbarer Workflow: nur workflow_call, Secrets optional, Code ohne Zugangsdaten', async () => {
    const yml = await read('.github', 'workflows', 'sortieren.yml')
    expect(yml).toMatch(/^on:\s*\n {2}workflow_call:/m)
    expect(yml).not.toMatch(/repository_dispatch|^ {2}push:|pull_request|schedule:/m)
    expect(yml).toMatch(/ROUTINE_FIRE_URL:\s*\n\s+required: false/)
    expect(yml).toMatch(/ROUTINE_FIRE_TOKEN:\s*\n\s+required: false/)
    expect(yml).toContain('default: Mc-Babex/secondbrain')
    expect(yml).toContain('default: stable')
    expect(yml).toContain('path: .secondbrain-code')
    expect(yml).toContain('persist-credentials: false')
    expect(yml).toContain('sparse-checkout:')
    expect(yml).toContain('timeout-minutes: 5')
    expect(yml).toMatch(/permissions:\s*\n\s+contents: write/)
    expect(yml).toMatch(/group: sortieren\s*\n\s+cancel-in-progress: false/)
    expect(yml).toContain('run: node .secondbrain-code/scripts/action/sortieren.ts')
    const outsideEnv = yml
      .split('\n')
      .filter(
        (line) =>
          line.includes('${{') &&
          !/^\s+(ROUTINE_FIRE_URL|ROUTINE_FIRE_TOKEN|REQUEST_ID): \$\{\{/.test(line) &&
          !/^\s+(repository|ref): \$\{\{ inputs\./.test(line),
      )
    expect(outsideEnv).toEqual([])
  })

  it('Aufrufer: @stable, beide Secrets einzeln, kein inherit', async () => {
    const yml = await read('vorlage', 'daten-repo', '.github', 'workflows', 'sortieren.yml')
    expect(yml).toMatch(/repository_dispatch:\s*\n\s+types: \[sortieren\]/)
    expect(yml).toContain('uses: Mc-Babex/secondbrain/.github/workflows/sortieren.yml@stable')
    expect(yml).toContain('request-id: ${{ github.event.client_payload.requestId }}')
    expect(yml).toContain('ROUTINE_FIRE_URL: ${{ secrets.ROUTINE_FIRE_URL }}')
    expect(yml).toContain('ROUTINE_FIRE_TOKEN: ${{ secrets.ROUTINE_FIRE_TOKEN }}')
    expect(yml).not.toContain('inherit')
    expect(yml).toMatch(/permissions:\s*\n\s+contents: write/)
  })

  it('CI: contents: read, keine Secrets, alle vier Schritte', async () => {
    const yml = await read('.github', 'workflows', 'ci.yml')
    expect(yml).toMatch(/^permissions:\s*\n {2}contents: read/m)
    expect(yml).not.toContain('secrets.')
    for (const step of ['npm ci', 'npm run lint', 'npm test', 'npm run build']) {
      expect(yml).toContain(`run: ${step}`)
    }
    expect(yml).toMatch(/push:\s*\n\s+branches: \[main, stable\]/)
    expect(yml).toMatch(/pull_request:\s*\n\s+branches: \[main, stable\]/)
  })
})

describe('Skript im Code-Checkout', () => {
  it('läuft mit Node direkt und löst den Import von src/lib/dataFormat.ts auf', async () => {
    // Nachbildung des Workflows: nur scripts/action, src/lib und package.json im Checkout-Ordner.
    const work = await mkdtemp(join(tmpdir(), 'sb-checkout-'))
    try {
      const code = join(work, '.secondbrain-code')
      for (const part of ['scripts/action', 'src/lib']) {
        await cp(join(ROOT, part), join(code, part), { recursive: true })
      }
      await cp(join(ROOT, 'package.json'), join(code, 'package.json'))
      const output = await new Promise<string>((resolvePromise, reject) => {
        execFile(
          process.execPath,
          [join(code, 'scripts', 'action', 'sortieren.ts'), '--help'],
          { cwd: work },
          (error, stdout) => (error ? reject(error) : resolvePromise(stdout)),
        )
      })
      expect(output).toContain('Aufruf')
    } finally {
      await rm(work, { recursive: true, force: true })
    }
  })
})
