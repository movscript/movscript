import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Camera,
  Clapperboard,
  Film,
  FolderOpen,
  Loader2,
  Megaphone,
  Music2,
  PanelsTopLeft,
  Plus,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { useAppShellDialogStore } from '@/features/app-shell/application/appShellDialogStore'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { api } from '@/shared/infrastructure/api'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { routeForWorkMode } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import type { Project } from '@/types'

type InspirationKey = 'shortDrama' | 'ad' | 'mv' | 'storyboard' | 'shotReference'

interface InspirationOption {
  key: InspirationKey
  icon: LucideIcon
}

const inspirationOptions: InspirationOption[] = [
  { key: 'shortDrama', icon: Clapperboard },
  { key: 'ad', icon: Megaphone },
  { key: 'mv', icon: Music2 },
  { key: 'storyboard', icon: PanelsTopLeft },
  { key: 'shotReference', icon: Camera },
]

export default function GlobalHomePage() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const setCurrentProject = useProjectStore((s) => s.setCurrent)
  const createRuntimeConversation = useAgentSessionStore((s) => s.createRuntimeConversation)
  const updateConversationDraft = useAgentSessionStore((s) => s.updateConversationDraft)
  const updateConversationTitle = useAgentSessionStore((s) => s.updateConversationTitle)
  const setLocalThreadId = useAgentSessionStore((s) => s.setLocalThreadId)
  const setConversationSessionId = useAgentSessionStore((s) => s.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((s) => s.setConversationRuntime)
  const openProjectDialog = useAppShellDialogStore((s) => s.openProjectDialog)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'

  const projectsQuery = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })

  const recentProjects = useMemo(() => {
    return [...(projectsQuery.data ?? [])]
      .sort((a, b) => Date.parse(b.UpdatedAt || b.CreatedAt) - Date.parse(a.UpdatedAt || a.CreatedAt))
      .slice(0, 3)
  }, [projectsQuery.data])

  function startInAgent(option: InspirationOption) {
    setWorkMode('agent')
    void (async () => {
      const label = String(t(`home.inspiration.${option.key}`))
      try {
        await localAgentClient.ensureRunning()
        const thread = await localAgentClient.startProvisionalConversation({ title: label })
        const createdAt = Date.parse(thread.createdAt)
        const updatedAt = Date.parse(thread.updatedAt)
        const conversationId = createRuntimeConversation(userId, {
          threadId: thread.id,
          ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
          title: localThreadTitle(thread, t),
          createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
          updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
        })
        setLocalThreadId(conversationId, thread.id)
        if (thread.sessionId) setConversationSessionId(conversationId, thread.sessionId)
        setConversationRuntime(conversationId, {
          ...(thread.sessionId ? { sessionId: thread.sessionId } : {}),
          threadId: thread.id,
          loading: false,
          building: false,
          error: undefined,
        })
        updateConversationTitle(userId, conversationId, label)
        updateConversationDraft(userId, conversationId, {
          input: String(t(`home.inspirationPrompts.${option.key}`)),
        })
        navigate(ROUTES.project.agent)
      } catch (error) {
        console.error('[agent] failed to start provisional conversation', error)
      }
    })()
  }

  function openProject(project: Project) {
    setCurrentProject(project)
    navigate(routeForWorkMode(workMode, true))
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 md:px-8">
      <section className="flex flex-col gap-5">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground">
            <Sparkles size={16} />
          </span>
          <span className="type-label">{t('home.label')}</span>
        </div>
        <div className="space-y-4">
          <h1 className="max-w-2xl text-3xl font-semibold leading-tight text-foreground md:text-4xl">
            {t('home.title')}
          </h1>
          <div className="flex flex-wrap gap-2">
            {inspirationOptions.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.key}
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-4 type-label font-medium text-foreground shadow-sm transition hover:border-foreground/30 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => startInAgent(option)}
                >
                  <Icon size={15} />
                  {t(`home.inspiration.${option.key}`)}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <section className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex h-12 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2 type-label font-semibold text-foreground">
              <FolderOpen size={15} />
              {t('home.recentProjects')}
            </div>
            {projectsQuery.isFetching ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="divide-y divide-border">
            {recentProjects.map((project) => (
              <button
                key={project.ID}
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => openProject(project)}
              >
                <span className="min-w-0">
                  <span className="block truncate type-body font-medium text-foreground">{project.name}</span>
                  <span className="block truncate type-caption text-muted-foreground">
                    {formatProjectTime(project.UpdatedAt || project.CreatedAt, locale)}
                  </span>
                </span>
                <ArrowRight size={15} className="shrink-0 text-muted-foreground" />
              </button>
            ))}
            {!projectsQuery.isLoading && recentProjects.length === 0 ? (
              <div className="px-4 py-5 type-body text-muted-foreground">{t('home.emptyProjects')}</div>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex h-12 items-center gap-2 border-b border-border px-4 type-label font-semibold text-foreground">
            <Film size={15} />
            {t('home.new')}
          </div>
          <button
            type="button"
            className="flex min-h-16 w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={openProjectDialog}
          >
            <span className="flex items-center gap-2 type-body font-medium text-foreground">
              <Plus size={16} />
              {t('home.newProject')}
            </span>
            <ArrowRight size={15} className="shrink-0 text-muted-foreground" />
          </button>
        </section>
      </div>
    </main>
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
