import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { adminSurfacePath } from '@movscript/admin-surface'
import { useQuery } from '@tanstack/react-query'
import type { Project } from '@movscript/shared'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
  StatusDot,
} from '@movscript/ui/primitives'
import {
  ArrowRight,
  Database,
  FolderArchive,
  FolderOpen,
  Home,
  Images,
  LayoutDashboard,
  Loader2,
  MonitorCog,
  Route as RouteIcon,
  Scissors,
  Sparkles,
  Video,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  dismissRecentProject,
  mergeRecentProjects,
  useLocalProjectRecentsStore,
} from '../host-runtime/infrastructure/session/localProjectRecentsStore.js'
import { LocalSurfaceAppChrome } from '../shell/LocalSurfaceAppChrome.js'
import { ROUTES } from '../routes/projectRoutes.js'
import {
  hrefWithSearch,
  localDataAPIV1BaseURL,
  projectHomeHrefForProject,
  projectRouteContext,
} from '../routes/localRouteLinks.js'

export function LocalSurfaceHostHome({
  pathname,
  query,
}: {
  pathname: string
  query: URLSearchParams
}) {
  const { t, i18n } = useTranslation()
  const mcpApiBaseURL = query.get('mcpApiBaseURL') ?? ''
  const source = query.get('source') ?? 'direct'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const localRecentProjects = useLocalProjectRecentsStore((state) => state.projects)
  const dismissedProjectKeys = useLocalProjectRecentsStore((state) => state.dismissedKeys)
  const queryProject = useMemo(() => projectFromQuery(query), [query])
  const projectsQuery = useQuery<Project[]>({
    queryKey: ['local-surface-host', 'projects', localDataAPIV1BaseURL()],
    queryFn: () => fetch(`${localDataAPIV1BaseURL()}/projects`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(readPayloadMessage(payload) ?? `Project list failed with HTTP ${response.status}.`)
        return readProjectsPayload(payload)
      }),
  })
  const projects = useMemo(() => {
    const queryProjects = queryProject ? [queryProject] : []
    return mergeRecentProjects(projectsQuery.data ?? [], [...queryProjects, ...localRecentProjects], dismissedProjectKeys)
  }, [dismissedProjectKeys, localRecentProjects, projectsQuery.data, queryProject])
  const highlightedProject = projects[0] ?? null
  const recentProjects = projects.slice(highlightedProject ? 1 : 0, highlightedProject ? 5 : 6)

  return (
    <LocalSurfaceAppChrome
      title={t('localSurfaceHost.home.title')}
      query={query}
    >
      <section className="surface-host-home surface-host-home--app">
        <header className="surface-host-app-hero">
          <div className="surface-host-app-hero__title">
            <span className="surface-host-app-hero__mark"><Sparkles size={17} /></span>
            <div>
              <h1>{t('localSurfaceHost.home.title')}</h1>
              <p>{t('localSurfaceHost.home.description')}</p>
            </div>
          </div>
          <div className="surface-host-app-hero__status">
            <StatusBadge tone={mcpApiBaseURL ? 'success' : 'neutral'}>
              <StatusDot tone={mcpApiBaseURL ? 'success' : 'neutral'} />
              {mcpApiBaseURL ? t('localSurfaceHost.home.mcpReady') : t('localSurfaceHost.home.localDirect')}
            </StatusBadge>
            <Badge variant="outline">{source}</Badge>
            {projectsQuery.isFetching ? (
              <Badge variant="outline">
                <Loader2 size={12} className="surface-host-spin" />
                {t('common.loadingShort', { defaultValue: 'Loading' })}
              </Badge>
            ) : null}
          </div>
        </header>

        <div className="surface-host-launcher">
          <section className="surface-host-launcher__primary">
            <Card className="surface-host-recent-card">
              <CardHeader>
                <span className="surface-host-card__icon"><FolderOpen size={18} /></span>
                <div>
                  <CardTitle>{t('localSurfaceHost.recent.title', { defaultValue: 'Recent Projects' })}</CardTitle>
                  <CardDescription>
                    {t('localSurfaceHost.recent.description', { defaultValue: 'Open a local project workspace from the directories you touched recently.' })}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {highlightedProject ? (
                  <RecentProjectRow
                    project={highlightedProject}
                    href={projectHomeHrefForProject(highlightedProject, query)}
                    label={t('localSurfaceHost.recent.continueProject', { defaultValue: 'Continue latest project' })}
                    locale={locale}
                    highlighted
                  />
                ) : null}
                <div className="surface-host-recent-list">
                  {recentProjects.map((project) => (
                    <RecentProjectRow
                      key={recentProjectKey(project)}
                      project={project}
                      href={projectHomeHrefForProject(project, query)}
                      locale={locale}
                    />
                  ))}
                  {!projectsQuery.isLoading && projects.length === 0 ? (
                    <div className="surface-host-recent-empty">
                      <FolderArchive size={16} />
                      <span>{t('localSurfaceHost.recent.empty', { defaultValue: 'No recent local projects yet.' })}</span>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </section>

          <WorkspaceQuickActions query={query} />
        </div>
      </section>
    </LocalSurfaceAppChrome>
  )
}

export function LocalSurfaceNotFound({
  pathname,
  query,
}: {
  pathname: string
  query: URLSearchParams
}) {
  const { t } = useTranslation()
  const routeContext = projectRouteContext(pathname, query)
  return (
    <LocalSurfaceAppChrome title={t('localSurfaceHost.chrome.routeNotFoundTitle')} description={pathname} query={query}>
      <section className="surface-host-empty-route">
        <div className="surface-host-empty-route__icon"><RouteIcon size={22} /></div>
        <h1>{t('localSurfaceHost.notFound.title')}</h1>
        <p>{pathname}</p>
        <div className="surface-host-empty-route__actions">
          <Button asChild variant="outline" size="sm">
            <Link to={hrefWithSearch(ROUTES.root, query)}>{t('localSurfaceHost.notFound.backHome')}</Link>
          </Button>
          <Button asChild size="sm">
            <Link to={hrefWithSearch('/studio', query)}>
              {routeContext.projectDir
                ? t('localSurfaceHost.notFound.openProjectHome', { defaultValue: 'Open project home' })
                : t('localSurfaceHost.notFound.backHome')}
            </Link>
          </Button>
        </div>
      </section>
    </LocalSurfaceAppChrome>
  )
}

function RecentProjectRow({
  project,
  href,
  label,
  locale,
  highlighted,
}: {
  project: Project
  href: string
  label?: string
  locale: string
  highlighted?: boolean
}) {
  const { t } = useTranslation()
  const projectPath = project.workspace_path || project.project_path || project.description
  return (
    <div className={highlighted ? 'surface-host-recent-row surface-host-recent-row--highlighted' : 'surface-host-recent-row'}>
      <Link className="surface-host-recent-row__main" to={href}>
        <span className="surface-host-recent-row__icon"><LayoutDashboard size={15} /></span>
        <span className="surface-host-recent-row__copy">
          {label ? <span className="surface-host-recent-row__label">{label}</span> : null}
          <strong>{project.name || projectPath || `Project ${project.ID}`}</strong>
          <small>{projectPath || formatProjectTime(project.UpdatedAt || project.CreatedAt, locale)}</small>
        </span>
        <ArrowRight size={14} className="surface-host-recent-row__arrow" />
      </Link>
      <button
        type="button"
        className="surface-host-recent-row__remove"
        aria-label={t('common.remove', { defaultValue: 'Remove' })}
        onClick={() => dismissRecentProject(project)}
      >
        <X size={14} />
      </button>
    </div>
  )
}

function WorkspaceQuickActions({ query }: { query: URLSearchParams }) {
  const { t } = useTranslation()
  return (
    <section className="surface-host-quick-actions" aria-label={t('localSurfaceHost.homes.label', { defaultValue: 'Other workspaces' })}>
      <div className="surface-host-quick-actions__heading">
        <span>{t('localSurfaceHost.homes.label', { defaultValue: 'Other workspaces' })}</span>
      </div>
      <RouteCatalog query={query} />
    </section>
  )
}

function RouteCatalog({ query }: { query: URLSearchParams }) {
  const { t } = useTranslation()
  const routes = [
    {
      icon: Scissors,
      title: t('localSurfaceHost.homes.edit.title', { defaultValue: 'Edit Home' }),
      description: t('localSurfaceHost.homes.edit.description', { defaultValue: 'Create and reopen editing projects, timelines, subtitles, and export tasks.' }),
      to: hrefWithSearch(ROUTES.editing, query),
    },
    {
      icon: Database,
      title: t('localSurfaceHost.homes.resource.title', { defaultValue: 'Resource Home' }),
      description: t('localSurfaceHost.homes.resource.description', { defaultValue: 'Browse local media, external results, generated assets, and resource details.' }),
      to: hrefWithSearch(ROUTES.resources, query),
    },
    {
      icon: Images,
      title: t('localSurfaceHost.homes.canvas.title', { defaultValue: 'Canvas Home' }),
      description: t('localSurfaceHost.homes.canvas.description', { defaultValue: 'Manage canvases for boards, visual planning, and project inspiration.' }),
      to: hrefWithSearch(ROUTES.canvases, query),
    },
    {
      icon: MonitorCog,
      title: t('localSurfaceHost.homes.system.title', { defaultValue: 'System' }),
      description: t('localSurfaceHost.homes.system.description', { defaultValue: 'Open admin, service diagnostics, and host runtime settings.' }),
      to: adminSurfacePath('overview'),
    },
  ]

  return (
    <>
      {routes.map((route) => (
        <HomeLaunchCard
          key={route.to}
          icon={route.icon}
          title={route.title}
          description={route.description}
          to={route.to}
        />
      ))}
    </>
  )
}

function HomeLaunchCard({
  icon: Icon,
  title,
  description,
  to,
}: {
  icon: LucideIcon
  title: string
  description: string
  to: string
}) {
  return (
    <Link className="surface-host-mode-entry" to={to}>
      <span className="surface-host-mode-entry__icon"><Icon size={17} /></span>
      <span className="surface-host-mode-entry__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ArrowRight size={14} className="surface-host-mode-entry__arrow" />
    </Link>
  )
}

function recentProjectKey(project: Project): string {
  return (project.workspace_path || project.project_path || project.project_uid || project.ID || project.name).toString()
}

function projectFromQuery(query: URLSearchParams): Project | null {
  const projectDir = query.get('projectDir') ?? query.get('projectPath') ?? ''
  if (!projectDir.trim()) return null
  const numericProjectId = localNumericProjectId(projectDir)
  const projectName = query.get('projectName')
    ?? query.get('project_name')
    ?? projectDir.split('/').filter(Boolean).pop()
    ?? `Project ${numericProjectId}`
  const now = new Date().toISOString()
  return {
    ID: numericProjectId,
    name: projectName,
    description: projectDir,
    owner_id: 1,
    workspace_path: projectDir,
    project_path: projectDir,
    local: true,
    CreatedAt: now,
    UpdatedAt: now,
  }
}

function localNumericProjectId(projectDir: string): number {
  let hash = 0
  for (let index = 0; index < projectDir.length; index += 1) {
    hash = (hash * 31 + projectDir.charCodeAt(index)) >>> 0
  }
  return Math.max(1, hash % 2_000_000_000)
}

function readProjectsPayload(raw: unknown): Project[] {
  if (Array.isArray(raw)) return raw as Project[]
  const record = readRecord(raw)
  for (const key of ['projects', 'items', 'records', 'data']) {
    const value = record[key]
    if (Array.isArray(value)) return value as Project[]
  }
  return []
}

function readPayloadMessage(raw: unknown): string | undefined {
  const record = readRecord(raw)
  const value = record.message ?? record.error
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

function formatProjectTime(value: string | undefined, locale: string) {
  const timestamp = value ? Date.parse(value) : Number.NaN
  if (!Number.isFinite(timestamp)) return ''
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
