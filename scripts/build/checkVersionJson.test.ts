import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkVersionJson } from './checkVersionJson.ts'

let dist: string
beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'dist-'))
  mkdirSync(join(dist, 'assets'))
})
afterEach(() => rmSync(dist, { recursive: true, force: true }))

function write(version: string | null, bundle: string, worker: string) {
  if (version !== null) writeFileSync(join(dist, 'version.json'), version)
  writeFileSync(join(dist, 'assets', 'index.js'), bundle)
  writeFileSync(join(dist, 'sw.js'), worker)
}

describe('checkVersionJson', () => {
  it('akzeptiert version.json mit Stempel im Bundle und nicht im Service Worker', () => {
    write('{"version":"1","build":"STAMP-1"}', 'x="STAMP-1"', 'precache([{url:"a.js"}])')
    expect(checkVersionJson(dist)).toEqual([])
  })

  it('meldet fehlende Datei, fehlenden Stempel im Bundle und Eintrag im Service Worker', () => {
    write(null, '', '')
    expect(checkVersionJson(dist)).toEqual(['dist/version.json fehlt'])
    write('{"version":"1","build":"STAMP-1"}', 'x="andere"', '{url:"version.json"}')
    expect(checkVersionJson(dist)).toHaveLength(2)
  })
})
