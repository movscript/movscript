import React from 'react'
import type { AdminLaunchContext } from '@movscript/admin-surface/react'

const AdminSurfaceApp = React.lazy(() =>
  import('@movscript/admin-surface/react').then((module) => ({ default: module.AdminSurfaceApp })),
)

export function LocalAdminSurfaceRoute() {
  return (
    <React.Suspense fallback={<main className="surface-host-admin-loading">{localAdminLoadingLabel()}</main>}>
      <AdminSurfaceApp basename="/admin" launchContext={createLocalAdminLaunchContext()} windowChrome="none" />
    </React.Suspense>
  )
}

export function createLocalAdminLaunchContext(): AdminLaunchContext {
  if (typeof window === 'undefined') return null
  const localWorkspaceName = localWorkspaceDisplayName()
  return {
    user: {
      ID: 1,
      username: localWorkspaceName,
      system_role: 'super_admin',
    },
    org_memberships: [
      {
        org_id: 1,
        org_name: localWorkspaceName,
        org_slug: 'local-workspace',
        is_personal: true,
        status: 'active',
        role: 'owner',
      },
    ],
    current_org_id: 1,
    api_base_url: window.location.origin,
    theme: readLocalTheme(),
    language: readLocalLanguage(),
  }
}

export function isAdminSurfacePath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

function readLocalTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem('movscript-theme') === 'dark' ? 'dark' : 'light'
}

function readLocalLanguage(): 'zh-CN' | 'en-US' {
  const stored = readStorageLanguage()
  if (stored === 'zh-CN' || stored === 'en-US') return stored
  if (typeof navigator === 'undefined') return 'zh-CN'
  const language = navigator.language || navigator.languages?.[0] || ''
  return language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function localAdminLoadingLabel(): string {
  return readLocalLanguage() === 'zh-CN' ? '正在加载 admin...' : 'Loading admin...'
}

function localWorkspaceDisplayName(): string {
  const stored = readStorageLanguage()
  const language = stored === 'zh-CN' || stored === 'en-US' ? stored : readLocalLanguage()
  return language === 'zh-CN' ? '本地工作区' : 'Local Workspace'
}

function readStorageLanguage(): string | undefined {
  try {
    return window.localStorage.getItem('movscript.language')
      ?? window.localStorage.getItem('movscript.localSurfaceHost.language')
      ?? undefined
  } catch {
    return undefined
  }
}
