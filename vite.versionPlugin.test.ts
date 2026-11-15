import { describe, expect, it } from 'vitest'
import { versionFilePlugin, versionJson } from './vite.versionPlugin'

describe('version.json', () => {
  it('enthält Version und Build-Stempel', () => {
    expect(JSON.parse(versionJson('0.8.0', '2026-11-01T10:00:00.000Z abc1234'))).toEqual({
      version: '0.8.0',
      build: '2026-11-01T10:00:00.000Z abc1234',
    })
  })

  it('wird als Datei version.json ausgegeben', () => {
    const emitted: { fileName?: string; source?: unknown }[] = []
    const plugin = versionFilePlugin('0.8.0', 'B1')
    const hook = plugin.generateBundle as (this: { emitFile: (f: object) => void }) => void
    hook.call({ emitFile: (file) => emitted.push(file) })
    expect(emitted).toHaveLength(1)
    expect(emitted[0].fileName).toBe('version.json')
    expect(JSON.parse(String(emitted[0].source))).toEqual({ version: '0.8.0', build: 'B1' })
  })
})
