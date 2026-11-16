import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCategories, useItems, useProjects } from '../../data/hooks'
import type { Category } from '../../data/types'
import { countByCategory } from '../../lib/categoryView'
import { ringLayout } from '../../lib/ring'
import { ProjectView } from '../tasks/projects/ProjectView'
import { useTransientNote } from '../tasks/useTransientNote'
import { CategoryFormDialog } from './CategoryFormDialog'
import { CategoryRing } from './CategoryRing'
import { CategoryView } from './CategoryView'
import { DeleteCategoryDialog } from './DeleteCategoryDialog'
import styles from './CategoriesPage.module.css'

/** 250 ms Armbewegung plus ~100 ms Halten, bevor sich die Ablage öffnet. */
const POINT_MS = 350
const NOTE_MS = 6000

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Seite 4 „Ablagen“ (SPEC §6.4): Figur mit Ring; Antippen zeigt, dann öffnet sich die Ablage. */
export function CategoriesPage() {
  const categories = useCategories()
  const items = useItems()
  const projects = useProjects()
  const counts = useMemo(() => countByCategory(items, categories), [items, categories])
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [projectNote, showProjectNote] = useTransientNote(NOTE_MS)
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const { pageCount } = useMemo(() => ringLayout(categories, page), [categories, page])
  const currentPage = Math.min(page, pageCount - 1)

  const select = useCallback((category: Category) => {
    clearTimeout(timer.current)
    setSelectedId(category.id)
    if (prefersReducedMotion()) {
      setOpenId(category.id)
      return
    }
    timer.current = setTimeout(() => setOpenId(category.id), POINT_MS)
  }, [])

  const back = () => {
    setOpenId(null)
    setSelectedId(null)
  }

  const closeProject = useCallback(
    (note?: string | null): void => {
      setOpenProjectId(null)
      showProjectNote(note ?? null)
    },
    [showProjectNote],
  )

  const open = categories.find((c) => c.id === openId)
  if (open) {
    if (openProjectId && projects.some((p) => p.id === openProjectId && p.status === 'aktiv')) {
      return (
        <ProjectView
          projectId={openProjectId}
          backLabel={`Zurück zu ${open.name}`}
          onBack={closeProject}
        />
      )
    }
    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.back}
            aria-label="Zurück zu den Ablagen"
            onClick={back}
          >
            ←
          </button>
          <h1 className={styles.title}>{open.name}</h1>
          <button
            type="button"
            className={styles.headerAction}
            aria-label="Umbenennen"
            onClick={() => setDialog('rename')}
          >
            ✎
          </button>
          {open.kind === 'normal' && (
            <button
              type="button"
              className={styles.headerAction}
              aria-label="Löschen"
              onClick={() => setDialog('delete')}
            >
              🗑
            </button>
          )}
        </header>
        {projectNote && (
          <p className={styles.notice} role="status">
            {projectNote}
          </p>
        )}
        <CategoryView
          category={open}
          categories={categories}
          items={items}
          onOpenProject={setOpenProjectId}
        />
        {dialog === 'rename' && (
          <CategoryFormDialog category={open} onClose={() => setDialog(null)} />
        )}
        {dialog === 'delete' && (
          <DeleteCategoryDialog
            category={open}
            categories={categories}
            onClose={() => setDialog(null)}
            onDeleted={() => {
              setDialog(null)
              back()
            }}
          />
        )}
      </section>
    )
  }

  return (
    <section className={`${styles.page} ${styles.ringPage}`}>
      <h1 className={styles.title}>Ablagen</h1>
      <div className={styles.ringArea}>
        <CategoryRing
          categories={categories}
          page={currentPage}
          selectedId={selectedId}
          counts={counts}
          onSelect={select}
        />
      </div>
      {pageCount > 1 && (
        <nav className={styles.pager} aria-label="Ablagen blättern">
          <button
            type="button"
            className={styles.pagerButton}
            aria-label="Vorherige Ablagen"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            ‹
          </button>
          <span>
            {currentPage + 1}/{pageCount}
          </span>
          <button
            type="button"
            className={styles.pagerButton}
            aria-label="Weitere Ablagen"
            disabled={currentPage === pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            ›
          </button>
        </nav>
      )}
      <button type="button" className={styles.newButton} onClick={() => setDialog('create')}>
        Neue Ablage
      </button>
      {dialog === 'create' && <CategoryFormDialog onClose={() => setDialog(null)} />}
    </section>
  )
}
