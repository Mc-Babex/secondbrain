// Git-Aufrufe im Datenordner und gemeinsame Optionen der Lauf-Skripte (`--jetzt`, `--ohne-git`).
import { execFile } from 'node:child_process'
import { DataDirError, resolveDataDir } from './dataDir'
import { isTimestamp } from './validate'

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

export type GitRunner = (dir: string, args: readonly string[]) => Promise<GitResult>

export interface LaufResult {
  exitCode: number
  lines: string[]
}

export interface LaufOptions {
  argv: readonly string[]
  env: Readonly<Record<string, string | undefined>>
  codeRoot?: string
  /** Ersetzt den echten Git-Aufruf (Tests). */
  runGit?: GitRunner
}

const MAX_BUFFER = 64 * 1024 * 1024

/** Führt `git <args>` im Ordner aus. Wirft nie bei Exit-Code ≠ 0; Fehler stehen im Ergebnis. */
export const git: GitRunner = (dir, args) =>
  new Promise((resolve) => {
    execFile(
      'git',
      [...args],
      {
        cwd: dir,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true' },
      },
      (error, stdout, stderr) => {
        const out = maskCredentials(stdout)
        if (!error) return resolve({ code: 0, stdout: out, stderr: maskCredentials(stderr) })
        const code = typeof error.code === 'number' ? error.code : -1
        resolve({ code, stdout: out, stderr: maskCredentials(stderr || error.message) })
      },
    )
  })

/** Maskiert Zugangsdaten in URLs: `https://token@host` → `https://***@host`. */
export function maskCredentials(text: string): string {
  return text.replace(/:\/\/[^\s/@]+@/g, '://***@')
}

/** Ausgabe eines Git-Aufrufs als Text (stdout + stderr), Zugangsdaten maskiert. */
export function gitText(result: GitResult): string {
  return [result.stdout, result.stderr]
    .map(maskCredentials)
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .join('\n')
}

/** Pfade ohne `.lauf/` mit ungesicherten Änderungen (geändert, neu, gelöscht). */
export async function dirtyFiles(run: GitRunner, dir: string): Promise<GitResult | string[]> {
  const result = await run(dir, ['status', '--porcelain', '-z', '--untracked-files=all'])
  if (result.code !== 0) return result
  const entries = result.stdout.split('\0').filter((e) => e !== '')
  const paths: string[] = []
  for (let i = 0; i < entries.length; i++) {
    const status = entries[i].slice(0, 2)
    paths.push(entries[i].slice(3))
    if (status.includes('R') || status.includes('C')) i++ // Ursprungspfad überspringen
  }
  return paths.filter((p) => !p.startsWith('.lauf/'))
}

/** Merkt die Pfade (aus `dirtyFiles`, also ohne `.lauf/`) für den Commit vor. */
export async function stagePaths(
  run: GitRunner,
  dir: string,
  paths: readonly string[],
): Promise<GitResult> {
  const chunk = 100
  let result: GitResult = { code: 0, stdout: '', stderr: '' }
  for (let i = 0; i < paths.length && result.code === 0; i += chunk) {
    result = await run(dir, ['add', '-A', '--', ...paths.slice(i, i + chunk)])
  }
  return result
}

/** Zeitpunkt aus `--jetzt <ISO>`; ohne Angabe die aktuelle Zeit; sonst eine Fehlermeldung. */
export function nowFromArgs(argv: readonly string[]): Date | string {
  const index = argv.indexOf('--jetzt')
  if (index < 0) return new Date()
  const value = argv[index + 1]
  if (!isTimestamp(value)) {
    return '--jetzt erwartet einen Zeitstempel mit Offset, z. B. 2026-10-21T14:05:00+02:00.'
  }
  return new Date(value)
}

export const withoutGit = (argv: readonly string[]): boolean => argv.includes('--ohne-git')

/** Datenordner auflösen; bei Fehler das fertige Ergebnis (Exit 2). */
export function dataDirOrResult(options: LaufOptions): string | LaufResult {
  try {
    return resolveDataDir(options)
  } catch (error) {
    if (error instanceof DataDirError) return { exitCode: error.exitCode, lines: [error.message] }
    throw error
  }
}

/** Gibt ein Ergebnis aus (stdout bei Exit 0, sonst stderr) und setzt den Exit-Code. */
export function printResult(result: LaufResult): void {
  for (const line of result.lines) {
    if (result.exitCode === 0) console.log(line)
    else console.error(line)
  }
  process.exitCode = result.exitCode
}

/** Bricht einen angefangenen Rebase ab (ohne laufenden Rebase harmlos), damit das Repo nie mittendrin bleibt. */
export async function abortRebase(run: GitRunner, dir: string): Promise<void> {
  await run(dir, ['rebase', '--abort'])
}
