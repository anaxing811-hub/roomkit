import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.jsx'
import { AppStateProvider } from './store/AppStateContext.jsx'
import { registerServiceWorker } from './pwa.js'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppStateProvider>
      <App />
    </AppStateProvider>
  </StrictMode>
)

registerServiceWorker()
