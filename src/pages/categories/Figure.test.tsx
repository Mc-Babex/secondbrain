import { render } from '@testing-library/react'
import { Figure } from './Figure'

function parts(container: HTMLElement) {
  const get = (id: string) => container.querySelector<SVGGElement>(`#${id}`)
  return { head: get('head'), eyes: get('eyes'), left: get('arm-left'), right: get('arm-right') }
}

describe('Figure', () => {
  it('ist für Screenreader verborgen und hat die Teile der Vorlage', () => {
    const { container } = render(<Figure pointAt={null} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('viewBox', '0 0 120 160')
    const p = parts(container)
    expect(p.head && p.eyes && p.left && p.right).toBeTruthy()
    expect(p.eyes?.parentElement).toBe(p.head)
  })

  it('steht in Ruhehaltung mit den Drehpunkten der Vorlage', () => {
    const { container } = render(<Figure pointAt={null} />)
    const p = parts(container)
    expect(p.left?.style.transformOrigin).toBe('42px 76px')
    expect(p.right?.style.transformOrigin).toBe('78px 76px')
    expect(p.head?.style.transformOrigin).toBe('60px 40px')
    expect(p.left?.style.transform).toBe('rotate(10deg)')
    expect(p.right?.style.transform).toBe('rotate(-10deg)')
  })

  it('zeigt mit dem Arm auf der Seite des Ziels', () => {
    const { container } = render(<Figure pointAt={{ x: 178, y: 76 }} />)
    const p = parts(container)
    expect(p.right?.style.transform).toBe('rotate(-90deg)')
    expect(p.left?.style.transform).toBe('rotate(10deg)')
    expect(p.eyes?.style.transform).toContain('translate(')
  })
})
