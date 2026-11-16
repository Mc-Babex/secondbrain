import type { Category, Item } from '../../data/types'
import { ArchiveView } from './ArchiveView'
import { NormalCategoryView } from './NormalCategoryView'
import { ShoppingView } from './ShoppingView'

interface CategoryViewProps {
  category: Category
  /** Alle Ablagen (für „Ablage wechseln“ im Editor). */
  categories: Category[]
  /** Alle Einträge; die Ansicht filtert selbst. */
  items: readonly Item[]
  /** Öffnet die Projektansicht (Aufgabe 94); ohne sie sind Projektkarten nicht antippbar. */
  onOpenProject?: (id: string) => void
}

/** Inhalt einer geöffneten Ablage, je nach Art der Ablage. */
export function CategoryView({ category, categories, items, onOpenProject }: CategoryViewProps) {
  switch (category.kind) {
    case 'einkauf':
      return <ShoppingView category={category} categories={categories} items={items} />
    case 'archiv':
      return <ArchiveView category={category} categories={categories} items={items} />
    default:
      return (
        <NormalCategoryView
          category={category}
          categories={categories}
          items={items}
          onOpenProject={onOpenProject}
        />
      )
  }
}
