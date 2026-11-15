import { acceptSuggestion, rejectSuggestion } from '../../data/repository'
import type { Category, Suggestion } from '../../data/types'
import styles from './TasksPage.module.css'

interface SuggestionsSectionProps {
  suggestions: Suggestion[]
  categories: Category[]
  run: (action: () => Promise<unknown>) => void
}

/** Bereich „Vorschläge von Claude"; nur sichtbar, wenn Vorschläge existieren. */
export function SuggestionsSection({ suggestions, categories, run }: SuggestionsSectionProps) {
  if (suggestions.length === 0) return null
  return (
    <section className={styles.section} aria-labelledby="tasks-suggestions">
      <h2 id="tasks-suggestions" className={styles.heading}>
        Vorschläge von Claude
      </h2>
      <ul className={styles.list}>
        {suggestions.map((s) => {
          const category = categories.find((c) => c.id === s.proposedItem.categoryId)
          return (
            <li key={s.id} className={styles.card}>
              <div className={styles.cardMain}>
                <strong>{s.proposedItem.title}</strong>
                {s.text !== '' && s.text !== s.proposedItem.title && <p>{s.text}</p>}
                {s.reason !== '' && <p className={styles.muted}>{s.reason}</p>}
                <p className={styles.muted}>Ablage: {category?.name ?? 'Ohne Ablage'}</p>
              </div>
              <div className={styles.buttons}>
                <button className={styles.button} onClick={() => run(() => acceptSuggestion(s.id))}>
                  Annehmen
                </button>
                <button className={styles.button} onClick={() => run(() => rejectSuggestion(s.id))}>
                  Ablehnen
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
