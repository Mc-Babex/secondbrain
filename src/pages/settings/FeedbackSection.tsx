import form from '../../components/Form.module.css'
import { buildFeedbackUrl, type FeedbackKind } from '../../lib/feedback'
import { isStandalone } from '../../lib/platform'
import { Section } from './Section'
import styles from './SettingsPage.module.css'

function openFeedback(kind: FeedbackKind) {
  const url = buildFeedbackUrl(kind, {
    appVersion: __APP_VERSION__,
    buildStamp: __BUILD_STAMP__,
    userAgent: navigator.userAgent,
    standalone: isStandalone(),
  })
  window.open(url, '_blank', 'noopener')
}

export function FeedbackSection() {
  return (
    <Section title="Feedback">
      <p className={styles.hint}>
        Öffnet GitHub im Browser. Issues sind öffentlich sichtbar – bitte keine persönlichen Daten
        hineinschreiben. Gerät, Browser und Version werden vorausgefüllt und können vor dem Absenden
        geändert oder gelöscht werden.
      </p>
      <div className={form.actions}>
        <button type="button" className={form.button} onClick={() => openFeedback('fehler')}>
          Fehler melden
        </button>
        <button type="button" className={form.button} onClick={() => openFeedback('wunsch')}>
          Wunsch äußern
        </button>
      </div>
    </Section>
  )
}
