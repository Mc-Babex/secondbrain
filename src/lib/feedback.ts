import { CODE_REPO } from './links'
export { CODE_REPO }

export type FeedbackKind = 'fehler' | 'wunsch'

export interface FeedbackInfo {
  appVersion: string
  buildStamp: string
  userAgent: string
  standalone: boolean
}

/** iOS-Version aus dem User-Agent (`OS 17_4_1` → `17.4.1`) oder „–“. */
export function iosVersionFromUserAgent(userAgent: string): string {
  const match = /OS (\d+(?:_\d+){0,2}) like Mac OS X/.exec(userAgent)
  return match?.[1] ? match[1].replaceAll('_', '.') : '–'
}

/** Kurze Angabe „Gerät · System · Browser Hauptversion“ aus dem User-Agent, sonst „unbekannt“. */
export function describeDevice(userAgent: string): string {
  const browser = detectBrowser(userAgent)
  const system = detectSystem(userAgent)
  if (!browser && !system) return 'unbekannt'
  return [system?.device, system?.os, browser].filter(Boolean).join(' · ')
}

function detectBrowser(ua: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/(?:Edg|EdgA|EdgiOS)\/(\d+)/, 'Edge'],
    [/(?:OPR|Opera)\/(\d+)/, 'Opera'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/(\d+)/, 'Chrome'],
  ]
  for (const [regex, name] of rules) {
    const major = regex.exec(ua)?.[1]
    if (major) return `${name} ${major}`
  }
  const safari = /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//.exec(ua)?.[1]
  return safari ? `Safari ${safari}` : null
}

function detectSystem(ua: string): { device: string | null; os: string } | null {
  const ios = /(iPhone|iPad|iPod).*? OS (\d+(?:_\d+)?) like Mac OS X/.exec(ua)
  if (ios?.[1] && ios[2]) return { device: ios[1], os: `iOS ${ios[2].replaceAll('_', '.')}` }
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua)
  if (android?.[1]) return { device: null, os: `Android ${android[1]}` }
  if (/Windows/.test(ua)) return { device: null, os: 'Windows' }
  if (/Macintosh|Mac OS X/.test(ua)) return { device: null, os: 'macOS' }
  if (/CrOS/.test(ua)) return { device: null, os: 'ChromeOS' }
  if (/Linux/.test(ua)) return { device: null, os: 'Linux' }
  return null
}

/** Baut die Issue-URL mit ausschließlich technischen, nicht persönlichen Angaben. */
export function buildFeedbackUrl(kind: FeedbackKind, info: FeedbackInfo): string {
  const params: Array<[string, string]> = [['version', info.appVersion]]
  if (kind === 'fehler') {
    params.push(
      ['build', info.buildStamp],
      ['geraet', describeDevice(info.userAgent)],
      ['ios', iosVersionFromUserAgent(info.userAgent)],
      ['anzeigemodus', info.standalone ? 'installiert' : 'Browser'],
    )
  }
  const query = [`template=${kind}.yml`]
  for (const [key, value] of params) query.push(`${key}=${encodeURIComponent(value)}`)
  return `https://github.com/${CODE_REPO}/issues/new?${query.join('&')}`
}
