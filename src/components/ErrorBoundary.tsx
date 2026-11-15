import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../data/errorLog'
import { firstComponentName } from './componentName'
import form from './Form.module.css'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  /** Bereich für die Fehlerliste, z. B. "Seite Kalender". */
  area: string
  /** Hinweistext; Standard: „Diese Seite hatte einen Fehler.“ */
  message?: string
  /** Gesetzt (z. B. Einstellungen): zusätzlicher Knopf „Schließen“. */
  onClose?: () => void
  children: ReactNode
}

interface ErrorBoundaryState {
  failed: boolean
  /** Erhöht sich bei „Neu laden“: die Kinder werden dann frisch gemountet. */
  attempt: number
}

/**
 * Fängt Render-Fehler ab, damit nie nur der Hintergrund übrig bleibt (React 18 hängt sonst den ganzen Baum ab).
 * Zeigt einen deutschen Hinweis, protokolliert den Fehler bereinigt (errorLog) und bietet „Neu laden“
 * (Kinder neu mounten) sowie „App neu starten“ (Seite neu laden).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const component = firstComponentName(info.componentStack)
    const text = error.message || error.name
    logError(this.props.area, component ? `${text} [in ${component}]` : text)
  }

  private remount = (): void => {
    this.setState((prev) => ({ failed: false, attempt: prev.attempt + 1 }))
  }

  private restartApp = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return <Fragment key={this.state.attempt}>{this.props.children}</Fragment>
    }
    return (
      <div className={styles.fallback} role="alert">
        <p className={styles.message}>{this.props.message ?? 'Diese Seite hatte einen Fehler.'}</p>
        <div className={styles.actions}>
          <button type="button" className={form.button} onClick={this.remount}>
            Neu laden
          </button>
          <button type="button" className={form.button} onClick={this.restartApp}>
            App neu starten
          </button>
          {this.props.onClose && (
            <button type="button" className={form.button} onClick={this.props.onClose}>
              Schließen
            </button>
          )}
        </div>
      </div>
    )
  }
}
