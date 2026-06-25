import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { AppErrorFallback } from '@movscript/ui/business/app'
import { AppContentLayout } from '@movscript/ui/layout'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { ROUTES } from '@/routes/projectRoutes'
import i18n from '@/i18n'

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <AppErrorFallback
          icon={<AlertTriangle size={20} />}
          title={i18n.t('errorBoundary.title')}
          message={error.message}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

export function LoadingScreen({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div className={fullScreen ? 'fixed inset-0 flex items-center justify-center bg-background type-body text-muted-foreground' : 'flex h-full items-center justify-center type-body text-muted-foreground'}>
      <Loader2 size={16} className="mr-2 animate-spin" />
      {i18n.t('common.loading')}
    </div>
  )
}

export function RouteSuspense({ children, fullScreen = false }: { children: React.ReactNode; fullScreen?: boolean }) {
  return (
    <React.Suspense fallback={<LoadingScreen fullScreen={fullScreen} />}>
      {children}
    </React.Suspense>
  )
}

export function ProjectGuard({ children }: { children: React.ReactNode }) {
  const current = useProjectStore((s) => s.current)
  const hydrated = useProjectStore((s) => s.hydrated)
  if (!hydrated) return <LoadingScreen />
  if (!current) return <Navigate to={ROUTES.root} replace />
  return <>{children}</>
}

export function OrgAdminGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useUserStore((s) => s.hydrated)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const memberships = useUserStore((s) => s.orgMemberships)
  if (!hydrated) return <LoadingScreen fullScreen />
  const membership = memberships.find((m) => m.org_id === currentOrgID)
  if (!membership || membership.is_personal || !['owner', 'admin'].includes(membership.role)) {
    return <Navigate to={ROUTES.projects} replace />
  }
  return <>{children}</>
}

export function OrgGuard({ children }: { children: React.ReactNode }) {
  const hydrated = useUserStore((s) => s.hydrated)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const memberships = useUserStore((s) => s.orgMemberships)
  if (!hydrated) return <LoadingScreen fullScreen />
  const currentMembership = memberships.find((m) => m.org_id === currentOrgID)
  if (!currentMembership) return <Navigate to={ROUTES.orgSelect} replace />
  return <>{children}</>
}

export function RouteContentShell({ children, width = 'xwide' }: { children: React.ReactNode; width?: 'narrow' | 'normal' | 'wide' | 'xwide' | 'full' }) {
  return <AppContentLayout variant="contained" width={width}>{children}</AppContentLayout>
}

export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>
}
