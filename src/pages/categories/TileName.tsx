import { useLayoutEffect, useRef } from 'react'
import { fitFontSize } from '../../lib/fitText'
import { useHyphenator } from '../../lib/hyphenation'
import styles from './CategoryRing.module.css'

const MIN_FONT_PX = 11
const MAX_LINES = 3
const LINE_HEIGHT = 1.15

interface TileNameProps {
  name: string
  /** Breite der Kachel in px; bestimmt die Wunschgröße der Schrift. */
  tileWidth: number
}

/**
 * Ablagenname: höchstens 3 Zeilen. Bis die deutschen Trennmuster geladen sind, trennt der Browser
 * (`hyphens: auto`); danach stehen weiche Trennstellen im Text (`hyphens: manual`), damit Edge und
 * Safari gleich trennen. Passt der Name trotzdem nicht, wird die Schrift bis zur Untergrenze verkleinert.
 */
export function TileName({ name, tileWidth }: TileNameProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const hyphenate = useHyphenator()
  const text = hyphenate ? hyphenate(name) : name

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const fits = (size: number) => {
      element.style.fontSize = `${size}px`
      return (
        element.scrollWidth <= element.clientWidth + 1 &&
        element.scrollHeight <= size * LINE_HEIGHT * MAX_LINES + 1
      )
    }
    const preferred = Math.min(16, Math.max(12, tileWidth * 0.14))
    element.style.fontSize = `${fitFontSize(preferred, MIN_FONT_PX, fits)}px`
  }, [text, tileWidth])

  return (
    <span
      ref={ref}
      className={styles.name}
      lang="de"
      data-hyphenated={hyphenate ? '' : undefined}
      aria-hidden="true"
    >
      {text}
    </span>
  )
}
