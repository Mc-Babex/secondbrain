/** Tag `YYYY-MM-DD` um `days` Tage verschoben (reine Kalenderrechnung). */
export function shiftDay(day: string, days: number): string {
  const [year, month, d] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, d + days)).toISOString().slice(0, 10)
}

/** Anzahl Kalendertage von `from` bis `to` (beide `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}
