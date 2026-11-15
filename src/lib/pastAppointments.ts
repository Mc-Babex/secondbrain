import type { Item } from '../data/types'

/** Ende des Termins (`start + durationMin`) oder `null`, wenn der Eintrag kein gültiges `schedule` hat. */
export function appointmentEnd(item: Pick<Item, 'type' | 'schedule'>): Date | null {
  if (item.type !== 'termin' || !item.schedule) return null
  const start = Date.parse(item.schedule.start)
  if (Number.isNaN(start)) return null
  return new Date(start + item.schedule.durationMin * 60_000)
}

/** Termin mit `schedule`, dessen Ende (`<=` jetzt) vorbei ist – unabhängig vom Status. */
export function hasEnded(item: Pick<Item, 'type' | 'schedule'>, now: Date): boolean {
  const end = appointmentEnd(item)
  return end !== null && end.getTime() <= now.getTime()
}

/** Offene Termine, die vorbei sind und nach „Erledigt“ gehören (SPEC §6.4). */
export function selectPastAppointments(items: readonly Item[], now: Date): Item[] {
  return items.filter((item) => item.status === 'offen' && hasEnded(item, now))
}
