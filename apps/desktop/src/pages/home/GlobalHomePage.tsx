import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Bot, Database, Download, FolderOpen, LayoutGrid, Loader2, Plus, Scissors, Sparkles, Wrench, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { useAppShellDialogStore } from '@/features/app-shell/application/appShellDialogStore'
import { useAgentAvailabilityGuard } from '@/features/agent/application/useAgentAvailabilityGuard'
import { projectKeys } from '@movscript/project-surface/data'
import { ROUTES } from '@/routes/projectRoutes'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { desktopEmbeddedAgentEnabled } from '@/shared/application/desktopEmbeddedAgentFeature'
import { openAgentWindow, openCanvasWindow, openEditingWindow, openProjectDataWindow, openProjectWindow, openToolWindow } from '@/shared/infrastructure/appWindowContext'
import { api } from '@/shared/infrastructure/api'
import { dismissRecentProject, isLocalProjectEntry, mergeRecentProjects, recentProjectKey, useLocalProjectRecentsStore } from '@/shared/infrastructure/session/localProjectRecentsStore'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useLastWorkspaceStore } from '@/shared/infrastructure/session/lastWorkspaceStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

export default function GlobalHomePage() {
  const { t, i18n } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const lastWorkspace = useLastWorkspaceStore((s) => s.last)
  const clearLastWorkspace = useLastWorkspaceStore((s) => s.clear)
  const localRecentProjects = useLocalProjectRecentsStore((s) => s.projects)
  const dismissedProjectKeys = useLocalProjectRecentsStore((s) => s.dismissedKeys)
  const openProjectDialog = useAppShellDialogStore((s) => s.openProjectDialog)
  const embeddedAgentEnabled = desktopEmbeddedAgentEnabled()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const [codexPluginInstalling, setCodexPluginInstalling] = useState(false)
  const [codexPluginError, setCodexPluginError] = useState<string | null>(null)

  const projectsQuery = useQuery<Project[]>({
    queryKey: projectKeys.list(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })

  const projects = useMemo(() => {
    return mergeRecentProjects(projectsQuery.data ?? [], localRecentProjects, dismissedProjectKeys)
  }, [dismissedProjectKeys, localRecentProjects, projectsQuery.data])
  const lastProject = useMemo(() => {
    if (!lastWorkspace?.projectId) return null
    const project = projects.find((candidate) => candidate.ID === lastWorkspace.projectId)
      ?? lastWorkspace.project
      ?? null
    const key = project ? recentProjectKey(project) : undefined
    return key && dismissedProjectKeys.includes(key) ? null : project
  }, [dismissedProjectKeys, lastWorkspace, projects])
  const recentProjects = useMemo(() => {
    return projects
      .filter((project) => project.ID !== lastProject?.ID)
      .slice(0, lastProject ? 3 : 4)
  }, [lastProject?.ID, projects])

  async function installMovScriptIntoCodex() {
    const electronApi = readElectronApi()
    if (!electronApi?.installMovScriptCodexPlugin) {
      setCodexPluginError(t('home.codexPlugin.installUnavailable', { defaultValue: '当前环境不支持自动安装 Codex 插件。' }))
      return
    }
    setCodexPluginInstalling(true)
    setCodexPluginError(null)
    try {
      await electronApi.installMovScriptCodexPlugin()
    } catch (error) {
      setCodexPluginError(error instanceof Error ? error.message : String(error))
    } finally {
      setCodexPluginInstalling(false)
    }
  }

  async function enterProject(project: Project) {
    let projectDir = project.workspace_path || project.project_path
    if (!projectDir) return
    let projectToOpen = project
    if (isLocalProjectEntry(project)) {
      const result = await readElectronApi()?.openLocalMovScriptProject?.({ projectDir }).catch(() => undefined)
      if (result?.project) {
        projectDir = result.projectDir
        projectToOpen = result.project as Project
      }
    }
    setCurrentProject(projectToOpen)
    setWorkMode('project')
    void openProjectWindow({ projectDir, project: projectToOpen, route: ROUTES.project.home })
  }

  function removeProjectFromRecent(project: Project) {
    dismissRecentProject(project)
    const removedKey = recentProjectKey(project)
    const lastKey = lastWorkspace?.project ? recentProjectKey(lastWorkspace.project) : undefined
    if (removedKey && removedKey === lastKey) clearLastWorkspace()
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
    void openToolWindow({ route: ROUTES.tools.refImageGen })
  }

  function enterProjectData() {
    void openProjectDataWindow()
  }

  return (
    <>
    <main className="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-4 overflow-y-auto px-5 py-5">
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

      <section className="grid gap-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="flex min-h-[300px] flex-col gap-3">
          {embeddedAgentEnabled ? <AgentLauncherCard setWorkMode={setWorkMode} /> : null}

          <button
            type="button"
            onClick={() => void installMovScriptIntoCodex()}
            disabled={codexPluginInstalling}
            className="group flex min-h-[92px] items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-left shadow-sm transition hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-75"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-foreground">
                {codexPluginInstalling ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </span>
              <span className="min-w-0">
                <span className="block type-body font-semibold text-foreground">
                  {t('home.codexPlugin.title', { defaultValue: '安装到 Codex' })}
                </span>
                <span className="mt-1 line-clamp-2 block type-caption leading-4 text-muted-foreground">
                  {codexPluginInstalling
                    ? t('home.codexPlugin.installing', { defaultValue: '正在安装 MovScript Codex 插件...' })
                    : t('home.codexPlugin.description', { defaultValue: '让 Codex 线程直接使用 MovScript 插件能力。' })}
                </span>
                {codexPluginError ? (
                  <span className="mt-1 line-clamp-1 block type-caption text-destructive">{codexPluginError}</span>
                ) : null}
              </span>
            </span>
            <ArrowRight size={14} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>
        </section>

        <section className="flex min-h-[300px] flex-col rounded-lg border border-border bg-background p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <FolderOpen size={15} className="shrink-0 text-muted-foreground" />
              <h2 className="truncate type-body font-semibold text-foreground">Project</h2>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => openProjectDialog('open')}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 type-caption font-medium text-foreground transition hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FolderOpen size={13} />
                打开
              </button>
              <button
                type="button"
                onClick={() => openProjectDialog('create')}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 type-caption font-medium text-foreground transition hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus size={13} />
                新建
              </button>
            </div>
          </div>

          {lastProject ? (
            <div className="mt-3 flex min-h-12 w-full items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-2 py-2 transition hover:border-primary/45 hover:bg-primary/10">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => void enterProject(lastProject)}
              >
                <span className="min-w-0">
                  <span className="block type-caption text-muted-foreground">
                    {t('home.launcher.continueProject', { defaultValue: '继续上次项目' })}
                  </span>
                  <span className="block truncate type-body font-semibold text-foreground">{lastProject.name}</span>
                </span>
                <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
              </button>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t('common.remove', { defaultValue: '移除' })}
                onClick={() => removeProjectFromRecent(lastProject)}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}

          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {recentProjects.map((project) => (
              <div
                key={project.ID}
                className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/25 px-2 py-2 transition hover:border-foreground/25 hover:bg-accent"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void enterProject(project)}
                >
                  <span className="min-w-0">
                    <span className="block truncate type-label font-medium text-foreground">{project.name}</span>
                    <span className="block truncate type-caption text-muted-foreground">
                      {formatProjectTime(project.UpdatedAt || project.CreatedAt, locale)}
                    </span>
                  </span>
                  <ArrowRight size={13} className="shrink-0 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('common.remove', { defaultValue: '移除' })}
                  onClick={() => removeProjectFromRecent(project)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {!projectsQuery.isLoading && projects.length === 0 ? (
              <button
                type="button"
                onClick={() => openProjectDialog('create')}
                className="flex min-h-24 items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-center type-label text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus size={14} />
                {t('home.emptyProjects', { defaultValue: '还没有项目' })}
              </button>
            ) : null}
          </div>
        </section>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ModeEntry
          icon={<Database size={16} />}
          label={t('sidebar.items.projectData')}
          description={t('home.mode.projectData')}
          onClick={enterProjectData}
        />
        <ModeEntry
          icon={<LayoutGrid size={16} />}
          label={t('sidebar.items.canvas')}
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
          label={t('home.mode.toolTitle', { defaultValue: 'Tool' })}
          description={t('home.mode.tool', { defaultValue: '进入参考图生成等工具能力，不绑定到某个项目窗口。' })}
          onClick={enterToolMode}
        />
      </section>
    </main>
    </>
  )
}

function AgentLauncherCard({
  setWorkMode,
}: {
  setWorkMode: (mode: 'agent' | 'project' | 'tool') => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const agentAvailability = useAgentAvailabilityGuard()

  function enterAgentMode() {
    agentAvailability.runOrPrompt(() => {
      setWorkMode('agent')
      void openAgentWindow()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={enterAgentMode}
        disabled={!agentAvailability.hasEnabledAgent}
        className="group flex min-h-[150px] flex-1 flex-col justify-between rounded-lg border border-border bg-background p-4 text-left shadow-sm transition hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/30 disabled:text-muted-foreground disabled:opacity-70 disabled:hover:bg-muted/30"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted text-foreground">
            <Bot size={20} />
          </span>
          {agentAvailability.checking ? (
            <Loader2 size={17} className="shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ArrowRight size={17} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
          )}
        </span>
        <span className="mt-5 block min-w-0">
          <span className="block type-caption font-medium text-muted-foreground">
            {agentAvailability.hasEnabledAgent
              ? 'Primary'
              : agentAvailability.checking
                ? t('home.agent.checking', { defaultValue: '检查 Agent 状态' })
                : t('home.agent.setupRequired', { defaultValue: '需要先设置 Agent' })}
          </span>
          <span className="mt-1 block text-[26px] font-semibold leading-8 text-foreground">Agent</span>
          <span className="mt-2 block type-label leading-5 text-muted-foreground">
            {agentAvailability.hasEnabledAgent
              ? t('home.mode.agent', { defaultValue: '把注意力交给 Agent 的工作流、计划、产物和执行状态。' })
              : t('home.agent.disabledHint', { defaultValue: '请先安装并启用至少一个 Agent runtime，然后再进入 Agent 工作区。' })}
          </span>
        </span>
      </button>

      {!agentAvailability.hasEnabledAgent && !agentAvailability.checking ? (
        <button
          type="button"
          onClick={() => navigate(ROUTES.agentConsole)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 type-label font-medium text-foreground shadow-sm transition hover:border-foreground/25 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bot size={14} />
          {t('agents.availability.goToAgentConsole', { defaultValue: 'Go to Agent Console' })}
        </button>
      ) : null}

      {agentAvailability.dialog}
    </>
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
