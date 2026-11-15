// Prüft nach `vite build`, dass dist/version.json zum Bundle passt: npm run build ruft das Skript auf.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function readBundles(dist: string): string {
  const assets = join(dist, 'assets')
  if (!existsSync(assets)) return ''
  return readdirSync(assets)
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(assets, name), 'utf-8'))
    .join('\n')
}

/** Liefert die Fehler (leer = in Ordnung). */
export function checkVersionJson(dist: string): string[] {
  const file = join(dist, 'version.json')
  if (!existsSync(file)) return ['dist/version.json fehlt']
  let build: unknown
  try {
    build = (JSON.parse(readFileSync(file, 'utf-8')) as { build?: unknown }).build
  } catch {
    return ['dist/version.json ist kein gültiges JSON']
  }
  if (typeof build !== 'string' || build === '')
    return ['dist/version.json enthält keinen Build-Stempel']
  const errors: string[] = []
  if (!readBundles(dist).includes(build)) errors.push('Build-Stempel steht nicht im Bundle')
  const worker = join(dist, 'sw.js')
  if (existsSync(worker) && readFileSync(worker, 'utf-8').includes('version.json')) {
    errors.push('version.json darf nicht im Precache von sw.js stehen')
  }
  return errors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkVersionJson('dist')
  if (errors.length > 0) {
    console.error(`Prüfung von version.json fehlgeschlagen: ${errors.join('; ')}`)
    process.exit(1)
  }
  console.log('version.json passt zum Bundle')
}
