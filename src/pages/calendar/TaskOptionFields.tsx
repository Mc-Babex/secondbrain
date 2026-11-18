import form from '../../components/Form.module.css'
import type { Category, Project } from '../../data/types'
import styles from './EventDialog.module.css'
import { resolveTaskTarget, taskCategories, type TaskOption } from './eventForm'

interface Props {
  value: TaskOption
  categories: readonly Category[]
  projects: readonly Project[]
  /** Grund der Sperre (Schalter aus und deaktiviert) oder `null`. */
  lockReason: string | null
  onChange: (value: TaskOption) => void
}

export function TaskOptionFields({ value, categories, projects, lockReason, onChange }: Props) {
  const choices = taskCategories(categories)
  const target = resolveTaskTarget(value, categories, projects)
  const categoryId = target?.categoryId ?? ''
  const projectId = target?.projectId ?? ''
  const active = target?.projects ?? []
  const enabled = value.enabled && lockReason === null
  return (
    <>
      <label className={form.check}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={lockReason !== null}
          onChange={(e) => onChange({ enabled: e.target.checked, categoryId, projectId })}
        />
        Auch als Aufgabe ablegen
      </label>
      {lockReason !== null && (
        <p className={styles.notice} role="note">
          {lockReason}
        </p>
      )}
      {enabled && (
        <>
          <label className={form.field}>
            Ablage
            <select
              className={form.input}
              value={categoryId}
              onChange={(e) =>
                onChange({ enabled: true, categoryId: e.target.value, projectId: '' })
              }
            >
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={form.field}>
            Projekt
            <select
              className={form.input}
              value={projectId}
              onChange={(e) => onChange({ enabled: true, categoryId, projectId: e.target.value })}
            >
              <option value="">kein Projekt</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  )
}
