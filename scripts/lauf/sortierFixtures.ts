// „Ideale“ Entscheidungen zu den Testsätzen aus docs/sortier-tests.md und -3.md (Aufgaben 19, 22, 30, 33, 98).
import type { Decision, DecisionItem, DecisionsFile, NewProjectRequest } from './files'
import { existingProjectIdOf, inboxIdOf, type TestSpec } from './testspec'

const item = (patch: Partial<DecisionItem> & Pick<DecisionItem, 'title'>): DecisionItem => ({
  type: 'aufgabe',
  notes: '',
  categoryId: 'privat',
  important: false,
  durationMin: null,
  when: null,
  plan: false,
  gtd: 'naechster-schritt',
  dueDate: null,
  projectId: null,
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
  6: [item({ title: 'Krankenkasse anrufen', important: true, plan: true, durationMin: 15 })],
  7: [
    item({
      title: 'Bewerbung für Werkstudentenstelle überarbeiten',
      categoryId: 'arbeit',
      important: true,
      plan: true,
      durationMin: 120,
    }),
  ],
  8: [
    item({
      title: 'Hausarbeit Statistik Kapitel 3 schreiben',
      categoryId: 'studium',
      important: true,
      plan: true,
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
    item({
      title: 'Steuerberater-Unterlagen abgeben',
      plan: true,
      when: { date: '2026-10-23', time: null },
    }),
  ],
  12: [item({ title: 'Zimmer streichen', plan: true, when: { date: '2026-10-26', time: null } })],
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
  17: [item({ title: 'Mama zurückrufen', important: true, plan: true, durationMin: 15 })],
  18: [item({ title: 'Gitarre üben', gtd: 'irgendwann' })],
  19: [
    item({
      title: 'Mietvertrag kündigen',
      notes: 'Brief schreiben',
      important: true,
      plan: true,
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
      plan: true,
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

const NEW_PROJECT_NOTES = 'Neues Projekt Wohnung renovieren: Wände streichen, Boden neu'

/** Entscheidungen zu Testsatz 3 (`docs/sortier-tests-3.md`): Projekt 0 = „Analysis 1“, 1 = „Umzug“. */
const idealSatz3 = (): Record<number, Decision> => {
  const analysis = existingProjectIdOf(0)
  const move = existingProjectIdOf(1)
  const only = (nr: number, items: DecisionItem[], newProject?: NewProjectRequest): Decision => ({
    inboxId: inboxIdOf(nr),
    newCategory: null,
    ...(newProject ? { newProject } : {}),
    items,
  })
  return {
    1: only(1, [
      item({
        title: 'Rückmeldung zum Angebot',
        gtd: 'warten',
        waiting: { person: 'Jonas', since: '2026-10-21', followUpOn: null },
      }),
    ]),
    2: only(2, [
      item({
        title: 'Heizung nachhaken',
        gtd: 'warten',
        waiting: { person: 'Vermieterin', since: '2026-10-21', followUpOn: '2026-10-23' },
      }),
    ]),
    3: only(3, [item({ title: 'Spanisch lernen für den Urlaub', gtd: 'irgendwann' })]),
    4: only(4, [item({ title: 'Neues Fahrrad anschauen', gtd: 'irgendwann' })]),
    5: only(
      5,
      [
        item({
          title: 'Farbe für die Wände auswählen',
          projectId: '@neu',
        }),
      ],
      { title: 'Wohnung renovieren', notes: NEW_PROJECT_NOTES, categoryId: 'privat' },
    ),
    6: only(6, [
      item({
        title: 'Übungsblatt-Korrektur anschauen',
        categoryId: 'studium',
        projectId: analysis,
      }),
    ]),
    7: only(7, [item({ title: 'Umzugsfirma nach Preisen fragen', projectId: move })]),
    8: only(8, [item({ title: 'Steuererklärung', important: true, dueDate: '2026-10-23' })]),
    9: only(9, [
      item({
        title: 'Hausarbeit',
        categoryId: 'studium',
        durationMin: 120,
        plan: true,
        when: { date: '2026-10-22', time: null },
      }),
    ]),
    10: only(10, [
      item({
        title: 'Zahnarzt',
        type: 'termin',
        when: { date: '2026-10-23', time: '15:00' },
      }),
    ]),
    11: only(11, [
      item({
        title: 'Krankenkasse anrufen',
        durationMin: 15,
        when: { date: '2026-10-22', time: null },
      }),
    ]),
    12: only(12, [item({ title: 'Link an Mia schicken', durationMin: 2 })]),
    13: only(13, [item({ title: 'Unterlagen sortieren' })]),
  }
}

/** Entscheidungsdatei zu Testsatz 3, wie Claude sie nach SPEC §8.3 schreiben sollte. */
export function idealDecisionsSatz3(spec: TestSpec): DecisionsFile {
  const decisions = idealSatz3()
  return { decisions: spec.cases.map((c) => structuredClone(decisions[c.nr])) }
}
