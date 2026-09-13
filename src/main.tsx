import './lib/migrateStorageKeys'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (import.meta.env.VITE_MOBILE_CLIENT === 'true') {
  const { createMobileApi } = await import('./lib/mobileApiShim/createMobileApi')
  ;(window as unknown as { api: unknown }).api = createMobileApi(
    `ws://${window.location.host}/relay`
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
