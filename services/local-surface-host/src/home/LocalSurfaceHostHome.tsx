import { useMemo, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { adminSurfacePath } from '@movscript/admin-surface'
import { useQuery } from '@tanstack/react-query'
import type { Project } from '@movscript/shared'
import {
  AppSidebarHeader,
  AppSidebarNav,
  AppSidebarNavItemContent,
  AppSidebarNavItemFrame,
  AppSidebarSection,
  AppSidebarShell,
} from '@movscript/ui/layout'
import {
  Badge,
  Button,
} from '@movscript/ui/primitives'
import {
  ArrowRight,
  Clapperboard,
  Database,
  FileAudio,
  FileText,
  FolderArchive,
  FolderOpen,
  Images,
  LayoutDashboard,
  Loader2,
  History,
  MonitorCog,
  Route as RouteIcon,
  ScanSearch,
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

interface ToolHomeEntry {
  icon: LucideIcon
  title: string
  description: string
  to: string
  action?: string
  external?: boolean
  featured?: boolean
}

interface ToolHomeGroup {
  icon: LucideIcon
  title: string
  entries: ToolHomeEntry[]
}

export function LocalSurfaceHostHome({
  pathname,
  query,
}: {
  pathname: string
  query: URLSearchParams
}) {
  const { t } = useTranslation()
  const projectState = useLocalSurfaceProjects(query)
  const appRecentProjects = projectState.highlightedProject
    ? [projectState.highlightedProject, ...projectState.recentProjects]
    : projectState.recentProjects

  return (
    <LocalSurfaceAppChrome
      title={t('localSurfaceHost.home.title')}
      query={query}
    >
      <section className="surface-host-home surface-host-home--app">
        <header className="surface-host-mode-header">
          <div className="surface-host-mode-header__title">
            <span className="surface-host-mode-header__icon"><Sparkles size={17} /></span>
            <span>
              <h1>{t('localSurfaceHost.home.workspaceTitle')}</h1>
              <p>{t('localSurfaceHost.home.workspaceDescription')}</p>
            </span>
          </div>
          <div className="surface-host-mode-header__actions">
            <Link className="surface-host-primary-action" to={hrefWithSearch(ROUTES.toolHome, query)}>
              <span>{t('localSurfaceHost.home.primaryAction')}</span>
              <ArrowRight size={14} />
            </Link>
            <Link className="surface-host-secondary-action" to={hrefWithSearch(ROUTES.projects, query)}>
              {t('localSurfaceHost.home.secondaryAction')}
            </Link>
          </div>
        </header>

        <div className="surface-host-app-overview">
          <section className="surface-host-app-section">
            <SectionHeading
              icon={FolderOpen}
              title={t('localSurfaceHost.recent.title')}
              description={t('localSurfaceHost.recent.description')}
              loading={projectState.projectsQuery.isFetching}
            />
            <div className="surface-host-recent-list surface-host-recent-list--rail">
              {appRecentProjects.map((project, index) => (
                <RecentProjectRow
                  key={recentProjectKey(project)}
                  project={project}
                  href={projectHomeHrefForProject(project, query)}
                  label={index === 0 ? t('localSurfaceHost.recent.continueProject') : undefined}
                  locale={projectState.locale}
                  highlighted={index === 0}
                />
              ))}
              {!projectState.projectsQuery.isLoading && projectState.projects.length === 0 ? (
                <div className="surface-host-recent-empty">
                  <FolderArchive size={16} />
                  <span>{t('localSurfaceHost.recent.empty')}</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface-host-app-section surface-host-app-section--tools">
            <SectionHeading
              icon={LayoutDashboard}
              title={t('localSurfaceHost.homes.primaryTitle')}
              description={t('localSurfaceHost.homes.primaryDescription')}
            />
            <div className="surface-host-entry-row">
              <HomeLaunchCard
                icon={Images}
                title={t('localSurfaceHost.homes.toolTitle')}
                description={t('localSurfaceHost.homes.toolDescription')}
                to={hrefWithSearch(ROUTES.toolHome, query)}
                action={t('localSurfaceHost.homes.toolAction')}
                featured
              />
              <HomeLaunchCard
                icon={LayoutDashboard}
                title={t('localSurfaceHost.homes.projectsTitle')}
                description={t('localSurfaceHost.homes.projectsDescription')}
                to={hrefWithSearch(ROUTES.projects, query)}
              />
              <HomeLaunchCard
                icon={Scissors}
                title={t('localSurfaceHost.homes.edit.title')}
                description={t('localSurfaceHost.homes.edit.description')}
                to={hrefWithSearch(ROUTES.editing, query)}
              />
              <HomeLaunchCard
                icon={Clapperboard}
                title={t('localSurfaceHost.homes.canvas.title')}
                description={t('localSurfaceHost.homes.canvas.description')}
                to={hrefWithSearch(ROUTES.canvases, query)}
              />
            </div>
          </section>
        </div>
      </section>
    </LocalSurfaceAppChrome>
  )
}

export function LocalSurfaceToolHome({ query }: { query: URLSearchParams }) {
  const { t } = useTranslation()
  const projectState = useLocalSurfaceProjects(query)
  const routeGroups = toolHomeGroups(query, t)

  return (
    <LocalSurfaceToolFrame query={query}>
      <section className="surface-host-home surface-host-tool-home">
        <header className="surface-host-mode-header surface-host-mode-header--tool">
          <div className="surface-host-mode-header__title">
            <span className="surface-host-mode-header__icon"><Images size={17} /></span>
            <span>
              <h1>{t('localSurfaceHost.toolHome.title')}</h1>
              <p>{t('localSurfaceHost.toolHome.description')}</p>
            </span>
          </div>
          <div className="surface-host-mode-header__actions">
            <Link className="surface-host-secondary-action" to={hrefWithSearch(ROUTES.jobs, query)}>
              {t('localSurfaceHost.homes.jobs.title')}
            </Link>
          </div>
        </header>

        <section className="surface-host-app-section surface-host-tool-index">
          <SectionHeading
            icon={Sparkles}
            title={t('localSurfaceHost.toolHome.featuredTitle')}
            description={t('localSurfaceHost.toolHome.featuredDescription')}
          />
          <div className="surface-host-tool-groups">
            <RouteCatalog groups={routeGroups} />
          </div>
        </section>

        <div className="surface-host-tool-lower">
          <section className="surface-host-app-section">
            <SectionHeading icon={FolderOpen} title={t('localSurfaceHost.toolHome.recentWork')} />
            <div className="surface-host-recent-list">
              {(projectState.highlightedProject ? [projectState.highlightedProject, ...projectState.recentProjects.slice(0, 2)] : projectState.recentProjects.slice(0, 3)).map((project, index) => (
                <RecentProjectRow
                  key={recentProjectKey(project)}
                  project={project}
                  href={projectHomeHrefForProject(project, query)}
                  label={index === 0 ? t('localSurfaceHost.toolHome.continue') : undefined}
                  locale={projectState.locale}
                  highlighted={index === 0}
                />
              ))}
              {!projectState.projectsQuery.isLoading && projectState.projects.length === 0 ? (
                <div className="surface-host-recent-empty">
                  <FolderArchive size={16} />
                  <span>{t('localSurfaceHost.recent.empty')}</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="surface-host-app-section">
            <SectionHeading icon={MonitorCog} title={t('localSurfaceHost.toolHome.utilities')} />
            <HomeLaunchCard
              icon={MonitorCog}
              title={t('localSurfaceHost.homes.system.title')}
              description={t('localSurfaceHost.homes.system.description')}
              to={adminSurfacePath('overview')}
              external
            />
          </section>
        </div>
      </section>
    </LocalSurfaceToolFrame>
  )
}

function RouteCatalog({ groups }: { groups: ToolHomeGroup[] }) {
  return (
    <>
      {groups.map((group) => {
        const GroupIcon = group.icon
        return (
          <div className="surface-host-tool-group" key={group.title}>
            <div className="surface-host-tool-group__header">
              <GroupIcon size={15} />
              <span>{group.title}</span>
            </div>
            <div className="surface-host-tool-grid">
              {group.entries.map((entry) => (
                <HomeLaunchCard
                  key={entry.to}
                  icon={entry.icon}
                  title={entry.title}
                  description={entry.description}
                  to={entry.to}
                  external={entry.external}
                  action={entry.action}
                  featured={entry.featured}
                />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

export function LocalSurfaceToolFrame({
  query,
  children,
  title,
  description,
}: {
  query: URLSearchParams
  children: ReactNode
  title?: string
  description?: string
}) {
  const { t } = useTranslation()
  const groups = toolHomeGroups(query, t)
  return (
    <LocalSurfaceAppChrome
      title={title ?? t('localSurfaceHost.toolHome.title')}
      description={description ?? t('localSurfaceHost.toolHome.description')}
      query={query}
    >
      <div className="surface-host-tool-shell">
        <AppSidebarShell className="surface-host-tool-sidebar" width={232} aria-label={t('localSurfaceHost.toolHome.navigation')}>
          <AppSidebarHeader className="surface-host-tool-sidebar__header">
            <span className="surface-host-tool-sidebar__icon"><Images size={16} /></span>
            <span>
              <strong>{t('localSurfaceHost.toolHome.title')}</strong>
              <small>{t('localSurfaceHost.toolHome.sidebarDescription')}</small>
            </span>
          </AppSidebarHeader>
          <AppSidebarNav className="surface-host-tool-sidebar__nav">
            {groups.map((group) => {
              const GroupIcon = group.icon
              return (
                <AppSidebarSection
                  className="surface-host-tool-sidebar__group"
                  key={group.title}
                  title={<><GroupIcon size={13} /> <span>{group.title}</span></>}
                >
                  {group.entries.map((entry) => (
                    <ToolSidebarEntry key={entry.to} entry={entry} />
                  ))}
                </AppSidebarSection>
              )
            })}
          </AppSidebarNav>
        </AppSidebarShell>
        <div className="surface-host-tool-shell__content">
          {children}
        </div>
      </div>
    </LocalSurfaceAppChrome>
  )
}

function ToolSidebarEntry({ entry }: { entry: ToolHomeEntry }) {
  const EntryIcon = entry.icon
  const content = (
    <AppSidebarNavItemFrame>
      <AppSidebarNavItemContent icon={EntryIcon} label={entry.title} />
    </AppSidebarNavItemFrame>
  )
  if (entry.external) {
    return <a className="surface-host-tool-sidebar__entry" href={entry.to}>{content}</a>
  }
  return (
    <NavLink className="surface-host-tool-sidebar__entry" to={entry.to}>
      {({ isActive }) => (
        <AppSidebarNavItemFrame active={isActive}>
          <AppSidebarNavItemContent icon={EntryIcon} label={entry.title} />
        </AppSidebarNavItemFrame>
      )}
    </NavLink>
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

function useLocalSurfaceProjects(query: URLSearchParams) {
  const { i18n } = useTranslation()
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
  return { projectsQuery, projects, highlightedProject, recentProjects, locale }
}

function toolHomeGroups(query: URLSearchParams, t: ReturnType<typeof useTranslation>['t']): ToolHomeGroup[] {
  return [
    {
      icon: Clapperboard,
      title: t('localSurfaceHost.toolHome.groups.shots'),
      entries: [
        {
          icon: Clapperboard,
          title: t('localSurfaceHost.homes.shotLibrary.title'),
          description: t('localSurfaceHost.homes.shotLibrary.description'),
          to: hrefWithSearch(ROUTES.shotLibrary, query),
          action: t('localSurfaceHost.toolHome.continue'),
          featured: true,
        },
        {
          icon: Database,
          title: t('localSurfaceHost.homes.resource.title'),
          description: t('localSurfaceHost.homes.resource.description'),
          to: hrefWithSearch(ROUTES.resources, query),
        },
        {
          icon: ScanSearch,
          title: t('localSurfaceHost.homes.external.title'),
          description: t('localSurfaceHost.homes.external.description'),
          to: hrefWithSearch(ROUTES.externalResources, query),
        },
        {
          icon: Clapperboard,
          title: t('localSurfaceHost.homes.agentResources.title'),
          description: t('localSurfaceHost.homes.agentResources.description'),
          to: hrefWithSearch(ROUTES.agentResources, query),
        },
      ],
    },
    {
      icon: Sparkles,
      title: t('localSurfaceHost.toolHome.groups.generation'),
      entries: [
        {
          icon: History,
          title: t('localSurfaceHost.homes.jobs.title'),
          description: t('localSurfaceHost.homes.jobs.description'),
          to: hrefWithSearch(ROUTES.jobs, query),
          action: t('localSurfaceHost.toolHome.continue'),
          featured: true,
        },
        {
          icon: Sparkles,
          title: t('localSurfaceHost.tools.image.title'),
          description: t('localSurfaceHost.tools.image.description'),
          to: hrefWithSearch(ROUTES.tools.image, query),
        },
        {
          icon: Video,
          title: t('localSurfaceHost.tools.video.title'),
          description: t('localSurfaceHost.tools.video.description'),
          to: hrefWithSearch(ROUTES.tools.video, query),
        },
        {
          icon: FileAudio,
          title: t('localSurfaceHost.tools.audio.title'),
          description: t('localSurfaceHost.tools.audio.description'),
          to: hrefWithSearch(ROUTES.tools.audio, query),
        },
        {
          icon: FileText,
          title: t('localSurfaceHost.tools.text.title'),
          description: t('localSurfaceHost.tools.text.description'),
          to: hrefWithSearch(ROUTES.tools.text, query),
        },
      ],
    },
  ]
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  loading,
}: {
  icon: LucideIcon
  title: string
  description?: string
  loading?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="surface-host-section-heading surface-host-section-heading--app">
      <span className="surface-host-section-heading__icon"><Icon size={15} /></span>
      <span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </span>
      {loading ? (
        <Badge variant="outline">
          <Loader2 size={12} className="surface-host-spin" />
          {t('common.loadingShort')}
        </Badge>
      ) : null}
    </div>
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

function HomeLaunchCard({
  icon: Icon,
  title,
  description,
  to,
  action,
  external,
  featured,
}: {
  icon: LucideIcon
  title: string
  description: string
  to: string
  action?: string
  external?: boolean
  featured?: boolean
}) {
  const content = (
    <>
      <span className="surface-host-mode-entry__icon"><Icon size={17} /></span>
      <span className="surface-host-mode-entry__copy">
        <strong>{title}</strong>
        <small>{description}</small>
        {action ? <em>{action}</em> : null}
      </span>
      <ArrowRight size={14} className="surface-host-mode-entry__arrow" />
    </>
  )
  const className = featured ? 'surface-host-mode-entry surface-host-mode-entry--featured' : 'surface-host-mode-entry'
  if (external) {
    return <a className={className} href={to}>{content}</a>
  }
  return <Link className={className} to={to}>{content}</Link>
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
  const projectUid = query.get('projectUid') ?? query.get('project_uid') ?? undefined
  const now = new Date().toISOString()
  return {
    ID: numericProjectId,
    name: projectName,
    description: projectDir,
    owner_id: 1,
    ...(projectUid ? { project_uid: projectUid } : {}),
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
