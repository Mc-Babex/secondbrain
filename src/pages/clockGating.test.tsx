import { render } from '@testing-library/react'
import { PageActiveContext } from '../lib/pageActive'
import { resetDb } from '../data/localStore'
import { CalendarPage } from './calendar/CalendarPage'
import { TasksPage } from './tasks/TasksPage'

beforeEach(() => resetDb(true))
afterEach(() => vi.restoreAllMocks())

function minuteTimers(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((call) => call[1] === 60_000).length
}

describe.each([
  ['Kalender', CalendarPage],
  ['Aufgaben', TasksPage],
])('%s: Uhr-Timer', (_name, Page) => {
  it('läuft nicht auf einer nicht aktiven Seite, aber auf der aktiven', () => {
    const spy = vi.spyOn(window, 'setInterval')
    const inactive = render(
      <PageActiveContext.Provider value={false}>
        <Page />
      </PageActiveContext.Provider>,
    )
    expect(minuteTimers(spy)).toBe(0)
    inactive.unmount()
    render(
      <PageActiveContext.Provider value={true}>
        <Page />
      </PageActiveContext.Provider>,
    )
    expect(minuteTimers(spy)).toBe(1)
  })
})
