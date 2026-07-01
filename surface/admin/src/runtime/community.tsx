import React from 'react'
import { Navigate } from 'react-router-dom'

import { AuditLogsPage } from '@admin/pages/admin/AuditLogsPage'
import { OrgManagementPage } from '@admin/pages/admin/OrgManagementPage'
import { ShotVectorPage } from '@admin/pages/admin/ShotVectorPage'
import { UserManagementPage } from '@admin/pages/admin/UserManagementPage'
import type { AdminDashboardCard, AdminNavItem, AdminRouteItem, AdminRuntimeCapabilities, AdminSectionCard } from './contract'

const AdminOverviewPage = React.lazy(() => import('@admin/pages/admin/AdminOverviewPage'))
const ProjectOwnerManagementPage = React.lazy(() =>
  import('@admin/features/projects-admin/pages/ProjectOwnerManagementPage').then((module) => ({ default: module.ProjectOwnerManagementPage })),
)
const StoragePage = React.lazy(() =>
  import('@admin/features/storage-admin/pages/StoragePage').then((module) => ({ default: module.StoragePage })),
)
const CloudFileConfigPage = React.lazy(() =>
  import('@admin/features/cloud-files-admin/pages/CloudFileConfigPage').then((module) => ({ default: module.CloudFileConfigPage })),
)
const DebugPage = React.lazy(() =>
  import('@admin/pages/admin/DebugPage').then((module) => ({ default: module.DebugPage })),
)
const ModelManagementPage = React.lazy(() =>
  import('@admin/features/model-management/pages/ModelManagementPage').then((module) => ({ default: module.ModelManagementPage })),
)
const UsageLogsPage = React.lazy(() =>
  import('@admin/pages/admin/UsageLogsPage').then((module) => ({ default: module.UsageLogsPage })),
)
const SystemSettingsPage = React.lazy(() =>
  import('@admin/pages/admin/SystemSettingsPage').then((module) => ({ default: module.SystemSettingsPage })),
)

export const runtimeNavItems: AdminNavItem[] = []

export const runtimeBaseRoutes: AdminRouteItem[] = [
  { path: '/', element: <AdminOverviewPage /> },
  { path: '/overview', element: <AdminOverviewPage /> },
  { path: '/models', element: <Navigate to="/models/providers" replace /> },
  { path: '/models/providers', element: <ModelManagementPage view="providers" /> },
  { path: '/models/catalog', element: <ModelManagementPage view="catalog" /> },
  { path: '/models/routes', element: <ModelManagementPage view="routes" /> },
  { path: '/user-management', element: <UserManagementPage /> },
  { path: '/orgs', element: <OrgManagementPage /> },
  { path: '/projects', element: <ProjectOwnerManagementPage /> },
  { path: '/audit-logs', element: <AuditLogsPage /> },
  { path: '/usage-logs', element: <UsageLogsPage /> },
  { path: '/shot-vectors', element: <ShotVectorPage /> },
  { path: '/storage', element: <StoragePage /> },
  { path: '/cloud-files', element: <CloudFileConfigPage /> },
  { path: '/settings', element: <SystemSettingsPage /> },
  { path: '/debug', element: <DebugPage /> },
]

export const runtimeRoutes: AdminRouteItem[] = []

export const runtimeOverviewCards: AdminDashboardCard[] = []

export const runtimeSectionCards: AdminSectionCard[] = []

export const runtimeCapabilities: AdminRuntimeCapabilities = {
  userQuotaManagement: false,
  relayGatewayGroup: false,
  hideModelManagement: false,
  modelManagementRedirect: undefined,
  disabledBaseRoutes: ['/user-management', '/orgs'],
}
