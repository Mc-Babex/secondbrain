import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { putFileLocal, resetDb, setSecret } from '../../data/localStore'
import { FeedbackSection } from './FeedbackSection'

beforeEach(() => resetDb(true))
afterEach(() => vi.restoreAllMocks())

describe('Feedback-Abschnitt', () => {
  it('zeigt Hinweis und öffnet die passende URL in neuem Fenster', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<FeedbackSection />)
    expect(screen.getByText(/Issues sind öffentlich sichtbar/)).toBeInTheDocument()
    expect(screen.getByText(/vorausgefüllt und können vor dem Absenden/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Fehler melden' }))
    expect(open).toHaveBeenLastCalledWith(
      expect.stringContaining('/issues/new?template=fehler.yml&'),
      '_blank',
      'noopener',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Wunsch äußern' }))
    expect(open).toHaveBeenLastCalledWith(
      expect.stringContaining('/issues/new?template=wunsch.yml&'),
      '_blank',
      'noopener',
    )
  })

  it('übernimmt weder gespeicherte Zugangsdaten, Konto noch Einträge in die URL', async () => {
    await setSecret('githubRepo', 'alex/daten')
    await setSecret('githubToken', 'github_pat_GEHEIM_999')
    localStorage.setItem('secondbrain.googleAccount', 'alex@example.com')
    await putFileLocal('items/a.json', { id: 'a', titel: 'Zahnarzt anrufen' })
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<FeedbackSection />)
    for (const name of ['Fehler melden', 'Wunsch äußern']) {
      await userEvent.click(screen.getByRole('button', { name }))
      const url = decodeURIComponent(String(open.mock.lastCall?.[0]))
      expect(url).toContain('/issues/new?template=')
      for (const secret of [
        'alex/daten',
        'github_pat_GEHEIM_999',
        'alex@example.com',
        'Zahnarzt',
      ]) {
        expect(url).not.toContain(secret)
      }
    }
    localStorage.clear()
  })
})
