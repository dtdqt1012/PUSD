import { createRoot } from 'react-dom/client'
import App from './App.tsx'
// Import early to suppress RPC errors
import './utils/suppressRPCErrors'

// Temporarily disable StrictMode to avoid hook order issues in dev
createRoot(document.getElementById('root')!).render(
  <App />
)

