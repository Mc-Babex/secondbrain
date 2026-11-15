import { PAGE_FALLBACK_MS, dragPages, movePages, pageTransform, restPages } from './pageLayout'

function makeTrack(count = 4): HTMLElement {
  const track = document.createElement('div')
  for (let i = 0; i < count; i++) track.append(document.createElement('div'))
  document.body.append(track)
  return track
}
const pages = (track: HTMLElement) => [...track.children] as HTMLElement[]
const visibility = (track: HTMLElement) => pages(track).map((p) => p.style.visibility)

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('pageTransform', () => {
  it('verschiebt um Seiten (Prozent) relativ zur Basis plus Pixel', () => {
    expect(pageTransform(2, 1, -30)).toBe('translate3d(calc(100% + -30px), 0, 0)')
    expect(pageTransform(0, 1)).toBe('translate3d(calc(-100% + 0px), 0, 0)')
  })
})

describe('dragPages / movePages / restPages', () => {
  it('Geste: nur aktive Seite und Nachbarn sind sichtbar und verschoben', () => {
    const track = makeTrack()
    dragPages(track, 0, 40)
    expect(visibility(track)).toEqual(['visible', 'visible', '', ''])
    expect(pages(track)[1].style.transform).toBe('translate3d(calc(100% + 40px), 0, 0)')
    expect(track).toHaveAttribute('data-dragging')
  })

  it('Sprung über mehrere Seiten: Ausgang und Ziel sichtbar, danach Ruhelage', () => {
    const track = makeTrack()
    movePages(track, 0, 3, false)
    expect(visibility(track)).toEqual(['visible', 'visible', '', 'visible'])
    expect(pages(track)[3].style.transform).toBe('translate3d(calc(0% + 0px), 0, 0)')
    expect(track).toHaveAttribute('data-moving')
    vi.advanceTimersByTime(PAGE_FALLBACK_MS)
    expect(pages(track).map((p) => p.style.transform + p.style.visibility)).toEqual([
      '',
      '',
      '',
      '',
    ])
    expect(track).not.toHaveAttribute('data-moving')
  })

  it('ein neuer Übergang bricht den alten ab', () => {
    const track = makeTrack()
    movePages(track, 0, 1, false)
    vi.advanceTimersByTime(PAGE_FALLBACK_MS - 10)
    movePages(track, 1, 2, false)
    vi.advanceTimersByTime(20)
    expect(track).toHaveAttribute('data-moving')
    vi.advanceTimersByTime(PAGE_FALLBACK_MS)
    expect(track).not.toHaveAttribute('data-moving')
  })

  it('reduzierte Bewegung und restPages räumen sofort auf', () => {
    const track = makeTrack()
    dragPages(track, 1, 10)
    movePages(track, 1, 2, true)
    expect(pages(track).every((p) => p.style.transform === '' && p.style.visibility === '')).toBe(
      true,
    )
    dragPages(track, 1, 10)
    restPages(track)
    expect(track).not.toHaveAttribute('data-dragging')
  })
})
