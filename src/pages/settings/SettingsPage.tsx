import { useEffect, useState } from 'react'
import { DiagnosticsSection } from './DiagnosticsSection'
import { FeedbackSection } from './FeedbackSection'
import { GithubSection } from './GithubSection'
import { AutoSortSection } from './AutoSortSection'
import { GoogleSection } from './GoogleSection'
import { InfoSection } from './InfoSection'
import { PlanningSection } from './PlanningSection'
import { SetupSection } from './SetupSection'
import styles from './SettingsPage.module.css'

interface SettingsPageProps {
  onClose: () => void
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [githubVersion, setGithubVersion] = useState(0)
  const [setupVersion, setSetupVersion] = useState(0)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <section className={styles.settings}>
      <header className={styles.header}>
        <button type="button" className={styles.iconButton} aria-label="Zurück" onClick={onClose}>
          ←
        </button>
        <h1>Einstellungen</h1>
      </header>
      <SetupSection
        key={`setup-${setupVersion}`}
        onGithubSaved={() => setGithubVersion((version) => version + 1)}
      />
      <GithubSection
        key={`github-${githubVersion}`}
        onChanged={() => setSetupVersion((version) => version + 1)}
      />
      <PlanningSection />
      <GoogleSection />
      <AutoSortSection />
      <InfoSection />
      <FeedbackSection />
      <DiagnosticsSection />
    </section>
  )
}
