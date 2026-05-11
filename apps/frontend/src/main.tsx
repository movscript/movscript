import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { initTheme } from './hooks/useTheme'
import App from './App'
import './index.css'
import './i18n'
import { applyE2EBootstrapSeedFromStorage } from './lib/e2eBootstrap'

initTheme()
applyE2EBootstrapSeedFromStorage()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
