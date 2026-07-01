import { runtimeCapabilities, runtimeOverviewCards, runtimeSectionCards } from '@admin-runtime'
import { AdminGenerationToolsPanel } from '@admin/features/generation-tools-admin/components/AdminGenerationToolsPanel'
import { emptyJobMonitorFilters, jobUrlSearchParams } from '@admin/lib/adminJobQueryParams'
import { relativePastDateInput, usageLogsHref } from '@admin/lib/adminLogQueryParams'
import { api } from '@admin/lib/api'
import { useUserStore } from '@admin/store/userStore'
import { AppIconFrame } from '@movscript/ui/business/app'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, BarChart3, Bug, Building2, CloudUpload, Database, FolderKanban, HardDrive, Route as RouteIcon, ScrollText, Settings2, ShieldAlert, Sparkles, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

// ── Admin overview ───────────────────────────────────────────────────────────

const disabledBaseRoutePaths = new Set(runtimeCapabilities.disabledBaseRoutes ?? [])

function adminBaseRouteDisabled(path: string): boolean {
  return disabledBaseRoutePaths.has(path)
}
interface AdminOverviewSummary {
  generated_at: string
  users: { total: number; active: number; disabled: number }
  orgs: { total: number; suspended: number }
  projects: { total: number }
  models: {
    credentials: number
    enabled_credentials: number
    catalog_entries: number
    enabled_catalog_entries: number
    route_bindings: number
    enabled_route_bindings: number
  }
  jobs: { total: number; pending: number; running: number; succeeded: number; failed: number; cancelled: number }
  usage: { records: number; cost_7d: number; cost_30d: number }
  resources: { total: number; bytes: number }
  audits: { total: number }
}
function formatAdminNumber(value: number | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : '0'
}

function formatAdminCredits(value: number | undefined): string {
  return `${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function formatAdminBytes(value: number | undefined): string {
  const bytes = value ?? 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
export default function AdminOverviewPage() {
  const { t } = useTranslation()
  const currentUser = useUserStore((s) => s.currentUser)
  const navigate = useNavigate()

  const { data: overview } = useQuery<AdminOverviewSummary>({
    queryKey: ['admin', 'overview'],
    queryFn: () => api.get('/admin/overview').then((r) => r.data),
    refetchInterval: 30000,
  })

  const queuedJobs = (overview?.jobs?.pending ?? 0) + (overview?.jobs?.running ?? 0)
  const jobMonitorHref = `/debug?${jobUrlSearchParams(emptyJobMonitorFilters, 1).toString()}`
  const usage7dHref = usageLogsHref({ since: relativePastDateInput(7) })

  const overviewCards = [
    ...(!runtimeCapabilities.hideModelManagement ? [{
      label: t('admin.home.metrics.enabledCatalogEntries'),
      value: formatAdminNumber(overview?.models?.enabled_catalog_entries),
      detail: t('admin.home.metrics.providerRoutes', {
        providers: formatAdminNumber(overview?.models?.credentials),
        routes: formatAdminNumber(overview?.models?.enabled_route_bindings),
      }),
      icon: Settings2,
      href: '/models/catalog',
    }] : []),
    {
      label: t('admin.home.metrics.projects'),
      value: formatAdminNumber(overview?.projects?.total),
      detail: t('admin.home.metrics.usersAndOrgs', { users: formatAdminNumber(overview?.users?.total), orgs: formatAdminNumber(overview?.orgs?.total) }),
      icon: FolderKanban,
      href: '/projects',
    },
    ...(!adminBaseRouteDisabled('/debug') ? [{
      label: t('admin.home.metrics.queuedJobs'),
      value: formatAdminNumber(queuedJobs),
      detail: t('admin.home.metrics.failedJobs', { count: formatAdminNumber(overview?.jobs?.failed) }),
      icon: Sparkles,
      href: jobMonitorHref,
    }] : []),
    ...(!adminBaseRouteDisabled('/usage-logs') ? [{
      label: t('admin.home.metrics.usage7d'),
      value: formatAdminCredits(overview?.usage?.cost_7d),
      detail: t('admin.home.metrics.usage30d', { cost: formatAdminCredits(overview?.usage?.cost_30d) }),
      icon: BarChart3,
      href: usage7dHref,
    }] : []),
    {
      label: t('admin.home.metrics.storage'),
      value: formatAdminBytes(overview?.resources?.bytes),
      detail: t('admin.home.metrics.resourceFiles', { count: formatAdminNumber(overview?.resources?.total) }),
      icon: HardDrive,
      href: '/storage',
    },
    ...runtimeOverviewCards,
  ]

  const sectionCards = [
    ...(!runtimeCapabilities.hideModelManagement ? [
      { label: t('admin.tabs.modelProviders'), detail: t('admin.home.sections.modelProviders'), icon: Settings2, href: '/models/providers' },
      { label: t('admin.tabs.modelCatalog'), detail: t('admin.home.sections.modelCatalog'), icon: Database, href: '/models/catalog' },
      { label: t('admin.tabs.modelRoutes'), detail: t('admin.home.sections.modelRoutes'), icon: RouteIcon, href: '/models/routes' },
    ] : []),
    ...(!adminBaseRouteDisabled('/user-management') ? [{ label: t('admin.tabs.users'), detail: t('admin.home.sections.users'), icon: UsersRound, href: '/user-management' }] : []),
    ...(!adminBaseRouteDisabled('/orgs') ? [{ label: t('admin.tabs.orgs'), detail: t('admin.home.sections.orgs'), icon: Building2, href: '/orgs' }] : []),
    { label: t('admin.tabs.projects'), detail: t('admin.home.sections.projects', { count: formatAdminNumber(overview?.projects?.total) }), icon: FolderKanban, href: '/projects' },
    { label: t('admin.tabs.auditLogs'), detail: t('admin.home.sections.auditLogs', { count: formatAdminNumber(overview?.audits?.total) }), icon: ScrollText, href: '/audit-logs' },
    ...(!adminBaseRouteDisabled('/usage-logs') ? [{ label: t('admin.tabs.logs'), detail: t('admin.home.sections.usageLogs', { count: formatAdminNumber(overview?.usage?.records) }), icon: BarChart3, href: '/usage-logs' }] : []),
    { label: t('admin.tabs.storage'), detail: t('admin.home.sections.storage', { count: formatAdminNumber(overview?.resources?.total) }), icon: HardDrive, href: '/storage' },
    { label: t('admin.tabs.cloudFiles'), detail: t('admin.home.sections.cloudFiles'), icon: CloudUpload, href: '/cloud-files' },
    ...(!adminBaseRouteDisabled('/debug') ? [{ label: t('admin.tabs.debug'), detail: t('admin.home.sections.debug'), icon: Bug, href: '/debug?tab=system' }] : []),
    ...runtimeSectionCards,
  ]

  if (currentUser?.system_role !== 'super_admin') {
    navigate('/projects', { replace: true })
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <AppIconFrame tone="info" className="mt-0.5">
          <ShieldAlert size={18} />
        </AppIconFrame>
        <div>
          <h1 className="text-base font-semibold text-foreground">{t('admin.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t('admin.subtitle')}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <Link key={card.label} to={card.href} className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-ring/70">
            <div className="mb-4 flex items-center justify-between">
              <AppIconFrame size="lg" tone="info">
                <card.icon size={18} />
              </AppIconFrame>
              <ArrowUpRight size={15} className="text-muted-foreground transition-colors group-hover:text-foreground" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </Link>
        ))}
      </div>

      <AdminGenerationToolsPanel />

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {sectionCards.map((card) => (
          <Link key={card.href} to={card.href} className="group flex items-start gap-3 rounded-lg border border-border bg-background p-4 transition-colors hover:border-ring/70 hover:bg-card">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
              <card.icon size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{card.label}</h2>
                <ArrowUpRight size={14} className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
