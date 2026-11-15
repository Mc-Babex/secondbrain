// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SPLASH_SIZES, solidPng, splashFileName, splashLinkTags } from './erzeugen'

const html = readFileSync('index.html', 'utf-8')

function pngSize(path: string): { width: number; height: number; colorType: number } {
  const data = readFileSync(path)
  expect(data.subarray(1, 4).toString('ascii')).toBe('PNG')
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), colorType: data[25] }
}

describe('index.html: iOS-Meta-Angaben', () => {
  it.each([
    ['apple-mobile-web-app-capable', 'yes'],
    ['mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
    ['apple-mobile-web-app-title', 'SecondBrain'],
    ['format-detection', 'telephone=no'],
    ['theme-color', '#0f1115'],
  ])('%s = %s', (name, content) => {
    expect(html).toContain(`<meta name="${name}" content="${content}" />`)
  })

  it('setzt die Hintergrundfarbe schon im head-Bereich der Seite', () => {
    expect(html).toContain('<html lang="de" style="background-color: #0f1115">')
  })

  it('verlinkt das Apple-Touch-Icon (180 x 180, nicht transparent)', () => {
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />')
    const icon = pngSize('public/apple-touch-icon.png')
    expect(icon).toMatchObject({ width: 180, height: 180 })
    expect([0, 2]).toContain(icon.colorType) // Graustufen oder RGB, kein Alphakanal
  })
})

describe('Startbilder', () => {
  it('index.html enthält für jede Größe den Link mit passender media-Abfrage', () => {
    const compact = html.replace(/\s+/g, ' ').replace(/ \/>/g, ' />')
    for (const tag of splashLinkTags()) {
      expect(compact).toContain(tag.trim().replace(/\s+/g, ' '))
    }
    expect(html.match(/apple-touch-startup-image/g)).toHaveLength(SPLASH_SIZES.length)
  })

  it('deckt iPhone SE (750x1334) bis 16 Pro Max (1320x2868) ab', () => {
    const names = SPLASH_SIZES.map(splashFileName)
    expect(names).toContain('splash-750x1334.png')
    expect(names).toContain('splash-1320x2868.png')
  })

  it.each(SPLASH_SIZES.map((size) => [splashFileName(size), size] as const))(
    '%s existiert in public/splash mit der Pixelgröße des Dateinamens',
    (name, size) => {
      const path = `public/splash/${name}`
      expect(existsSync(path)).toBe(true)
      expect(pngSize(path)).toMatchObject({
        width: size.cssWidth * size.ratio,
        height: size.cssHeight * size.ratio,
        colorType: 2,
      })
    },
  )

  it('solidPng erzeugt ein gültiges PNG-Gerüst', () => {
    const data = solidPng(4, 3)
    expect(data.readUInt32BE(16)).toBe(4)
    expect(data.readUInt32BE(20)).toBe(3)
    expect(data.subarray(-8, -4).toString('ascii')).toBe('IEND')
  })
})
