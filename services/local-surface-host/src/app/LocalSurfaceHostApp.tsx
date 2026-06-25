import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import {
  isAdminSurfacePath,
  LocalAdminSurfaceRoute,
} from '../admin/LocalAdminSurfaceRoute.js'
import { LocalSurfaceHostRoutes } from '../routes/LocalSurfaceHostRoutes.js'

const localSurfaceQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
})

export function LocalSurfaceHostApp() {
  const pathname = window.location.pathname

  if (isAdminSurfacePath(pathname)) {
    return (
      <QueryClientProvider client={localSurfaceQueryClient}>
        <LocalAdminSurfaceRoute />
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={localSurfaceQueryClient}>
      <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <LocalSurfaceHostRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
