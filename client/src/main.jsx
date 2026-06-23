import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// --- MASHCLOUD HIDDEN SIGNATURE ---
console.log(
  "%c Mashcloud ",
  "background: #0a84ff; color: #fff; border-radius: 5px; padding: 2px 5px; font-weight: bold;"
);
console.log(
  "%c Handcrafted with excellence by Janush sahni. Built for privacy, secured with Pentaract E2EE. © 2026. ",
  "color: #86868b; font-style: italic;"
);
// ----------------------------------

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
