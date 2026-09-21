import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { clubConfig } from './config/club'
import './index.css'
import App from './App.tsx'

// Stamp the configured language on <html> before render, so the CJK font stack
// in index.css is in place for the first paint rather than swapping in after it.
document.documentElement.lang = clubConfig.locale.language
document.documentElement.dataset.lang = clubConfig.locale.language

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
