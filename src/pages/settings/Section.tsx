import { useId, type ReactNode } from 'react'
import styles from './SettingsPage.module.css'

interface SectionProps {
  title: string
  children: ReactNode
}

/** Gemeinsamer Rahmen der Einstellungsabschnitte (GitHub, Planungsfenster, Info, später Google). */
export function Section({ title, children }: SectionProps) {
  const titleId = useId()
  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  )
}
