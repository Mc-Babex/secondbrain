import { useMemo, useState } from 'react'
import { ProjectCard } from '../../../components/ProjectCard'
import type { Category, Item, Project } from '../../../data/types'
import { ProjectFormDialog } from './ProjectFormDialog'
import styles from './ProjectsTab.module.css'

interface ProjectsTabProps {
  items: readonly Item[]
  categories: readonly Category[]
  projects: readonly Project[]
  onOpen: (projectId: string) => void
}

/** Reiter „Projekte“ (SPEC §6.3.1): aktive Projekte nach Ablage gruppiert, „Neues Projekt“. */
export function ProjectsTab({ items, categories, projects, onOpen }: ProjectsTabProps) {
  const [creating, setCreating] = useState(false)

  const groups = useMemo(() => {
    const active = projects.filter((p) => p.status === 'aktiv')
    const known = new Set(categories.map((c) => c.id))
    const result = categories
      .filter((c) => c.kind === 'normal')
      .sort((a, b) => a.order - b.order)
      .map((c) => ({
        id: c.id,
        name: c.name,
        projects: active.filter((p) => p.categoryId === c.id),
      }))
    const orphans = active.filter((p) => !known.has(p.categoryId))
    if (orphans.length > 0) result.push({ id: '', name: 'Ohne Ablage', projects: orphans })
    return result.filter((g) => g.projects.length > 0)
  }, [projects, categories])

  return (
    <>
      <button type="button" className={styles.newButton} onClick={() => setCreating(true)}>
        Neues Projekt
      </button>
      {groups.length === 0 && (
        <p className={styles.empty}>Keine aktiven Projekte. Lege oben ein neues Projekt an.</p>
      )}
      {groups.map((group) => (
        <div key={group.id} role="group" aria-label={group.name} className={styles.group}>
          <h3 className={styles.subheading}>{group.name}</h3>
          <ul className={styles.list}>
            {group.projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} items={items} onOpen={() => onOpen(project.id)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      {creating && <ProjectFormDialog categories={categories} onClose={() => setCreating(false)} />}
    </>
  )
}
