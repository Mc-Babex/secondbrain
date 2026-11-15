import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearErrorLog, logError } from '../../data/errorLog'
import { setSecret } from '../../data/localStore'
import { DiagnosticsSection } from './DiagnosticsSection'

const TOKEN = 'github_pat_GEHEIM_TOKEN_999'
let writeText: ReturnType<typeof vi.fn>

beforeEach(async () => {
  clearErrorLog()
  await setSecret('githubToken', TOKEN)
  await setSecret('githubRepo', 'alex/daten')
  writeText = vi.fn().mockResolvedValue(undefined)
})

/** `userEvent.setup()` ersetzt `navigator.clipboard`; danach den Mock wieder einsetzen. */
function setupUser() {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return user
}

describe('Diagnose-Abschnitt', () => {
  it('ist zugeklappt und zeigt Zustand und Fehler ohne Token', async () => {
    logError('Sync', 'Keine Verbindung')
    const { container } = render(<DiagnosticsSection />)
    expect(container.querySelector('details')).not.toHaveAttribute('open')
    await waitFor(() => expect(container.textContent).toContain('Repo alex/daten, Token vorhanden'))
    expect(container.textContent).not.toContain(TOKEN)
    expect(container.textContent).toContain('[Sync] Keine Verbindung')
  })

  it('kopiert den Diagnosetext', async () => {
    const user = setupUser()
    const { container } = render(<DiagnosticsSection />)
    await waitFor(() => expect(container.textContent).toContain('Token vorhanden'))
    await user.click(screen.getByText('Diagnose'))
    await user.click(screen.getByRole('button', { name: 'Kopieren' }))
    expect(writeText).toHaveBeenCalledTimes(1)
    const copied = String(writeText.mock.calls[0]?.[0])
    expect(copied).toContain('SecondBrain Diagnose')
    expect(copied).toContain('Version:')
    expect(await screen.findByText('Kopiert')).toBeInTheDocument()
  })

  it('kopiert auch Fehler, die nach dem Aufklappen protokolliert wurden', async () => {
    const user = setupUser()
    render(<DiagnosticsSection />)
    await user.click(screen.getByText('Diagnose'))
    logError('Sync', 'Spätfehler nach Aufklappen')
    await user.click(screen.getByRole('button', { name: 'Kopieren' }))
    expect(String(writeText.mock.calls[0]?.[0])).toContain('Spätfehler nach Aufklappen')
  })

  it('zeigt bei Kopierfehler ein schreibgeschütztes Textfeld', async () => {
    writeText.mockRejectedValue(new Error('verweigert'))
    const user = setupUser()
    render(<DiagnosticsSection />)
    await user.click(screen.getByText('Diagnose'))
    await user.click(screen.getByRole('button', { name: 'Kopieren' }))
    const field = await screen.findByLabelText('Diagnosetext')
    expect(field).toHaveAttribute('readonly')
    expect((field as HTMLTextAreaElement).value).toContain('SecondBrain Diagnose')
  })

  it('leert die Fehlerliste', async () => {
    logError('Sync', 'Offline')
    const user = setupUser()
    const { container } = render(<DiagnosticsSection />)
    expect(container.textContent).toContain('[Sync] Offline')
    await user.click(screen.getByText('Diagnose'))
    await user.click(screen.getByRole('button', { name: 'Fehlerliste leeren' }))
    expect(await screen.findByText('Fehlerliste geleert')).toBeInTheDocument()
    expect(container.querySelector('pre')?.textContent).not.toContain('[Sync] Offline')
  })
})
