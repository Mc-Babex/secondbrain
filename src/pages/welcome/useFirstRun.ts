import { useCallback, useEffect, useState } from 'react'
import { getSecret } from '../../data/localStore'
import { listInbox, listItems } from '../../data/repository'
import { isFirstRunDone, markFirstRunDone, shouldShowFirstRun } from '../../lib/firstRun'

export type FirstRunStatus = 'checking' | 'show' | 'hide'

/** Prüft beim Start einmal, ob die Ersteinrichtung erscheint; bei gesetztem Merker sofort `hide`. */
export function useFirstRun(): { status: FirstRunStatus; finish: () => void } {
  const [status, setStatus] = useState<FirstRunStatus>(() =>
    isFirstRunDone() ? 'hide' : 'checking',
  )

  useEffect(() => {
    if (status !== 'checking') return undefined
    let active = true
    void Promise.all([getSecret('githubToken'), getSecret('githubRepo'), listInbox(), listItems()])
      .then(([token, repo, inbox, items]) => {
        const show = shouldShowFirstRun({
          hasToken: Boolean(token),
          hasRepo: Boolean(repo),
          hasEntries: inbox.length > 0 || items.length > 0,
          markerSet: false,
        })
        if (!show) markFirstRunDone()
        if (active) setStatus(show ? 'show' : 'hide')
      })
      .catch(() => {
        // Lässt sich der Bestand nicht prüfen, lieber die App zeigen als eine falsche Einrichtung.
        if (active) setStatus('hide')
      })
    return () => {
      active = false
    }
  }, [status])

  const finish = useCallback(() => {
    markFirstRunDone()
    setStatus('hide')
  }, [])

  return { status, finish }
}
