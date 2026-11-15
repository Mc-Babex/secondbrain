import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFileLocal, putFileLocal } from '../../data/localStore'
import * as repository from '../../data/repository'
import { PageActiveContext } from '../../lib/pageActive'
import { hasUnsavedWork } from '../../lib/unsavedWork'
import { START_WAIT_MS } from '../../speech/recognizer'
import { CapturePage } from './CapturePage'

class FakeRecognition {
  static last: FakeRecognition | undefined
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: unknown) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onend: (() => void) | null = null
  onaudiostart: (() => void) | null = null
  start = vi.fn()
  static lateFinal: string | undefined
  stop = vi.fn(() => {
    const late = FakeRecognition.lateFinal
    if (late === undefined) {
      this.onend?.()
      return
    }
    setTimeout(() => {
      this.onresult?.({
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: late } } },
      })
      this.onend?.()
    }, 20)
  })
  abort = vi.fn(() => {
    this.onresult = null
    this.onerror = null
    this.onend = null
  })
  constructor() {
    FakeRecognition.last = this
  }
}

function fake(): FakeRecognition {
  if (!FakeRecognition.last) throw new Error('kein Erkenner erzeugt')
  return FakeRecognition.last
}

const speak = (transcript: string, isFinal: boolean) =>
  act(() => {
    fake().onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript } } },
    })
  })

async function clearInbox() {
  for (const entry of await repository.listInbox()) await repository.deleteInboxEntry(entry.id)
}

beforeEach(async () => {
  sessionStorage.clear()
  FakeRecognition.last = undefined
  FakeRecognition.lateFinal = undefined
  await clearInbox()
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Reflect.deleteProperty(window, 'webkitSpeechRecognition')
})

describe('CapturePage', () => {
  it('legt getrimmten Text als text ab und leert das Feld', async () => {
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.type(screen.getByLabelText('Text'), '  Milch kaufen  ')
    await user.click(screen.getByRole('button', { name: 'Ablegen' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Im Eingangskorb'))
    const entries = await repository.listInbox()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ text: 'Milch kaufen', source: 'text' })
    expect(screen.getByLabelText('Text')).toHaveValue('')
    expect(screen.getByLabelText('Text')).toHaveFocus()
    await waitFor(() => expect(screen.getByText('1 im Eingangskorb')).toBeInTheDocument())
  })

  it('Strg+Enter legt ab, Enter allein macht Zeilenumbruch', async () => {
    const user = userEvent.setup()
    render(<CapturePage />)
    const input = screen.getByLabelText('Text')
    await user.type(input, 'a{Enter}b')
    expect(input).toHaveValue('a\nb')
    expect(await repository.listInbox()).toHaveLength(0)
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(async () => expect(await repository.listInbox()).toHaveLength(1))
    expect(input).toHaveValue('')
  })

  it('deaktiviert Ablegen bei leerem Text', async () => {
    const user = userEvent.setup()
    render(<CapturePage />)
    const button = screen.getByRole('button', { name: 'Ablegen' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Text'), '   ')
    expect(button).toBeDisabled()
    expect(await repository.listInbox()).toHaveLength(0)
  })

  it('hängt Sprachergebnisse an und legt als sprache ab', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.type(screen.getByLabelText('Text'), 'Start')
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    expect(fake().start).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Spracheingabe beenden' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    speak('Zwischen', false)
    expect(screen.getByText('Zwischen')).toBeInTheDocument()
    speak('Zwischen', true)
    expect(screen.getByLabelText('Text')).toHaveValue('Start Zwischen')
    await user.click(screen.getByRole('button', { name: 'Ablegen' }))
    expect(fake().stop).toHaveBeenCalled()
    await waitFor(async () => expect(await repository.listInbox()).toHaveLength(1))
    expect((await repository.listInbox())[0].source).toBe('sprache')
  })

  it('stoppt die Spracherkennung beim Verlassen der Seite und behält den Text', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const user = userEvent.setup()
    const page = (active: boolean) => (
      <PageActiveContext.Provider value={active}>
        <CapturePage />
      </PageActiveContext.Provider>
    )
    const { rerender } = render(page(true))
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    speak('Eingesprochen', true)
    rerender(page(false))
    await waitFor(() => expect(fake().stop).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Spracheingabe starten' })).toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Text')).toHaveValue('Eingesprochen')
  })

  it('Knopf beendet die Aufnahme', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    await user.click(screen.getByRole('button', { name: 'Spracheingabe beenden' }))
    expect(fake().stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Spracheingabe starten' })).toBeInTheDocument()
  })

  it('zeigt Hinweis ohne Spracherkennung', () => {
    render(<CapturePage />)
    expect(screen.getByRole('button', { name: 'Spracheingabe starten' })).toBeDisabled()
    expect(screen.getByText(/Win \+ H/)).toBeInTheDocument()
  })

  it('zeigt Hinweis bei verweigertem Mikrofon', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    act(() => fake().onerror?.({ error: 'not-allowed' }))
    expect(screen.getByRole('button', { name: 'Spracheingabe starten' })).toBeDisabled()
    expect(screen.getByText(/Win \+ H/)).toBeInTheDocument()
  })

  it('behält den Text bei Speicherfehler', async () => {
    vi.spyOn(repository, 'addInboxEntry').mockRejectedValue(new Error('kaputt'))
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.type(screen.getByLabelText('Text'), 'Wichtig')
    await user.click(screen.getByRole('button', { name: 'Ablegen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen')
    expect(screen.getByLabelText('Text')).toHaveValue('Wichtig')
  })

  it('Entwurf übersteht Unmount/Remount', async () => {
    const user = userEvent.setup()
    const first = render(<CapturePage />)
    await user.type(screen.getByLabelText('Text'), 'Entwurf')
    first.unmount()
    render(<CapturePage />)
    expect(screen.getByLabelText('Text')).toHaveValue('Entwurf')
  })

  it('Ablegen während der Aufnahme wartet auf das späte Endergebnis', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    FakeRecognition.lateFinal = 'Ende'
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    speak('Anfang', true)
    await user.click(screen.getByRole('button', { name: 'Ablegen' }))
    expect(screen.getByRole('button', { name: 'Ablegen' })).toBeDisabled()
    await waitFor(async () => expect(await repository.listInbox()).toHaveLength(1))
    expect((await repository.listInbox())[0]).toMatchObject({
      text: 'Anfang Ende',
      source: 'sprache',
    })
    expect(screen.getByLabelText('Text')).toHaveValue('')
    expect(sessionStorage.length).toBe(0)
    expect(fake().abort).toHaveBeenCalled()
  })

  it('nimmt ein sichtbares Zwischenergebnis mit, wenn kein finales kommt', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    speak('nur vorläufig', false)
    await user.click(screen.getByRole('button', { name: 'Ablegen' }))
    await waitFor(async () => expect(await repository.listInbox()).toHaveLength(1))
    expect((await repository.listInbox())[0].text).toBe('nur vorläufig')
  })

  it('bricht beim Unmount die Aufnahme ab und ignoriert spätere Ergebnisse', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    const view = render(<CapturePage />)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    const recognition = fake()
    view.unmount()
    expect(recognition.abort).toHaveBeenCalled()
    expect(recognition.onresult).toBeNull()
    expect(recognition.onend).toBeNull()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('zeigt „Zuletzt sortiert“ nur mit runs/last.json', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T15:00:00+02:00') })
    try {
      const { unmount } = render(<CapturePage />)
      await screen.findByText('0 im Eingangskorb')
      expect(screen.queryByText(/Zuletzt sortiert/)).not.toBeInTheDocument()
      unmount()
      await putFileLocal('runs/last.json', { finishedAt: '2026-10-21T14:05:00+02:00' })
      render(<CapturePage />)
      expect(await screen.findByText('Zuletzt sortiert: 14:05')).toBeInTheDocument()
    } finally {
      await deleteFileLocal('runs/last.json')
      vi.useRealTimers()
    }
  })

  it('Hänger nach start: abort, Knopf bereit, Hinweis, Fokus in der Textleiste', () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      render(<CapturePage />)
      fireEvent.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
      expect(screen.getByRole('button', { name: 'Spracheingabe beenden' })).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(START_WAIT_MS)
      })
      expect(fake().abort).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Spracheingabe starten' })).toBeEnabled()
      expect(screen.getByText(/Win \+ H/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Spracheingabe starten' })).toHaveAttribute(
        'aria-describedby',
        screen.getByText(/Win \+ H/).id,
      )
      expect(screen.getByLabelText('Text')).toHaveFocus()
      fireEvent.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
      expect(screen.getByRole('button', { name: 'Spracheingabe beenden' })).toBeInTheDocument()
      expect(screen.queryByText(/Win \+ H/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('iPhone: Hinweis mit Tastatur-Diktat, Antippen des Mikrofons fokussiert die Textleiste', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)',
    )
    const user = userEvent.setup()
    render(<CapturePage />)
    expect(screen.getByText('Diktat: Mikrofon-Taste auf der iPhone-Tastatur')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    expect(screen.getByLabelText('Text')).toHaveFocus()
  })

  it('iOS A: drei Sätze nacheinander landen vollständig und in Reihenfolge', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    speak('Milch', false)
    speak('Milch kaufen', false)
    speak('Zahnarzt', false)
    speak('Zahnarzt anrufen', false)
    speak('Paket abholen', false)
    await user.click(screen.getByRole('button', { name: 'Ablegen' }))
    await waitFor(async () => expect(await repository.listInbox()).toHaveLength(1))
    expect((await repository.listInbox())[0].text).toBe(
      'Milch kaufen Zahnarzt anrufen Paket abholen',
    )
  })
})

describe('CapturePage – Register „ungespeichert“', () => {
  it('meldet Text im Feld an und beim Leeren ab', async () => {
    const user = userEvent.setup()
    render(<CapturePage />)
    expect(hasUnsavedWork()).toBe(false)
    await user.type(screen.getByLabelText('Text'), 'Milch')
    expect(hasUnsavedWork()).toBe(true)
    await user.clear(screen.getByLabelText('Text'))
    expect(hasUnsavedWork()).toBe(false)
  })

  it('meldet laufende Spracherkennung an und nach dem Beenden ab', async () => {
    Object.assign(window, { SpeechRecognition: FakeRecognition })
    const user = userEvent.setup()
    render(<CapturePage />)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe starten' }))
    expect(hasUnsavedWork()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Spracheingabe beenden' }))
    expect(hasUnsavedWork()).toBe(false)
  })
})
