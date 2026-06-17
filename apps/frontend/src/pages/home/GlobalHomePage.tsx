import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Bot, FolderOpen, LayoutGrid, Loader2, Plus, Scissors, Sparkles, Wrench } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useAppShellDialogStore } from '@/features/app-shell/application/appShellDialogStore'
import { projectKeys } from '@/features/project/application/projectQueries'
import { routeForWorkMode } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { openAgentWindow, openCanvasWindow, openEditingWindow, openProjectWindow } from '@/shared/infrastructure/appWindowContext'
import { api } from '@/shared/infrastructure/api'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useLastWorkspaceStore } from '@/shared/infrastructure/session/lastWorkspaceStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

export default function GlobalHomePage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const lastWorkspace = useLastWorkspaceStore((s) => s.last)
  const openProjectDialog = useAppShellDialogStore((s) => s.openProjectDialog)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'

  const projectsQuery = useQuery<Project[]>({
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })

  const projects = useMemo(() => {
    return [...(projectsQuery.data ?? [])]
      .sort((a, b) => Date.parse(b.UpdatedAt || b.CreatedAt) - Date.parse(a.UpdatedAt || a.CreatedAt))
  }, [projectsQuery.data])
  const lastProject = useMemo(() => {
    if (!lastWorkspace?.projectId) return null
    return projects.find((project) => project.ID === lastWorkspace.projectId)
      ?? lastWorkspace.project
      ?? null
  }, [lastWorkspace, projects])
  const recentProjects = useMemo(() => {
    return projects
      .filter((project) => project.ID !== lastProject?.ID)
      .slice(0, lastProject ? 3 : 4)
  }, [lastProject?.ID, projects])

  function enterAgentMode() {
    setWorkMode('agent')
    void openAgentWindow()
  }

  function enterProject(project: Project) {
    setCurrentProject(project)
    setWorkMode('project')
    void openProjectWindow({ projectId: project.ID, project, route: ROUTES.project.home })
  }

  function enterCanvasMode() {
    setWorkMode('tool')
    void openCanvasWindow()
  }

  function enterEditingMode() {
    setWorkMode('tool')
    void openEditingWindow()
  }

  function enterToolMode() {
    setWorkMode('tool')
    navigate(routeForWorkMode('tool', Boolean(projects[0])))
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-[760px] flex-col gap-4 overflow-y-auto px-5 py-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground shadow-sm">
            <Sparkles size={16} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold leading-6 text-foreground">MovScript</h1>
            <p className="truncate type-caption text-muted-foreground">
              {t('home.launcher.subtitle', { defaultValue: '选择一个工作入口' })}
            </p>
          </div>
        </div>
        {projectsQuery.isFetching ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2 type-caption text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            {t('common.loadingShort')}
          </span>
        ) : null}
      </header>

      <section className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <button
          type="button"
          onClick={enterAgentMode}
          className="group flex min-h-[172px] flex-col justify-between rounded-lg border border-border bg-background p-4 text-left shadow-sm transition hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-foreground">
              <Bot size={20} />
            </span>
            <ArrowRight size={17} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </span>
          <span className="mt-5 block min-w-0">
            <span className="block type-caption font-medium text-muted-foreground">Primary</span>
            <span className="mt-1 block text-[26px] font-semibold leading-8 text-foreground">Agent</span>
            <span className="mt-2 block type-label leading-5 text-muted-foreground">
              {t('home.mode.agent', { defaultValue: '把注意力交给 Agent 的工作流、计划、产物和执行状态。' })}
            </span>
          </span>
        </button>

        <section className="flex min-h-[260px] flex-col rounded-lg border border-border bg-background p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <FolderOpen size={15} className="shrink-0 text-muted-foreground" />
              <h2 className="truncate type-body font-semibold text-foreground">Project</h2>
            </div>
            <button
              type="button"
              onClick={openProjectDialog}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 type-caption font-medium text-foreground transition hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus size={13} />
              {t('pages.projects.newProject', { defaultValue: '新建项目' })}
            </button>
          </div>

          {lastProject ? (
            <button
              type="button"
              className="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-left transition hover:border-primary/45 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => enterProject(lastProject)}
            >
              <span className="min-w-0">
                <span className="block type-caption text-muted-foreground">
                  {t('home.launcher.continueProject', { defaultValue: '继续上次项目' })}
                </span>
                <span className="block truncate type-body font-semibold text-foreground">{lastProject.name}</span>
              </span>
              <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
            </button>
          ) : null}

          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {recentProjects.map((project) => (
              <button
                key={project.ID}
                type="button"
                className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-muted/25 px-3 py-2 text-left transition hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => enterProject(project)}
              >
                <span className="min-w-0">
                  <span className="block truncate type-label font-medium text-foreground">{project.name}</span>
                  <span className="block truncate type-caption text-muted-foreground">
                    {formatProjectTime(project.UpdatedAt || project.CreatedAt, locale)}
                  </span>
                </span>
                <ArrowRight size={13} className="shrink-0 text-muted-foreground" />
              </button>
            ))}
            {!projectsQuery.isLoading && projects.length === 0 ? (
              <button
                type="button"
                onClick={openProjectDialog}
                className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-center type-label text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus size={14} />
                {t('home.emptyProjects', { defaultValue: '还没有项目' })}
              </button>
            ) : null}
          </div>
        </section>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <ModeEntry
          icon={<LayoutGrid size={16} />}
          label="Canvas"
          description={t('home.mode.canvas', { defaultValue: '管理全局画布、素材组织和跨项目的可视化灵感板。' })}
          onClick={enterCanvasMode}
        />
        <ModeEntry
          icon={<Scissors size={16} />}
          label={t('home.mode.editingTitle', { defaultValue: '剪辑' })}
          description={t('home.mode.editing', { defaultValue: '创建独立剪辑项目，组织素材、轨道、字幕和导出任务。' })}
          onClick={enterEditingMode}
        />
        <ModeEntry
          icon={<Wrench size={16} />}
          label="Tool"
          description={t('home.mode.tool', { defaultValue: '进入参考图生成等工具能力，不绑定到某个项目窗口。' })}
          onClick={enterToolMode}
        />
      </section>
    </main>
  )
}

function ModeEntry({
  icon,
  label,
  description,
  onClick,
}: {
  icon: ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[86px] items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-left shadow-sm transition hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block type-body font-semibold text-foreground">{label}</span>
          <span className="mt-1 line-clamp-2 block type-caption leading-4 text-muted-foreground">{description}</span>
        </span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  )
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
