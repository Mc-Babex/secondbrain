import { describe, expect, it } from 'vitest'
import {
  connectionMessage,
  isValidRepo,
  storedTokenHint,
  validatePlanningWindow,
} from './githubForm'

describe('githubForm', () => {
  it('prüft das Repository-Format', () => {
    expect(isValidRepo('alex/secondbrain-daten')).toBe(true)
    expect(isValidRepo(' alex/daten ')).toBe(true)
    expect(isValidRepo('alex')).toBe(false)
    expect(isValidRepo('a/b/c')).toBe(false)
    expect(isValidRepo('a b/c')).toBe(false)
  })

  it('zeigt nur die letzten vier Zeichen des Tokens', () => {
    expect(storedTokenHint('github_pat_geheimABCDx9Fz')).toBe('Token gespeichert (endet auf …x9Fz)')
  })

  it('übersetzt Verbindungsergebnisse', () => {
    expect(connectionMessage('ok')).toBe('Verbunden')
    expect(connectionMessage('unauthorized')).toBe('Token ungültig oder abgelaufen')
    expect(connectionMessage('notFound')).toBe('Repository nicht gefunden oder kein Zugriff')
    expect(connectionMessage('offline')).toBe('Keine Internetverbindung')
    expect(connectionMessage('error')).toBe('Unbekannter Fehler')
  })

  it('validiert das Planungsfenster', () => {
    expect(validatePlanningWindow('09:00', '19:00')).toBeNull()
    expect(validatePlanningWindow('19:00', '09:00')).not.toBeNull()
    expect(validatePlanningWindow('09:00', '09:00')).not.toBeNull()
    expect(validatePlanningWindow('', '09:00')).not.toBeNull()
  })
})
