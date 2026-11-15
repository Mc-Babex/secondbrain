import { hasTextSelection, startsInNoSwipeZone } from './swipeGuard'

afterEach(() => {
  document.body.innerHTML = ''
})

function byId(id: string): HTMLElement {
  const element = document.getElementById(id)
  if (!element) throw new Error(`#${id} fehlt`)
  return element
}

describe('startsInNoSwipeZone', () => {
  it('erkennt data-no-swipe bei Vorfahren', () => {
    document.body.innerHTML = '<main id="m"><div data-no-swipe><span id="t"></span></div></main>'
    expect(startsInNoSwipeZone(byId('t'), byId('m'))).toBe(true)
  })

  it('erkennt waagerecht scrollbare Bereiche', () => {
    document.body.innerHTML =
      '<main id="m"><div id="s" style="overflow-x:auto"><span id="t"></span></div></main>'
    Object.defineProperty(byId('s'), 'scrollWidth', { value: 500 })
    Object.defineProperty(byId('s'), 'clientWidth', { value: 300 })
    expect(startsInNoSwipeZone(byId('t'), byId('m'))).toBe(true)
  })

  it('ignoriert Bereiche ohne Überlauf und außerhalb von main', () => {
    document.body.innerHTML = '<div data-no-swipe><main id="m"><span id="t"></span></main></div>'
    expect(startsInNoSwipeZone(byId('t'), byId('m'))).toBe(false)
  })
})

describe('hasTextSelection', () => {
  it('erkennt markierten Text in einem Eingabefeld', () => {
    document.body.innerHTML = '<input id="i" value="Hallo Welt">'
    const input = byId('i') as HTMLInputElement
    expect(hasTextSelection(input)).toBe(false)
    input.setSelectionRange(0, 5)
    expect(hasTextSelection(input)).toBe(true)
  })
})
