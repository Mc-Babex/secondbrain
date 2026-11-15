import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PageDots } from './components/PageDots'
import { PageSlot } from './components/PageSlot'
import { SyncIndicator } from './components/SyncIndicator'
import { UpdateBanner } from './components/UpdateBanner'
import { startPendingAutoSort } from './data/pendingAutoSort'
import { reloadForUpdate, useUpdateNotice } from './lib/appUpdate'
import { OpenSettingsContext } from './lib/openSettings'
import { GestureClaimContext } from './lib/gestureClaim'
import { useDisplayWatchdog } from './lib/displayWatchdog'
import { movePages } from './lib/pageLayout'
import { useScrollGuard } from './lib/scrollGuard'
import { useReducedMotion } from './lib/reducedMotion'
import { useSwipe } from './lib/useSwipe'
import { useUnsavedWork } from './lib/unsavedWork'
import { PAGES, START_PAGE_INDEX } from './pages/pages'
import { SettingsPage } from './pages/settings/SettingsPage'
import { Welcome } from './pages/welcome/Welcome'
import { useFirstRun } from './pages/welcome/useFirstRun'
import styles from './App.module.css'

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

function AppPages() {
  const [pageIndex, setPageIndex] = useState(START_PAGE_INDEX)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const reducedMotion = useReducedMotion()
  const updateNotice = useUpdateNotice()
  useUnsavedWork('settings', settingsOpen)

  const move = useCallback((direction: -1 | 1) => {
    setPageIndex((index) => Math.min(PAGES.length - 1, Math.max(0, index + direction)))
  }, [])

  const { handlers, claimGesture, areaRef } = useSwipe({
    index: pageIndex,
    count: PAGES.length,
    trackRef,
    reducedMotion,
    onChange: setPageIndex,
  })

  const attachMain = useCallback(
    (element: HTMLElement | null) => {
      mainRef.current = element
      areaRef(element)
    },
    [areaRef],
  )
  useDisplayWatchdog(mainRef, trackRef, pageIndex)
  useScrollGuard(mainRef)

  // Seitenwechsel ohne Wischen (Tasten, Punkte): Übergang starten; nach dem Wischen läuft er bereits.
  const shownIndex = useRef(pageIndex)
  useLayoutEffect(() => {
    const from = shownIndex.current
    shownIndex.current = pageIndex
    const track = trackRef.current
    if (!track || from === pageIndex || track.dataset.target === String(pageIndex)) return
    movePages(track, from, pageIndex, reducedMotion)
  }, [pageIndex, reducedMotion])

  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  useEffect(() => {
    if (settingsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextInput(event.target) || document.querySelector('[role="dialog"]')) return
      if (event.key === 'ArrowLeft') move(-1)
      else if (event.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen, move])

  const openSettings = () => setSettingsOpen(true)

  return (
    <>
      <div className={styles.app} hidden={settingsOpen}>
        <header className={styles.topBar}>
          <button
            type="button"
            className={styles.gear}
            aria-label="Einstellungen"
            onClick={openSettings}
          >
            ⚙
          </button>
          <SyncIndicator onClick={openSettings} />
        </header>
        <main ref={attachMain} className={styles.main} {...handlers}>
          <OpenSettingsContext.Provider value={openSettings}>
            <GestureClaimContext.Provider value={claimGesture}>
              <div
                ref={trackRef}
                className={styles.track}
                data-reduced={reducedMotion ? '' : undefined}
                data-testid="page-track"
              >
                {PAGES.map(({ id, name, Component }, index) => (
                  <PageSlot key={id} active={index === pageIndex}>
                    <ErrorBoundary area={`Seite ${name}`}>
                      <Component />
                    </ErrorBoundary>
                  </PageSlot>
                ))}
              </div>
            </GestureClaimContext.Provider>
          </OpenSettingsContext.Provider>
        </main>
        {updateNotice && <UpdateBanner onReload={reloadForUpdate} />}
        <PageDots pages={PAGES} activeIndex={pageIndex} onSelect={setPageIndex} />
      </div>
      {settingsOpen && (
        <ErrorBoundary area="Seite Einstellungen" onClose={closeSettings}>
          <SettingsPage onClose={closeSettings} />
        </ErrorBoundary>
      )}
    </>
  )
}

/** Zeigt auf einem leeren, neuen Gerät zuerst die Ersteinrichtung (SPEC §6.5), sonst sofort die Seiten. */
export function App() {
  const { status, finish } = useFirstRun()
  useEffect(() => startPendingAutoSort(), [])
  if (status === 'checking') return null
  if (status === 'show') return <Welcome onFinish={finish} />
  return <AppPages />
}
