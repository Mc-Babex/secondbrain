import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Category } from '../../data/types'
import { hyphenatorSettled } from '../../lib/hyphenation'
import { pointing, tileCenter, toFigureCoords } from '../../lib/ring'
import { CategoriesPage } from './CategoriesPage'

const SOFT_HYPHEN = String.fromCharCode(0xad)

let mockCategories: Category[] = []

vi.mock('../../data/hooks', () => ({
  useCategories: () => mockCategories,
  useItems: () => [],
  useProjects: () => [],
}))

function cat(id: string, name: string, kind: Category['kind'], order: number): Category {
  return { id, name, kind, order, description: '' }
}

function categoriesWith(normalCount: number): Category[] {
  const normal = Array.from({ length: normalCount }, (_, i) =>
    cat(`n${i + 1}`, `Ablage ${i + 1}`, 'normal', i + 1),
  )
  return [
    ...normal,
    cat('einkauf', 'Einkaufsliste', 'einkauf', 90),
    cat('archiv', 'Erledigt', 'archiv', 99),
  ]
}

/** Kachel nach Namen; das `aria-label` enthält zusätzlich die Anzahl. */
function tileName(name: string): RegExp {
  return new RegExp(`^${name}, [0-9]+ (Eintrag|Einträge)$`)
}
const tile = (name: string) => screen.getByRole('button', { name: tileName(name) })
const queryTile = (name: string) => screen.queryByRole('button', { name: tileName(name) })

/** Armwinkel zur Kachel bei Winkel `angleDeg` auf der Ersatzbühne (jsdom misst 0 px: 328 × 328). */
function expectedArm(angleDeg: number): number {
  const stage = { width: 328, height: 328 }
  return pointing(toFigureCoords(stage, tileCenter(stage, angleDeg))).armRotationDeg
}

function mockMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  mockCategories = categoriesWith(3)
  vi.useFakeTimers()
  mockMotion(false)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CategoriesPage', () => {
  it('zeigt die Kacheln als Buttons mit vollem Namen', () => {
    render(<CategoriesPage />)
    expect(tile('Ablage 1')).toBeInTheDocument()
    expect(tile('Einkaufsliste')).toBeInTheDocument()
    expect(tile('Erledigt')).toBeInTheDocument()
  })

  it('zeigt lange Namen vollständig, deutsch getrennt und ohne Auslassungspunkte', async () => {
    mockCategories = [
      cat('n1', 'Bewerbungsunterlagen', 'normal', 1),
      cat('n2', 'Formula Student', 'normal', 2),
      ...categoriesWith(0),
    ]
    render(<CategoriesPage />)
    // Zustand deterministisch machen: erst nach dem Laden der Trennmuster prüfen.
    await act(async () => {
      await hyphenatorSettled()
    })
    const withoutSoftHyphens = (text: string) => text.replaceAll(SOFT_HYPHEN, '')
    for (const name of ['Bewerbungsunterlagen', 'Formula Student', 'Einkaufsliste']) {
      const label = screen.getByText(name, { normalizer: withoutSoftHyphens })
      expect(withoutSoftHyphens(label.textContent ?? '')).toBe(name)
      expect(label).toHaveAttribute('lang', 'de')
      expect(label).toHaveAttribute('data-hyphenated')
    }
    expect(
      screen.getByText('Bewerbungsunterlagen', { normalizer: withoutSoftHyphens }).textContent,
    ).toContain(SOFT_HYPHEN)
  })

  it('setzt „Neue Ablage“ nach dem Ring-Bereich ans Seitenende', () => {
    render(<CategoriesPage />)
    const stage = screen.getByTestId('ring-stage')
    const button = screen.getByRole('button', { name: 'Neue Ablage' })
    expect(stage.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button.nextElementSibling).toBeNull()
  })

  it('öffnet die Ablage nach der Zeige-Animation und kehrt mit Zurück zurück', () => {
    render(<CategoriesPage />)
    fireEvent.click(tile('Ablage 2'))
    expect(tile('Ablage 2')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('heading', { name: 'Ablage 2' })).not.toBeInTheDocument()

    advance(250)
    expect(screen.queryByRole('heading', { name: 'Ablage 2' })).not.toBeInTheDocument()
    advance(100)
    expect(screen.getByRole('heading', { name: 'Ablage 2' })).toBeInTheDocument()
    expect(queryTile('Ablage 1')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Zurück zu den Ablagen' }))
    expect(tile('Ablage 1')).toBeInTheDocument()
    expect(tile('Ablage 2')).toHaveAttribute('aria-pressed', 'false')
  })

  it('erneutes Antippen während der Bewegung: die letzte gewinnt', () => {
    render(<CategoriesPage />)
    fireEvent.click(tile('Ablage 1'))
    advance(100)
    fireEvent.click(tile('Ablage 3'))
    advance(150)
    expect(screen.queryByRole('heading', { name: 'Ablage 1' })).not.toBeInTheDocument()
    advance(200)
    expect(screen.getByRole('heading', { name: 'Ablage 3' })).toBeInTheDocument()
  })

  it('öffnet bei reduzierter Bewegung sofort', () => {
    mockMotion(true)
    render(<CategoriesPage />)
    fireEvent.click(tile('Ablage 1'))
    expect(screen.getByRole('heading', { name: 'Ablage 1' })).toBeInTheDocument()
  })

  it('zeigt Blätter-Knöpfe nur bei mehr als 6 normalen Ablagen', () => {
    render(<CategoriesPage />)
    expect(screen.queryByRole('button', { name: 'Weitere Ablagen' })).not.toBeInTheDocument()
  })

  it('blättert zwischen den Kacheln und behält die Seite nach Zurück', () => {
    mockCategories = categoriesWith(7)
    render(<CategoriesPage />)
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(tile('Ablage 6')).toBeInTheDocument()
    expect(queryTile('Ablage 7')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vorherige Ablagen' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Weitere Ablagen' }))
    expect(screen.getByText('2/2')).toBeInTheDocument()
    expect(tile('Ablage 7')).toBeInTheDocument()
    expect(queryTile('Ablage 1')).not.toBeInTheDocument()
    expect(tile('Einkaufsliste')).toBeInTheDocument()

    fireEvent.click(tile('Ablage 7'))
    advance(350)
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zu den Ablagen' }))
    expect(screen.getByText('2/2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Vorherige Ablagen' }))
    expect(tile('Ablage 1')).toBeInTheDocument()
  })

  it('dreht beim Antippen den Arm der richtigen Seite auf den erwarteten Winkel', () => {
    const { container } = render(<CategoriesPage />)
    const rotation = (id: string) =>
      container.querySelector<SVGGElement>(`#${id}`)?.style.transform ?? ''

    fireEvent.click(tile('Einkaufsliste'))
    const right = Number(/rotate\((-?[\d.]+)deg\)/.exec(rotation('arm-right'))?.[1])
    expect(right).toBeCloseTo(expectedArm(62), 3)
    expect(rotation('arm-left')).toBe('rotate(10deg)')

    fireEvent.click(tile('Erledigt'))
    const left = Number(/rotate\((-?[\d.]+)deg\)/.exec(rotation('arm-left'))?.[1])
    expect(left).toBeGreaterThan(0)
    expect(left).toBeLessThan(90)
    expect(rotation('arm-right')).toBe('rotate(-10deg)')
  })
})
