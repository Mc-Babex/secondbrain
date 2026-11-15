import { describe, expect, it } from 'vitest'
import fehlerYml from '../../.github/ISSUE_TEMPLATE/fehler.yml?raw'
import wunschYml from '../../.github/ISSUE_TEMPLATE/wunsch.yml?raw'
import {
  buildFeedbackUrl,
  CODE_REPO,
  describeDevice,
  iosVersionFromUserAgent,
  type FeedbackInfo,
} from './feedback'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1'

const info: FeedbackInfo = {
  appVersion: '1.2.3',
  buildStamp: '2026-11-01 10:00',
  userAgent: IPHONE_UA,
  standalone: true,
}

function ids(text: string): string[] {
  return [...text.matchAll(/^\s+id: (\S+)$/gm)].map((m) => m[1] as string)
}

function keys(kind: 'fehler' | 'wunsch'): string[] {
  return [...new URL(buildFeedbackUrl(kind, info)).searchParams.keys()]
}

describe('describeDevice', () => {
  it('kürzt iPhone-Safari', () => {
    expect(describeDevice(IPHONE_UA)).toBe('iPhone · iOS 18.7 · Safari 18')
  })

  it('erkennt Edge unter Windows', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'
    expect(describeDevice(ua)).toBe('Windows · Edge 141')
  })

  it('erkennt Chrome unter Android', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
    expect(describeDevice(ua)).toBe('Android 14 · Chrome 130')
  })

  it('liefert „unbekannt“ bei unbekanntem User-Agent', () => {
    expect(describeDevice('')).toBe('unbekannt')
    expect(describeDevice('irgendwas')).toBe('unbekannt')
  })
})

describe('Issue-Formulare', () => {
  it('haben required: true für das Pflichtfeld', () => {
    const required = (yml: string, id: string): boolean => {
      const block = yml.split('\n  - type:').find((part) => part.includes(`id: ${id}\n`))
      return block?.includes('required: true') === true
    }
    expect(required(fehlerYml, 'was')).toBe(true)
    expect(required(wunschYml, 'wunsch')).toBe(true)
  })
})

describe('buildFeedbackUrl', () => {
  it('baut die Fehler-URL mit genau den erlaubten Parametern, kodiert', () => {
    const url = new URL(buildFeedbackUrl('fehler', info))
    expect(url.origin + url.pathname).toBe(`https://github.com/${CODE_REPO}/issues/new`)
    expect(keys('fehler')).toEqual([
      'template',
      'version',
      'build',
      'geraet',
      'ios',
      'anzeigemodus',
    ])
    expect(url.searchParams.get('template')).toBe('fehler.yml')
    expect(url.searchParams.get('build')).toBe('2026-11-01 10:00')
    expect(url.searchParams.get('geraet')).toBe('iPhone · iOS 18.7 · Safari 18')
    expect(url.searchParams.get('ios')).toBe('18.7')
    expect(url.searchParams.get('anzeigemodus')).toBe('installiert')
    expect(buildFeedbackUrl('fehler', info)).toContain('build=2026-11-01%2010%3A00')
  })

  it('baut die Wunsch-URL nur mit Version', () => {
    const url = new URL(buildFeedbackUrl('wunsch', info))
    expect(keys('wunsch')).toEqual(['template', 'version'])
    expect(url.searchParams.get('template')).toBe('wunsch.yml')
  })

  it('nutzt „–“ ohne iOS und „Browser“ im Browser', () => {
    expect(iosVersionFromUserAgent('Mozilla/5.0 (Windows NT 10.0) Edg/120')).toBe('–')
    const url = new URL(
      buildFeedbackUrl('fehler', { ...info, userAgent: 'Windows', standalone: false }),
    )
    expect(url.searchParams.get('ios')).toBe('–')
    expect(url.searchParams.get('anzeigemodus')).toBe('Browser')
  })

  it('enthält weder Repo, Token, Konto noch Eintragstitel', () => {
    const secrets = ['alex/daten', 'github_pat_GEHEIM_999', 'alex@example.com', 'Zahnarzt anrufen']
    for (const kind of ['fehler', 'wunsch'] as const) {
      const url = decodeURIComponent(buildFeedbackUrl(kind, info))
      for (const secret of secrets) expect(url).not.toContain(secret)
      expect(url).not.toMatch(/github_pat_|ghp_/)
    }
  })

  it('stimmt mit den ids der Issue-Formulare überein', () => {
    for (const key of keys('fehler').filter((k) => k !== 'template')) {
      expect(ids(fehlerYml)).toContain(key)
    }
    for (const key of keys('wunsch').filter((k) => k !== 'template')) {
      expect(ids(wunschYml)).toContain(key)
    }
  })
})
