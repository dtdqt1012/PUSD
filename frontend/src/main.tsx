import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Temporarily disable StrictMode to avoid hook order issues in dev
createRoot(document.getElementById('root')!).render(
  <App />
)

