import { useEffect, useMemo, useRef, useState } from 'react'
import type { Category } from '../../data/types'
import {
  figureRect,
  ringLayout,
  tileCenter,
  tileSize,
  toFigureCoords,
  type Stage,
} from '../../lib/ring'
import { Figure } from './Figure'
import { TileName } from './TileName'
import styles from './CategoryRing.module.css'

const FALLBACK_STAGE: Stage = { width: 328, height: 328 }

interface CategoryRingProps {
  categories: readonly Category[]
  /** Aktuelle Blätter-Seite (0-basiert), wird auf den gültigen Bereich begrenzt. */
  page: number
  /** Markierte Ablage; die Figur zeigt darauf. */
  selectedId: string | null
  /** Anzahl je Ablage-ID (optional). */
  counts?: Readonly<Record<string, number>>
  onSelect: (category: Category) => void
}

function useStage() {
  const ref = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<Stage>(FALLBACK_STAGE)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => {
      const width = element.clientWidth || FALLBACK_STAGE.width
      const height = element.clientHeight || width
      setStage((old) => (old.width === width && old.height === height ? old : { width, height }))
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, stage }
}

function TileIcon({ kind }: { kind: Category['kind'] }) {
  if (kind === 'normal') return null
  return (
    <svg className={styles.icon} viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {kind === 'einkauf' ? (
        <path
          d="M1 2h2l1.5 8h7.5l1.5-6H4M6 13.5h.01M11 13.5h.01"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3 8.5l3.2 3L13 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** Figur in der Mitte, Ablagen als Kacheln im Ring (SPEC §6.4). */
export function CategoryRing({
  categories,
  page,
  selectedId,
  counts,
  onSelect,
}: CategoryRingProps) {
  const { ref, stage } = useStage()
  const { slots } = useMemo(() => ringLayout(categories, page), [categories, page])
  const size = tileSize(stage)
  const figure = figureRect(stage)

  const selected = slots.find((slot) => slot.category.id === selectedId)
  const pointAt = selected ? toFigureCoords(stage, tileCenter(stage, selected.angleDeg)) : null

  return (
    <div ref={ref} className={styles.stage} data-testid="ring-stage">
      <div className={styles.figure} style={{ left: figure.x, top: figure.y }}>
        <Figure pointAt={pointAt} width={figure.width} />
      </div>
      {slots.map(({ category, angleDeg }) => {
        const center = tileCenter(stage, angleDeg)
        const count = counts?.[category.id]
        return (
          <button
            key={category.id}
            type="button"
            className={styles.tile}
            style={{
              left: center.x - size.width / 2,
              top: center.y - size.height / 2,
              width: size.width,
              height: size.height,
            }}
            aria-label={
              count === undefined
                ? category.name
                : `${category.name}, ${count} ${count === 1 ? 'Eintrag' : 'Einträge'}`
            }
            aria-pressed={category.id === selectedId}
            data-selected={category.id === selectedId || undefined}
            onClick={() => onSelect(category)}
          >
            <TileIcon kind={category.kind} />
            <TileName name={category.name} tileWidth={size.width} />
            {count !== undefined && (
              <span className={styles.count} aria-hidden="true">
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
