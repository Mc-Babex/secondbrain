import { berlinDate } from '../lib/gtd'
import { dueInstances } from '../lib/series'
import { nowIso } from '../lib/time'
import { commitLocal, updateFileLocal } from './localStore'
import { listItems, listProjects, notifyChange } from './repository'
import { isProject, isStepSeries, normalizeProject, type Item, type Project } from './types'

const FORMAT_V = 2

/**
 * Legt fällige Serien-Instanzen an (SPEC §3.12). Nur nach einem erfolgreichen Herunterladen im Sync
 * aufzurufen. Je aktiver Serie eines aktiven Projekts: Instanzen lokal schreiben (+ Outbox), danach
 * die Projektdatei mit neuem `lastNumber`/`lastDate` (Outbox-Reihenfolge: Instanzen vor Projekt).
 * Liefert die Anzahl neuer Instanzen.
 */
export async function createDueSeriesInstances(now: Date = new Date()): Promise<number> {
  const today = berlinDate(now)
  const projects = (await listProjects()).filter((p) => p.status === 'aktiv')
  let items = await listItems()
  let created = 0
  for (const project of projects) {
    const progress = new Map<string, { lastNumber: number; lastDate: string | null }>()
    const instances: Item[] = []
    for (const series of project.series) {
      if (!isStepSeries(series) || series.state !== 'aktiv') continue
      const due = dueInstances(project, series, items, today)
      if (due.instances.length === 0) continue
      progress.set(series.id, { lastNumber: due.lastNumber, lastDate: due.lastDate })
      instances.push(...due.instances)
      items = [...items, ...due.instances]
    }
    if (instances.length === 0) continue
    await commitLocal(instances.map((data) => ({ path: `items/${data.id}.json`, op: 'put', data })))
    await updateFileLocal(`projects/${project.id}.json`, (current) =>
      withProgress(current, project.id, progress),
    )
    created += instances.length
  }
  if (created > 0) notifyChange()
  return created
}

/** Übernimmt Nummer und Stichtag in die aktuelle Projektdatei (nie rückwärts); alles andere bleibt. */
function withProgress(
  current: unknown,
  id: string,
  progress: ReadonlyMap<string, { lastNumber: number; lastDate: string | null }>,
): Project {
  if (!isProject(current)) throw new Error(`Projekt ${id} nicht gefunden`)
  const project = normalizeProject(current)
  return {
    ...project,
    series: project.series.map((entry) => {
      const next = isStepSeries(entry) ? progress.get(entry.id) : undefined
      if (!isStepSeries(entry) || next === undefined) return entry
      return {
        ...entry,
        lastNumber: Math.max(entry.lastNumber, next.lastNumber),
        lastDate:
          entry.lastDate !== null && (next.lastDate === null || entry.lastDate > next.lastDate)
            ? entry.lastDate
            : next.lastDate,
      }
    }),
    updatedAt: nowIso(),
    v: FORMAT_V,
  }
}
