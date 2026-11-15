import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { configure } from '@testing-library/react'

// findBy…/waitFor: 1 s Standard ist unter Last zu knapp (zufällige Zeitüberschreitungen).
configure({ asyncUtilTimeout: 5000 })
