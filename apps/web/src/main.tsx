import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <main className="p-4 text-brand">Archipelago</main>
  </StrictMode>,
)
