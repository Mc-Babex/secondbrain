import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorLogging } from './data/errorLog'
import { startPastAppointmentsArchiver } from './data/pastAppointmentsTrigger'
import { startAppUpdates } from './lib/appUpdate'
import { installDisplayLogging, logVersionChange } from './lib/serviceWorkerLog'
import { startAutoSync } from './data/sync'
import { trackKeyboard } from './lib/viewport'
import './styles/theme.css'
import './styles/global.css'

installGlobalErrorLogging()

installDisplayLogging()
logVersionChange(__BUILD_STAMP__)
const updates = startAppUpdates()
registerSW({ immediate: true, onNeedReload: updates.serviceWorkerUpdated })
startAutoSync()
startPastAppointmentsArchiver()
trackKeyboard()

const container = document.getElementById('root')
if (!container) throw new Error('Wurzelelement #root fehlt')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary area="App" message="Die App hatte einen Fehler.">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
