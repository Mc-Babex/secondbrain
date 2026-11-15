import { zonedParts } from '../lib/time'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

const pad = (n: number): string => String(n).padStart(2, '0')

/** ID laut SPEC §3.1: `YYYYMMDD-HHmmss-xxxx` in Ortszeit (Europe/Berlin). */
export function newId(date: Date = new Date()): string {
  const p = zonedParts(date)
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}${pad(p.second)}-${suffix}`
}
