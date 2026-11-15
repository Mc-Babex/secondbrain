// Erzeugt einfarbige Startbilder (apple-touch-startup-image) für iPhones: npm run splash
// Nur node:zlib und node:fs, keine zusätzliche Abhängigkeit.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

export const SPLASH_COLOR: readonly [number, number, number] = [0x0f, 0x11, 0x15]

export interface SplashSize {
  /** Breite/Höhe in CSS-Pixeln (device-width/-height) */
  cssWidth: number
  cssHeight: number
  /** Pixeldichte (device-pixel-ratio) */
  ratio: number
}

/** Alle Hochformat-Auflösungen vom iPhone SE (2. Gen.) bis zum iPhone 16 Pro Max. */
export const SPLASH_SIZES: readonly SplashSize[] = [
  { cssWidth: 375, cssHeight: 667, ratio: 2 }, // SE 2./3. Gen., 8
  { cssWidth: 414, cssHeight: 736, ratio: 3 }, // 8 Plus
  { cssWidth: 375, cssHeight: 812, ratio: 3 }, // X, XS, 11 Pro, 12/13 mini
  { cssWidth: 414, cssHeight: 896, ratio: 2 }, // XR, 11
  { cssWidth: 414, cssHeight: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { cssWidth: 360, cssHeight: 780, ratio: 3 }, // 12 mini, 13 mini
  { cssWidth: 390, cssHeight: 844, ratio: 3 }, // 12, 12 Pro, 13, 13 Pro, 14
  { cssWidth: 428, cssHeight: 926, ratio: 3 }, // 12/13 Pro Max, 14 Plus
  { cssWidth: 393, cssHeight: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { cssWidth: 430, cssHeight: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { cssWidth: 402, cssHeight: 874, ratio: 3 }, // 16 Pro
  { cssWidth: 440, cssHeight: 956, ratio: 3 }, // 16 Pro Max
]

export function splashFileName(size: SplashSize): string {
  return `splash-${size.cssWidth * size.ratio}x${size.cssHeight * size.ratio}.png`
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Einfarbiges, nicht transparentes PNG (RGB, 8 Bit). */
export function solidPng(width: number, height: number, color = SPLASH_COLOR): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // Bittiefe
  header[9] = 2 // Farbtyp RGB
  const row = Buffer.alloc(1 + width * 3) // Filterbyte 0 + Pixel
  for (let x = 0; x < width; x++) row.set(color, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function splashLinkTags(): string[] {
  return SPLASH_SIZES.map(
    (size) =>
      `    <link rel="apple-touch-startup-image" href="/splash/${splashFileName(size)}" media="(device-width: ${size.cssWidth}px) and (device-height: ${size.cssHeight}px) and (-webkit-device-pixel-ratio: ${size.ratio}) and (orientation: portrait)" />`,
  )
}

if (process.argv[1]?.endsWith('erzeugen.ts')) {
  mkdirSync('public/splash', { recursive: true })
  for (const size of SPLASH_SIZES) {
    writeFileSync(
      `public/splash/${splashFileName(size)}`,
      solidPng(size.cssWidth * size.ratio, size.cssHeight * size.ratio),
    )
  }
  console.log(splashLinkTags().join('\n'))
}
