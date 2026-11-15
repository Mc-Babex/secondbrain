import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleOAuth2, TokenClientConfig, TokenRequestOptions } from './types'

const SECRET = 'ya29.GEHEIMES-TOKEN-xyz'

interface Mock {
  oauth2: GoogleOAuth2
  prompts: (string | undefined)[]
  respond: (config: TokenClientConfig) => void
}

function installGoogle(): Mock {
  const prompts: (string | undefined)[] = []
  const mock: Mock = {
    prompts,
    respond: (config) => config.callback({ access_token: SECRET, expires_in: 3600 }),
    oauth2: {
      initTokenClient: vi.fn((config: TokenClientConfig) => ({
        requestAccessToken: (options?: TokenRequestOptions) => {
          prompts.push(options?.prompt)
          mock.respond(config)
        },
      })),
      revoke: vi.fn((_token: string, done?: () => void) => done?.()),
    },
  }
  window.google = { accounts: { oauth2: mock.oauth2 } }
  return mock
}

async function loadAuth() {
  vi.resetModules()
  return import('./auth')
}

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id-test')
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  delete window.google
})

describe('google/auth', () => {
  it('fordert beim ersten interaktiven Mal mit Zustimmung an und nutzt danach den Speicher', async () => {
    const mock = installGoogle()
    const auth = await loadAuth()
    expect(await auth.getAccessToken({ interactive: true })).toBe(SECRET)
    expect(await auth.getAccessToken({ interactive: true })).toBe(SECRET)
    expect(mock.prompts).toEqual(['consent'])
    expect(mock.oauth2.initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-id-test',
        scope: 'https://www.googleapis.com/auth/calendar.events',
      }),
    )
  })

  it('erneuert abgelaufene Token (60 s Puffer) ohne Zustimmung', async () => {
    const mock = installGoogle()
    const auth = await loadAuth()
    await auth.getAccessToken({ interactive: true })
    vi.advanceTimersByTime(3600_000 - 61_000)
    await auth.getAccessToken({ interactive: true })
    expect(mock.prompts).toEqual(['consent'])
    vi.advanceTimersByTime(2_000)
    await auth.getAccessToken({ interactive: false })
    expect(mock.prompts).toEqual(['consent', ''])
  })

  it('stille Anfrage verwendet prompt "" auch beim ersten Mal', async () => {
    const mock = installGoogle()
    const auth = await loadAuth()
    await auth.getAccessToken({ interactive: false })
    expect(mock.prompts).toEqual([''])
  })

  it('meldet abgelehnte Anfragen als unauthorized', async () => {
    const mock = installGoogle()
    mock.respond = (config) => config.callback({ error: 'access_denied' })
    const auth = await loadAuth()
    await expect(auth.getAccessToken({ interactive: true })).rejects.toMatchObject({
      kind: 'unauthorized',
    })
  })

  it('disconnect widerruft das Token und leert Speicher und Flag', async () => {
    const mock = installGoogle()
    const auth = await loadAuth()
    await auth.getAccessToken({ interactive: true })
    expect(auth.wasConnected()).toBe(true)
    await auth.disconnect()
    expect(mock.oauth2.revoke).toHaveBeenCalledWith(SECRET, expect.any(Function))
    expect(auth.wasConnected()).toBe(false)
    await auth.getAccessToken({ interactive: true })
    expect(mock.prompts).toEqual(['consent', 'consent'])
  })

  describe('Anmeldehinweis', () => {
    function lastConfig(mock: Mock): TokenClientConfig {
      const calls = vi.mocked(mock.oauth2.initTokenClient).mock.calls
      return calls[calls.length - 1][0]
    }

    it('übergibt gemerkte E-Mail als login_hint mit prompt ""', async () => {
      localStorage.setItem('secondbrain.googleConnected', '1')
      localStorage.setItem('secondbrain.googleAccount', 'name@gmail.com')
      const mock = installGoogle()
      const auth = await loadAuth()
      await auth.getAccessToken({ interactive: true })
      expect(lastConfig(mock).login_hint).toBe('name@gmail.com')
      expect(mock.prompts).toEqual([''])
    })

    it('übergibt keinen Hinweis ohne Konto oder ohne @', async () => {
      localStorage.setItem('secondbrain.googleConnected', '1')
      const mock = installGoogle()
      const auth = await loadAuth()
      await auth.getAccessToken({ interactive: true })
      expect(lastConfig(mock)).not.toHaveProperty('login_hint')

      auth.discardToken()
      auth.setAccountName('Mein Kalender')
      await auth.getAccessToken({ interactive: true })
      expect(lastConfig(mock)).not.toHaveProperty('login_hint')
    })

    it('fordert beim ersten Verbinden Zustimmung ohne Hinweis an', async () => {
      const mock = installGoogle()
      const auth = await loadAuth()
      await auth.getAccessToken({ interactive: true })
      expect(lastConfig(mock)).not.toHaveProperty('login_hint')
      expect(mock.prompts).toEqual(['consent'])
    })

    it('übergibt nach disconnect keinen Hinweis mehr', async () => {
      localStorage.setItem('secondbrain.googleConnected', '1')
      localStorage.setItem('secondbrain.googleAccount', 'name@gmail.com')
      const mock = installGoogle()
      const auth = await loadAuth()
      await auth.getAccessToken({ interactive: true })
      await auth.disconnect()
      await auth.getAccessToken({ interactive: true })
      expect(lastConfig(mock)).not.toHaveProperty('login_hint')
      expect(mock.prompts).toEqual(['', 'consent'])
    })
  })

  it('meldet fehlende Client-ID verständlich', async () => {
    installGoogle()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '')
    const auth = await loadAuth()
    expect(auth.hasClientId()).toBe(false)
    await expect(auth.getAccessToken({ interactive: true })).rejects.toThrow(
      'Google-Client-ID fehlt (VITE_GOOGLE_CLIENT_ID)',
    )
  })

  it('legt das Token nie in localStorage ab', async () => {
    installGoogle()
    const auth = await loadAuth()
    await auth.getAccessToken({ interactive: true })
    const stored = JSON.stringify({ ...localStorage })
    expect(stored).not.toContain(SECRET)
    expect(stored).toContain('secondbrain.googleConnected')
  })
})
