// „Ideale“ Entscheidungen zu den Testsätzen aus docs/sortier-tests.md (Aufgaben 19, 22, 30 und 33).
import type { DecisionItem, DecisionsFile } from './files'
import { inboxIdOf, type TestSpec } from './testspec'

const item = (patch: Partial<DecisionItem> & Pick<DecisionItem, 'title'>): DecisionItem => ({
  type: 'aufgabe',
  notes: '',
  categoryId: 'privat',
  important: false,
  durationMin: null,
  when: null,
  ...patch,
})
const shopping = (title: string): DecisionItem =>
  item({ title, type: 'notiz', categoryId: 'einkauf' })

/** Was Claude nach SPEC §8.3 für jeden Testsatz entscheiden sollte. */
const ideal: Record<number, DecisionItem[]> = {
  1: [item({ title: 'Steuererklärung machen' })],
  2: [item({ title: 'Wohnung putzen' })],
  3: [shopping('Milch'), shopping('Eier'), shopping('Brot')],
  4: [
    item({
      title: 'Zahnarzt',
      type: 'termin',
      when: { date: '2026-10-22', time: '09:00' },
    }),
  ],
  5: [
    item({
      title: 'Treffen mit Frau Becker',
      type: 'termin',
      categoryId: 'studium',
      notes: 'wegen Projektbericht',
      durationMin: 60,
      when: { date: '2026-10-22', time: '14:30' },
    }),
  ],
  6: [item({ title: 'Krankenkasse anrufen', important: true, durationMin: 15 })],
  7: [
    item({
      title: 'Bewerbung für Werkstudentenstelle überarbeiten',
      categoryId: 'arbeit',
      important: true,
      durationMin: 120,
    }),
  ],
  8: [
    item({
      title: 'Hausarbeit Statistik Kapitel 3 schreiben',
      categoryId: 'studium',
      important: true,
      durationMin: 180,
    }),
  ],
  9: [
    item({
      title: 'WLAN im Büro',
      type: 'notiz',
      categoryId: 'arbeit',
      notes: 'Gast-5G',
    }),
  ],
  10: [item({ title: 'Buchtipp: Der Schwarm', type: 'notiz', notes: 'von Lena' })],
  11: [
    item({ title: 'Steuerberater-Unterlagen abgeben', when: { date: '2026-10-23', time: null } }),
  ],
  12: [item({ title: 'Zimmer streichen', when: { date: '2026-10-26', time: null } })],
  13: [item({ title: 'Laufschuhe recherchieren', categoryId: '@neu' })],
  14: [
    item({
      title: 'Vorstandssitzung TV Musterstadt',
      type: 'termin',
      categoryId: 'verein',
      when: { date: '2026-10-26', time: '19:30' },
    }),
  ],
  15: [item({ title: 'Spielanmeldung für November ausfüllen', categoryId: 'verein' })],
  16: [shopping('Klopapier')],
  17: [item({ title: 'Mama zurückrufen', important: true, durationMin: 15 })],
  18: [item({ title: 'Gitarre üben' })],
  19: [
    item({
      title: 'Mietvertrag kündigen',
      notes: 'Brief schreiben',
      important: true,
      durationMin: 30,
    }),
  ],
  20: [
    item({
      title: 'Laufen gehen',
      type: 'termin',
      when: { date: '2026-10-21', time: '18:00' },
    }),
  ],
  21: [
    item({
      title: 'Abgabe Laborbericht',
      categoryId: 'studium',
      when: { date: '2026-10-30', time: null },
    }),
  ],
  22: [item({ title: 'asdf qwer', type: 'notiz' })],
  23: [shopping('Knoblauch')],
  24: [shopping('Knoblauch')],
  25: [shopping('Butter')],
  26: [item({ title: 'Tomaten auf dem Balkon umtopfen', categoryId: 'garten' })],
  27: [item({ title: 'Skript für die Uni-Vorlesung ausdrucken', categoryId: 'studium' })],
  28: [
    item({
      title: 'Mail an den Vermieter schreiben',
      notes: 'wegen Heizung',
      important: true,
      durationMin: 15,
    }),
  ],
  29: [item({ title: 'Stromrechnung bezahlen', important: true, durationMin: 15 })],
}

/** Entscheidungsdatei, wie Claude sie nach SPEC §8.3 schreiben sollte. */
export function idealDecisions(spec: TestSpec): DecisionsFile {
  return {
    decisions: spec.cases.map((c) => ({
      inboxId: inboxIdOf(c.nr),
      newCategory: c.newCategory ? { name: c.newCategory.name, description: '' } : null,
      items: structuredClone(ideal[c.nr]),
    })),
  }
}
