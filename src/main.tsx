import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './hooks/useTheme.tsx'
import { applyShareFromUrl } from './lib/shareConfig'

// A ?s=<config> share link writes its snapshot to localStorage and strips the
// param BEFORE React mounts, so usePersistedState initializers read the applied
// values on first render (no flash of the recipient's own config).
applyShareFromUrl()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
