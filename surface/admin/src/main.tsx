import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { AdminSurfaceApp } from './app'
import { queryClient } from '@admin/lib/queryClient'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AdminSurfaceApp />
    </QueryClientProvider>
  </React.StrictMode>,
)
