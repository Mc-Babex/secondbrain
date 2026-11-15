import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearErrorLog, getErrorLog } from './errorLog'
import { encodeBase64 } from './github'
import { putFileFromRemote, putFileLocal, resetDb, setSecret } from './localStore'
import { createSortTrigger, type SortTrigger } from './sortTrigger'
import { syncNow } from './sync'
import { setFormatCheck } from './syncStatus'
import { MSG_DATA_FORMAT_NEWER } from '../lib/dataFormat'

vi.mock('./sync', () => ({ syncNow: vi.fn(async () => undefined) }))

const TOKEN = 'ghp_geheimerTestToken123'
const START = '2026-10-21T14:00:00+02:00'
const OFFLINE_MSG = 'Offline – Sortieren braucht Internet.'
const LOCKED_START = '2026-10-21T13:55:00+02:00'

let remote: Map<string, unknown>
let postStatus: number
let postThrows: boolean
let lockOnPost: boolean
let triggerResult: string | null
let triggerExtra: Record<string, unknown>
let fetchMock: ReturnType<typeof vi.fn>
let triggers: SortTrigger[]
let onLine: boolean

const posts = (): unknown[][] => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')

async function seedWork(): Promise<void> {
  await putFileFromRemote(
    'inbox/a.json',
    { id: 'a', text: 'Milch', createdAt: START, source: 'text' },
    'sha-a',
  )
}

function install(): SortTrigger {
  const trigger = createSortTrigger()
  triggers.push(trigger)
  return trigger
}

/** Echter Makrotask (nicht von Fake-Timern betroffen), damit IndexedDB-Rückrufe ablaufen. */
const macrotask = (): Promise<void> =>
  new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await macrotask()
}

async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await flush()
}

/** Lässt die Fake-Uhr laufen, bis das Versprechen erfüllt ist. */
async function run(promise: Promise<unknown>): Promise<void> {
  let done = false
  void promise.then(() => {
    done = true
  })
  for (let i = 0; i < 400 && !done; i += 1) {
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
  }
  await promise
}

beforeEach(async () => {
  await resetDb(true)
  await setSecret('githubToken', TOKEN)
  await setSecret('githubRepo', 'alex/daten')
  remote = new Map()
  postStatus = 204
  postThrows = false
  lockOnPost = false
  triggerResult = 'gestartet'
  triggerExtra = {}
  triggers = []
  onLine = true
  localStorage.clear()
  vi.mocked(syncNow).mockClear()
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => onLine)
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  })
  vi.setSystemTime(new Date(START))
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (postThrows) throw new TypeError('network')
      if (lockOnPost) {
        remote.set('runs/started.json', {
          requestId: 'alt',
          startedAt: new Date().toISOString(),
          status: 'gestartet',
        })
      }
      if (postStatus === 204 && triggerResult !== null) {
        const body = JSON.parse(String(init.body)) as { client_payload: { requestId: string } }
        remote.set('runs/trigger.json', {
          requestId: body.client_payload.requestId,
          at: START,
          result: triggerResult,
          message: '',
          ...triggerExtra,
        })
      }
      return new Response(postStatus === 204 ? null : '{}', { status: postStatus })
    }
    const path = decodeURIComponent(/\/contents\/([^?]+)/.exec(url)?.[1] ?? '')
    if (!remote.has(path)) return new Response('{}', { status: 404 })
    return new Response(
      JSON.stringify({ content: encodeBase64(JSON.stringify(remote.get(path))), sha: 'x' }),
      { status: 200 },
    )
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  for (const trigger of triggers) trigger.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const NOT_SET_UP_MSG =
  'Automatisches Sortieren ist nicht eingerichtet. Einträge über ‚In Ablage…‘ einsortieren oder in den Einstellungen einrichten.'

describe('Sortieren ohne Claude', () => {
  it('startet bei autoSort: false nichts – auch offline und ohne Token', async () => {
    await seedWork()
    await putFileLocal('settings.json', {
      planningWindow: { start: '09:00', end: '19:00' },
      timezone: 'Europe/Berlin',
      autoSort: false,
    })
    onLine = false
    await setSecret('githubToken', '')
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'idle', message: NOT_SET_UP_MSG })
    expect(syncNow).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('behandelt die Antwort „nicht-eingerichtet“ als Hinweis ohne Fehlereintrag', async () => {
    await seedWork()
    clearErrorLog()
    triggerResult = 'nicht-eingerichtet'
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'idle', message: NOT_SET_UP_MSG })
    expect(posts()).toHaveLength(1)
    expect(getErrorLog()).toHaveLength(0)
  })
})

describe('Vorprüfungen', () => {
  it('meldet „Nichts zu sortieren“ ohne Arbeit und startet nicht', async () => {
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'idle', message: 'Nichts zu sortieren' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('startet nicht, wenn das Daten-Repo ein neueres Format hat', async () => {
    await seedWork()
    setFormatCheck({ sha: 'x', problem: MSG_DATA_FORMAT_NEWER })
    try {
      const trigger = install()
      await run(trigger.start())
      expect(trigger.getState()).toEqual({ phase: 'idle', message: MSG_DATA_FORMAT_NEWER })
      expect(posts()).toHaveLength(0)
    } finally {
      setFormatCheck(null)
    }
  })

  it('zählt Einträge mit sortError (auch ungültig geformt) nicht als Arbeit', async () => {
    await putFileFromRemote(
      'inbox/a.json',
      { id: 'a', text: 'x', createdAt: START, sortError: 'kaputt' },
      's1',
    )
    await putFileFromRemote(
      'inbox/b.json',
      { id: 'b', text: 'y', createdAt: START, sortError: { message: 'm', at: START } },
      's2',
    )
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState().message).toBe('Nichts zu sortieren')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('zählt eine wichtige Aufgabe ohne Termin als Arbeit', async () => {
    await putFileFromRemote(
      'items/i.json',
      {
        id: 'i',
        type: 'aufgabe',
        title: 'Wichtig',
        categoryId: 'privat',
        status: 'offen',
        important: true,
        schedule: null,
        createdAt: START,
        updatedAt: START,
      },
      's1',
    )
    const trigger = install()
    await run(trigger.start())
    expect(posts()).toHaveLength(1)
  })

  it('meldet offline ohne Anfrage', async () => {
    await seedWork()
    onLine = false
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'idle', message: OFFLINE_MSG })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verweist ohne Token auf die Einstellungen', async () => {
    await resetDb(true)
    await seedWork()
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState().message).toBe('GitHub in den Einstellungen verbinden.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('meldet, wenn nach dem Sync noch etwas in der Outbox liegt', async () => {
    await putFileLocal('inbox/neu.json', { id: 'neu', text: 'x', createdAt: START })
    const trigger = install()
    await run(trigger.start())
    expect(syncNow).toHaveBeenCalledTimes(1)
    expect(trigger.getState().message).toBe(
      'Noch nicht alles hochgeladen – bitte gleich erneut versuchen.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('meldet „läuft bereits“ bei aktiver Sperre und startet nicht', async () => {
    await seedWork()
    remote.set('runs/started.json', {
      requestId: 'alt',
      startedAt: LOCKED_START,
      status: 'gestartet',
    })
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState().message).toBe('Sortierung läuft bereits.')
    expect(posts()).toHaveLength(0)
  })

  it('startet trotz started.json, wenn der Lauf laut last.json fertig ist', async () => {
    await seedWork()
    remote.set('runs/started.json', {
      requestId: 'alt',
      startedAt: LOCKED_START,
      status: 'gestartet',
    })
    remote.set('runs/last.json', { finishedAt: '2026-10-21T13:58:00+02:00' })
    const trigger = install()
    await run(trigger.start())
    expect(posts()).toHaveLength(1)
  })
})

describe('Start', () => {
  it('sendet repository_dispatch mit requestId, ohne Token in der Meldung', async () => {
    await seedWork()
    const trigger = install()
    await run(trigger.start())
    const [url, init] = posts()[0] as [string, RequestInit]
    expect(url).toBe('https://api.github.com/repos/alex/daten/dispatches')
    const body = JSON.parse(String(init.body)) as {
      event_type: string
      client_payload: { requestId: string }
    }
    expect(body.event_type).toBe('sortieren')
    expect(body.client_payload.requestId).toMatch(/^\d{8}-\d{6}-[a-z0-9]{4}$/)
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(headers.Accept).toBe('application/vnd.github+json')
    expect(trigger.getState().message).toBe('Sortierung gestartet')
    expect(JSON.stringify(trigger.getState())).not.toContain(TOKEN)
    expect(url).not.toContain(TOKEN)
  })

  it.each([
    ['gestartet', {}, 'Sortierung gestartet', 'laeuft'],
    ['nichts', {}, 'Nichts zu sortieren', 'idle'],
    ['laeuft', {}, 'Sortierung läuft bereits.', 'idle'],
    [
      'abgelehnt',
      { message: 'HTTP 429', retryAfter: '2026-10-21T15:30:00+02:00' },
      'Start abgelehnt: Limit erreicht, bitte später erneut versuchen (ab 15:30).',
      'idle',
    ],
    ['abgelehnt', { message: 'HTTP 401' }, 'Start abgelehnt (Fehler 401).', 'idle'],
    ['unklar', {}, 'Start unklar – in 20 Min. erneut versuchen.', 'idle'],
    ['fehler', {}, 'Start fehlgeschlagen – bitte später erneut versuchen.', 'idle'],
  ])('zeigt für result %s die passende Meldung', async (result, extra, message, phase) => {
    await seedWork()
    triggerResult = result
    triggerExtra = extra
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase, message })
  })

  it('ignoriert eine trigger.json mit fremder requestId und gibt nach 2 Min. auf', async () => {
    await seedWork()
    triggerResult = null
    remote.set('runs/trigger.json', { requestId: 'fremd', at: START, result: 'nichts' })
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({
      phase: 'idle',
      message: 'Start fehlgeschlagen – bitte später erneut versuchen.',
    })
    const triggerReads = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('runs/trigger.json'),
    )
    expect(triggerReads).toHaveLength(24)
  })

  it('ist während Prüfung und Warten gesperrt (Phasen pruefen, warten, idle)', async () => {
    await seedWork()
    triggerResult = null
    const trigger = install()
    const seen: string[] = []
    trigger.subscribe(() => seen.push(trigger.getState().phase))
    const started = trigger.start()
    expect(trigger.getState().phase).toBe('pruefen')
    await run(started)
    expect(seen).toEqual(['pruefen', 'warten', 'idle'])
  })

  it('führt bei Doppelklick und erneutem Tippen während des Laufs genau einen Dispatch aus', async () => {
    await seedWork()
    const trigger = install()
    const first = trigger.start()
    const second = trigger.start()
    await run(Promise.all([first, second]))
    expect(trigger.getState().phase).toBe('laeuft')
    await trigger.start()
    expect(posts()).toHaveLength(1)
  })
})

describe('Sperre bei laeuft und unklar', () => {
  const lock = { requestId: 'alt', startedAt: START, status: 'gestartet' }

  it.each([
    ['laeuft', 'Sortierung läuft bereits.'],
    ['unklar', 'Start unklar – in 20 Min. erneut versuchen.'],
  ])('bleibt bei %s mit aktiver Sperre gesperrt', async (result, message) => {
    await seedWork()
    triggerResult = result
    const trigger = install()
    lockOnPost = true
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'laeuft', message })
    remote.set('runs/last.json', { finishedAt: '2099-01-01T00:00:00+02:00' })
    await advance(30_000)
    await vi.waitFor(() => expect(trigger.getState().phase).toBe('idle'))
    expect(trigger.getState().message).toBe(message)
  })

  it('gibt bei laeuft ohne aktive Sperre frei', async () => {
    await seedWork()
    triggerResult = 'laeuft'
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'idle', message: 'Sortierung läuft bereits.' })
  })

  it('bleibt beim Vorab-Check mit aktiver Sperre gesperrt und beobachtet sie', async () => {
    await seedWork()
    remote.set('runs/started.json', { ...lock, startedAt: LOCKED_START })
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'laeuft', message: 'Sortierung läuft bereits.' })
    expect(posts()).toHaveLength(0)
    remote.set('runs/last.json', { finishedAt: '2099-01-01T00:00:00+02:00' })
    await advance(30_000)
    await vi.waitFor(() => expect(trigger.getState().phase).toBe('idle'))
  })
})

describe('GitHub-Fehler beim Dispatch', () => {
  it.each([
    [401, 'GitHub hat den Zugriff abgelehnt. Bitte Token und Berechtigungen prüfen.'],
    [404, 'Repository nicht gefunden oder kein Zugriff.'],
    [
      422,
      'GitHub hat die Anfrage abgelehnt, evtl. zu viele Anfragen. Bitte später erneut versuchen.',
    ],
    [500, 'GitHub meldet einen Fehler. Bitte später erneut versuchen.'],
  ])(
    'übersetzt Status %i in eine deutsche Meldung und gibt den Knopf frei',
    async (status, text) => {
      await seedWork()
      postStatus = status
      const trigger = install()
      await run(trigger.start())
      expect(trigger.getState()).toEqual({ phase: 'idle', message: text })
    },
  )

  it('meldet Netzfehler als offline', async () => {
    await seedWork()
    postThrows = true
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState()).toEqual({ phase: 'idle', message: OFFLINE_MSG })
  })
})

describe('Sperre nach dem Start', () => {
  async function startLocked(): Promise<SortTrigger> {
    await seedWork()
    const trigger = install()
    await run(trigger.start())
    expect(trigger.getState().phase).toBe('laeuft')
    return trigger
  }

  it('bleibt gesperrt, solange last.json nicht nach startedAt fertig ist', async () => {
    const trigger = await startLocked()
    remote.set('runs/last.json', { finishedAt: '2026-10-21T13:00:00+02:00' })
    await advance(30_000)
    await advance(30_000)
    expect(trigger.getState().phase).toBe('laeuft')
    expect(syncNow).toHaveBeenCalledTimes(1)
  })

  it('gibt frei und synchronisiert, sobald last.json nach startedAt fertig meldet', async () => {
    const trigger = await startLocked()
    remote.set('runs/last.json', { finishedAt: '2099-01-01T00:00:00+02:00' })
    await advance(30_000)
    await vi.waitFor(() => expect(trigger.getState().phase).toBe('idle'))
    expect(syncNow).toHaveBeenCalledTimes(2)
    expect(trigger.getState().message).toBe('Sortierung gestartet')
  })

  it('gibt nach 20 Minuten auch ohne last.json frei', async () => {
    const trigger = await startLocked()
    await advance(19 * 60_000)
    expect(trigger.getState().phase).toBe('laeuft')
    await advance(2 * 60_000)
    await vi.waitFor(() => expect(trigger.getState().phase).toBe('idle'))
    expect(syncNow).toHaveBeenCalledTimes(2)
  })

  it('liest last.json bei unsichtbarer Seite nicht', async () => {
    const trigger = await startLocked()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const before = fetchMock.mock.calls.length
    await advance(60_000)
    expect(fetchMock.mock.calls.length).toBe(before)
    expect(trigger.getState().phase).toBe('laeuft')
    visibility.mockRestore()
  })
})

describe('Wiederherstellung nach dem Laden', () => {
  it('stellt die Sperre aus started.json wieder her', async () => {
    remote.set('runs/started.json', { requestId: 'alt', startedAt: LOCKED_START, status: 'unklar' })
    const trigger = install()
    await trigger.restore()
    expect(trigger.getState().phase).toBe('laeuft')
    expect(posts()).toHaveLength(0)
  })

  it('lässt den Knopf frei bei abgelaufener, beendeter oder fehlender Sperre', async () => {
    const none = install()
    await none.restore()
    expect(none.getState().phase).toBe('idle')

    remote.set('runs/started.json', {
      requestId: 'alt',
      startedAt: LOCKED_START,
      status: 'gestartet',
    })
    remote.set('runs/last.json', { finishedAt: '2026-10-21T13:58:00+02:00' })
    const done = install()
    await done.restore()
    expect(done.getState().phase).toBe('idle')

    remote.delete('runs/last.json')
    vi.setSystemTime(new Date('2026-10-21T14:30:00+02:00'))
    const expired = install()
    await expired.restore()
    expect(expired.getState().phase).toBe('idle')
  })

  it('fragt offline oder ohne Token nichts ab', async () => {
    remote.set('runs/started.json', {
      requestId: 'alt',
      startedAt: LOCKED_START,
      status: 'gestartet',
    })
    onLine = false
    const offline = install()
    await offline.restore()
    expect(offline.getState().phase).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()

    onLine = true
    await resetDb(true)
    const noToken = install()
    await noToken.restore()
    expect(noToken.getState().phase).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gibt die wiederhergestellte Sperre frei, wenn last.json fertig meldet', async () => {
    remote.set('runs/started.json', {
      requestId: 'alt',
      startedAt: LOCKED_START,
      status: 'gestartet',
    })
    const trigger = install()
    await trigger.restore()
    remote.set('runs/last.json', { finishedAt: '2026-10-21T14:02:00+02:00' })
    await advance(30_000)
    await vi.waitFor(() => expect(trigger.getState().phase).toBe('idle'))
  })
})

describe('Offene Anfrage und Neustart', () => {
  const PENDING_KEY = 'secondbrain.pendingSort'

  async function sendAndRestart(): Promise<{ requestId: string; restarted: SortTrigger }> {
    await seedWork()
    triggerResult = null
    const first = install()
    void first.start()
    await vi.waitFor(() => expect(localStorage.getItem(PENDING_KEY)).not.toBeNull())
    first.dispose()
    const [, init] = posts()[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as { client_payload: { requestId: string } }
    const restarted = createSortTrigger({ restoring: true })
    triggers.push(restarted)
    return { requestId: body.client_payload.requestId, restarted }
  }

  it('bleibt nach Neustart vor started.json gesperrt und wartet auf die Antwort', async () => {
    const { requestId, restarted } = await sendAndRestart()
    expect(restarted.getState().phase).toBe('pruefen')
    const restoring = restarted.restore()
    await advance(5000)
    expect(restarted.getState().phase).toBe('warten')
    await restarted.start()
    expect(posts()).toHaveLength(1)

    remote.set('runs/trigger.json', { requestId, at: START, result: 'gestartet', message: '' })
    await run(restoring)
    expect(restarted.getState()).toEqual({ phase: 'laeuft', message: 'Sortierung gestartet' })
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
    expect(posts()).toHaveLength(1)
  })

  it('verwirft eine offene Anfrage mit vorhandener Antwort und zeigt sie an', async () => {
    const { requestId, restarted } = await sendAndRestart()
    remote.set('runs/trigger.json', { requestId, at: START, result: 'nichts', message: '' })
    await run(restarted.restore())
    expect(restarted.getState()).toEqual({ phase: 'idle', message: 'Nichts zu sortieren' })
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('verwirft eine offene Anfrage, die älter als 2 Minuten ist', async () => {
    await seedWork()
    const sentAt = new Date(new Date(START).getTime() - 3 * 60_000).toISOString()
    localStorage.setItem(PENDING_KEY, JSON.stringify({ requestId: 'alt', sentAt }))
    const restarted = createSortTrigger({ restoring: true })
    triggers.push(restarted)
    await run(restarted.restore())
    expect(restarted.getState()).toEqual({ phase: 'idle', message: null })
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
    await run(restarted.start())
    expect(posts()).toHaveLength(1)
  })

  it('gibt nach Ablauf der 2 Minuten ohne Antwort frei', async () => {
    const { restarted } = await sendAndRestart()
    await run(restarted.restore())
    expect(restarted.getState().phase).toBe('idle')
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('meldet bei offener Anfrage nach Restore ohne Netz oder Token „läuft bereits“ ohne Dispatch', async () => {
    const sentAt = new Date().toISOString()
    localStorage.setItem(PENDING_KEY, JSON.stringify({ requestId: 'offen', sentAt }))
    onLine = false
    const offline = createSortTrigger({ restoring: true })
    triggers.push(offline)
    await offline.restore()
    await offline.start()
    expect(offline.getState()).toEqual({ phase: 'idle', message: 'Sortierung läuft bereits.' })

    onLine = true
    await resetDb(true)
    const noToken = createSortTrigger({ restoring: true })
    triggers.push(noToken)
    await noToken.restore()
    await noToken.start()
    expect(noToken.getState()).toEqual({ phase: 'idle', message: 'Sortierung läuft bereits.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ist ohne Netz sofort idle, nicht dauerhaft in pruefen', async () => {
    onLine = false
    const restarted = createSortTrigger({ restoring: true })
    triggers.push(restarted)
    await restarted.restore()
    expect(restarted.getState().phase).toBe('idle')
  })
})
