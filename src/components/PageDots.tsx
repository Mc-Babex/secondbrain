import styles from './PageDots.module.css'

interface PageDotsProps {
  pages: readonly { id: string; name: string }[]
  activeIndex: number
  onSelect: (index: number) => void
}

export function PageDots({ pages, activeIndex, onSelect }: PageDotsProps) {
  return (
    <nav className={styles.dots} aria-label="Seiten">
      {pages.map((page, index) => (
        <button
          key={page.id}
          type="button"
          className={styles.dot}
          aria-label={`Seite: ${page.name}`}
          aria-current={index === activeIndex ? 'page' : undefined}
          onClick={() => onSelect(index)}
        />
      ))}
    </nav>
  )
}
