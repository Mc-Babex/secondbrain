import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { versionFilePlugin } from './vite.versionPlugin.ts'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

/** Build-Zeit plus Commit (Cloudflare-Variable, sonst Git, sonst „lokal“). */
function buildStamp(): string {
  let commit = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 7) ?? ''
  if (commit === '') {
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim()
    } catch {
      commit = ''
    }
  }
  return `${new Date().toISOString()} ${commit === '' ? 'lokal' : commit}`
}

const stamp = buildStamp()

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_STAMP__: JSON.stringify(stamp),
  },
  plugins: [
    react(),
    versionFilePlugin(pkg.version, stamp),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'SecondBrain',
        short_name: 'SecondBrain',
        lang: 'de',
        id: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Großzügig, damit Tests auch bei hoher Rechnerlast (viele jsdom-Umgebungen, Prozess-Starts) stabil bleiben.
    testTimeout: 20000,
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
})
