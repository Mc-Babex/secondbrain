import { isGtdStatus, migrateItem } from './gtdMigration'

const task = { type: 'aufgabe', status: 'offen', title: 'T', important: true }

describe('migrateItem', () => {
  it('macht eine offene Aufgabe ohne gtd zum nächsten Schritt und behält ★', () => {
    expect(migrateItem(task)).toEqual({ ...task, gtd: 'naechster-schritt' })
  })

  it('behandelt ein ungültiges gtd wie fehlend', () => {
    expect(migrateItem({ ...task, gtd: 'xyz' }).gtd).toBe('naechster-schritt')
    expect(migrateItem({ ...task, gtd: 5 }).gtd).toBe('naechster-schritt')
  })

  it('lässt gültige Status unverändert (gleiches Objekt)', () => {
    const waiting = { ...task, gtd: 'warten' }
    expect(migrateItem(waiting)).toBe(waiting)
  })

  it.each([
    ['Notiz', { type: 'notiz', status: 'offen' }],
    ['Termin', { type: 'termin', status: 'offen' }],
    ['Erledigtes', { type: 'aufgabe', status: 'erledigt' }],
  ])('lässt %s unverändert', (_name, item) => {
    expect(migrateItem(item)).toBe(item)
  })

  it('ist idempotent', () => {
    for (const x of [task, { ...task, gtd: 'warten' }, { type: 'notiz', status: 'offen' }]) {
      expect(migrateItem(migrateItem(x))).toEqual(migrateItem(x))
    }
  })

  it('isGtdStatus erkennt nur die drei Werte', () => {
    expect(isGtdStatus('warten')).toBe(true)
    expect(isGtdStatus('termin')).toBe(false)
    expect(isGtdStatus(undefined)).toBe(false)
  })
})
