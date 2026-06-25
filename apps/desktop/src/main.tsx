import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './shared/infrastructure/queryClient'
import { initTheme } from './features/app-shell/application/useTheme'
import App from './App'
import './index.css'
import './i18n'
import './shared/infrastructure/api'
import { applyE2EBootstrapSeedFromStorage } from './shared/infrastructure/e2eBootstrap'
import { installAgentPerformanceObservers } from './features/agent/state/agentPerformanceStore'

initTheme()
applyE2EBootstrapSeedFromStorage()
installAgentPerformanceObservers()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
