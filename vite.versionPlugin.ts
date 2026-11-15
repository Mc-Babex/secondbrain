import type { Plugin } from 'vite'

/** Inhalt von `version.json`: Version und Build-Stempel (derselbe wie im Code). */
export function versionJson(version: string, build: string): string {
  return `${JSON.stringify({ version, build })}\n`
}

/**
 * Legt `version.json` in den Build-Ausgabeordner. Die Datei gehört nicht in den Precache des Service Workers
 * (dessen Muster erfasst nur js/css/html) und wird von der App mit `cache: 'no-store'` abgerufen.
 */
export function versionFilePlugin(version: string, build: string): Plugin {
  return {
    name: 'secondbrain-version-json',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: versionJson(version, build),
      })
    },
  }
}
