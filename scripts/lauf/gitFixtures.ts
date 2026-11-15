// Test-Hilfen: temporäre lokale Git-Repos (bare „Remote“ + Klone). Nie ins Netz.
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

/** Git-Tests dürfen unter Last langsamer sein. */
export const GIT_TEST_TIMEOUT = 60_000

export function sh(cwd: string, ...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args.join(' ')}: ${stderr || error.message}`))
      else resolve(stdout.trim())
    })
  })
}

/** Macht Git unabhängig von der globalen Konfiguration des Rechners; gibt die Rücknahme zurück. */
export async function isolateGitConfig(): Promise<() => Promise<void>> {
  const dir = await mkdtemp(join(tmpdir(), 'sb-gitcfg-'))
  const globalFile = join(dir, 'gitconfig')
  await writeFile(globalFile, '', 'utf-8')
  const saved = { g: process.env.GIT_CONFIG_GLOBAL, s: process.env.GIT_CONFIG_NOSYSTEM }
  process.env.GIT_CONFIG_GLOBAL = globalFile
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  return async () => {
    if (saved.g === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = saved.g
    if (saved.s === undefined) delete process.env.GIT_CONFIG_NOSYSTEM
    else process.env.GIT_CONFIG_NOSYSTEM = saved.s
    await rm(dir, { recursive: true, force: true })
  }
}

async function configure(dir: string): Promise<void> {
  await sh(dir, 'config', 'user.name', 'Test')
  await sh(dir, 'config', 'user.email', 'test@example.invalid')
  await sh(dir, 'config', 'commit.gpgsign', 'false')
  await sh(dir, 'config', 'core.autocrlf', 'false')
}

export async function put(dir: string, path: string, content: string): Promise<void> {
  const full = join(dir, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, content, 'utf-8')
}

export const putJson = (dir: string, path: string, data: unknown): Promise<void> =>
  put(dir, path, `${JSON.stringify(data, null, 2)}\n`)

export const readText = (dir: string, path: string): Promise<string> =>
  readFile(join(dir, path), 'utf-8')

export async function readJson(dir: string, path: string): Promise<unknown> {
  return JSON.parse(await readText(dir, path)) as unknown
}

export interface Repos {
  root: string
  remote: string
  /** Klon, in dem der Lauf arbeitet. */
  lauf: string
  /** Zweiter Klon (die „App“). */
  app: string
  /** Betreffzeilen der Commits auf dem Remote (neueste zuerst). */
  remoteSubjects: () => Promise<string[]>
  cleanup: () => Promise<void>
}

/** Legt Remote + zwei Klone an; `files` (Pfad → Text) bilden den ersten, gepushten Stand. */
export async function createRepos(files: Record<string, string>): Promise<Repos> {
  const root = await mkdtemp(join(tmpdir(), 'sb-git-'))
  const remote = join(root, 'remote.git')
  const lauf = join(root, 'lauf')
  const app = join(root, 'app')
  await mkdir(remote)
  await sh(remote, 'init', '--bare', '-b', 'main')
  await mkdir(lauf)
  await sh(lauf, 'init', '-b', 'main')
  await configure(lauf)
  await sh(lauf, 'remote', 'add', 'origin', remote)
  for (const [path, content] of Object.entries(files)) await put(lauf, path, content)
  await sh(lauf, 'add', '-A')
  await sh(lauf, 'commit', '-m', 'Start')
  await sh(lauf, 'push', '-u', 'origin', 'main')
  await sh(root, 'clone', remote, app)
  await configure(app)
  return {
    root,
    remote,
    lauf,
    app,
    remoteSubjects: async () =>
      (await sh(remote, 'log', 'main', '--format=%s')).split('\n').filter((s) => s !== ''),
    cleanup: () => rm(root, { recursive: true, force: true }),
  }
}

/** Committet alles im Klon und pusht (so arbeitet die „App“). */
export async function commitAndPush(dir: string, message: string): Promise<void> {
  await sh(dir, 'add', '-A')
  await sh(dir, 'commit', '-m', message)
  await sh(dir, 'push')
}
