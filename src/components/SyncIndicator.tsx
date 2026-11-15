import { useSyncStatus, type SyncStatus } from '../data/syncStatus'
import styles from './SyncIndicator.module.css'

interface SyncIndicatorProps {
  onClick: () => void
}

function describe(status: SyncStatus): { symbol: string; text: string; tone: string } {
  switch (status.state) {
    case 'laeuft':
      return { symbol: '⟳', text: 'synchronisiere…', tone: 'busy' }
    case 'synchron':
      return { symbol: '✓', text: 'synchron', tone: 'ok' }
    case 'ausstehend':
      return { symbol: '●', text: `${status.pending} ausstehend`, tone: 'busy' }
    case 'offline':
      return { symbol: '○', text: 'offline', tone: 'warn' }
    case 'fehler':
      return { symbol: '!', text: 'Fehler', tone: 'error' }
    case 'nichtEingerichtet':
      return { symbol: '–', text: 'nicht eingerichtet', tone: 'muted' }
  }
}

/** Kleine Statusanzeige des Syncs; Antippen öffnet die Einstellungen. */
export function SyncIndicator({ onClick }: SyncIndicatorProps) {
  const { symbol, text, tone } = describe(useSyncStatus())
  return (
    <button type="button" className={`${styles.indicator} ${styles[tone]}`} onClick={onClick}>
      <span aria-hidden="true">{symbol}</span>
      <span aria-live="polite">{text}</span>
    </button>
  )
}
