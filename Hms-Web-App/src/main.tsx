import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import './styles/index.css'

/**
 * HashRouter rather than BrowserRouter: when this is deployed as static files under a
 * sub-path (e.g. the backend's own /web/app handler), refreshing on /appointments/new
 * would 404 against a plain file server. Hash routes never hit the server.
 */
const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

createRoot(container).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
