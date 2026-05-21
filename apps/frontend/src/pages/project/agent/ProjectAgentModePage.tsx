import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  PanelTopOpen,
  Plug,
  Plus,
  Settings,
  UserRound,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@movscript/ui'
import { useTranslation } from 'react-i18next'

import { AgentBuiltinChatShell } from '@/components/agent/AgentBuiltinChatShell'
import { conversationDisplayTitle, formatAgentDate } from '@/components/agent/AgentConversationList'
import { api } from '@/lib/api'
import { localAgentClient, type AgentThreadSummary } from '@/lib/localAgentClient'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentStore, type Conversation } from '@/store/agentStore'
import { useAgentSessionStore } from '@/store/agentSessionStore'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { Project } from '@/types'

const DEFAULT_VISIBLE_PROJECT_GROUPS = 5
const DEFAULT_VISIBLE_CHAT_CONVERSATIONS = 5
const AGENT_SIDEBAR_WIDTH_STORAGE_KEY = 'movscript-agent-mode-sidebar-width'
const AGENT_SIDEBAR_DEFAULT_WIDTH = 288
const AGENT_SIDEBAR_MIN_WIDTH = 220
const AGENT_SIDEBAR_MAX_WIDTH = 420
const AGENT_CONTENT_PANEL_WIDTH_STORAGE_KEY = 'movscript-agent-mode-content-panel-width'
const AGENT_CONTENT_PANEL_DEFAULT_WIDTH = 360
const AGENT_CONTENT_PANEL_MIN_WIDTH = 280
const AGENT_CONTENT_PANEL_MAX_WIDTH = 720

function clampAgentSidebarWidth(width: number) {
  return Math.min(AGENT_SIDEBAR_MAX_WIDTH, Math.max(AGENT_SIDEBAR_MIN_WIDTH, width))
}

function clampAgentContentPanelWidth(width: number) {
  return Math.min(AGENT_CONTENT_PANEL_MAX_WIDTH, Math.max(AGENT_CONTENT_PANEL_MIN_WIDTH, width))
}

export default function ProjectAgentModePage({
  fullscreen = false,
  embeddedInShell = false,
}: {
  fullscreen?: boolean
  embeddedInShell?: boolean
}) {
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''

  return (
    <div className="project-agent-mode flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {fullscreen && !embeddedInShell && (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ProjectAgentModeSidebar />
          <ProjectAgentModeWorkspace userId={userId} className="p-2.5" />
        </div>
      )}
      {(!fullscreen || embeddedInShell) && (
        <ProjectAgentModeWorkspace userId={userId} className="p-0" />
      )}
    </div>
  )
}

export function ProjectAgentModeSidebar() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const project = useProjectStore((s) => s.current)
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const getConversations = useAgentStore((s) => s.getConversations)
  const getActiveConversationId = useAgentStore((s) => s.getActiveConversationId)
  const createConversation = useAgentStore((s) => s.createConversation)
  const setActiveConversation = useAgentStore((s) => s.setActiveConversation)
  const pageTasks = useAgentSessionStore((s) => s.pageTasks)
  const localThreadIdsByConversation = useAgentSessionStore((s) => s.localThreadIdsByConversation)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [showAllProjectGroups, setShowAllProjectGroups] = useState(false)
  const [openProjectGroups, setOpenProjectGroups] = useState<Record<number, boolean>>({})
  const [conversationsOpen, setConversationsOpen] = useState(true)
  const [showAllChatConversations, setShowAllChatConversations] = useState(false)
  const resizeStart = useRef({ x: 0, width: AGENT_SIDEBAR_DEFAULT_WIDTH })
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === 'undefined') return AGENT_SIDEBAR_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentSidebarWidth(saved) : AGENT_SIDEBAR_DEFAULT_WIDTH
  })
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeStart.current.x
      setSidebarWidth(clampAgentSidebarWidth(resizeStart.current.width + delta))
    }
    const handlePointerUp = () => setResizing(false)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizing])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStart.current = { x: event.clientX, width: sidebarWidth }
    setResizing(true)
  }

  const adjustSidebarWidth = (delta: number) => {
    setSidebarWidth((width) => clampAgentSidebarWidth(width + delta))
  }

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const { data: localThreads = [] } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL, 'agent-mode-sidebar'],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads().then((r) => r.threads)
    },
    retry: false,
  })

  const conversations = getConversations(userId)
  const activeConversationId = getActiveConversationId(userId)
  const localThreadsById = useMemo(() => new Map(localThreads.map((thread) => [thread.id, thread])), [localThreads])
  const projectNamesById = useMemo(() => {
    const names = new Map<number, string>()
    for (const item of projects) names.set(item.ID, item.name)
    if (project) names.set(project.ID, project.name)
    return names
  }, [project, projects])
  const conversationsByScope = useMemo(() => {
    const projectGroupsById = new Map<number, { projectId: number; projectName: string; conversations: Conversation[] }>()
    const chatConversations: Conversation[] = []
    for (const conversation of conversations) {
      const projectId = conversationProjectId(conversation, {
        localThreadsById,
        localThreadIdsByConversation,
        pageTasks,
      })
      if (projectId === undefined) {
        chatConversations.push(conversation)
        continue
      }
      const group = projectGroupsById.get(projectId) ?? {
        projectId,
        projectName: projectNamesById.get(projectId) ?? `${t('agents.chat.agentModeSidebar.currentProjectFallback')} #${projectId}`,
        conversations: [],
      }
      group.conversations.push(conversation)
      projectGroupsById.set(projectId, group)
    }
    const projectGroups = Array.from(projectGroupsById.values())
      .map((group) => ({
        ...group,
        conversations: group.conversations.sort((a, b) => b.updatedAt - a.updatedAt),
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName, i18n.resolvedLanguage))
    return { projectGroups, chatConversations }
  }, [conversations, i18n.resolvedLanguage, localThreadsById, localThreadIdsByConversation, pageTasks, projectNamesById, t])
  const { projectGroups, chatConversations } = conversationsByScope
  const visibleProjectGroups = showAllProjectGroups ? projectGroups : projectGroups.slice(0, DEFAULT_VISIBLE_PROJECT_GROUPS)
  const hiddenProjectGroupCount = Math.max(0, projectGroups.length - visibleProjectGroups.length)
  const projectConversationCount = projectGroups.reduce((sum, group) => sum + group.conversations.length, 0)
  const sortedChatConversations = useMemo(
    () => [...chatConversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [chatConversations],
  )
  const visibleChatConversations = showAllChatConversations
    ? sortedChatConversations
    : sortedChatConversations.slice(0, DEFAULT_VISIBLE_CHAT_CONVERSATIONS)
  const hiddenChatConversationCount = Math.max(0, sortedChatConversations.length - visibleChatConversations.length)
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'

  function startNewConversation() {
    createConversation(userId)
    navigate(ROUTES.project.agent)
  }

  function selectConversation(id: string) {
    setActiveConversation(userId, id)
    navigate(ROUTES.project.agent)
  }

  function toggleProjectGroup(projectId: number) {
    setOpenProjectGroups((state) => ({ ...state, [projectId]: !(state[projectId] ?? false) }))
  }

  return (
    <aside
      className={cn(
        'relative flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar',
        resizing ? '' : 'transition-[width] duration-200',
      )}
      style={{ width: sidebarWidth }}
    >
      <div className="shrink-0 space-y-1 border-b border-sidebar-border p-2">
        <button
          type="button"
          onClick={startNewConversation}
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 type-body-sm font-medium text-foreground transition-colors hover:bg-muted/60"
        >
          <Plus size={14} className="shrink-0" />
          <span className="truncate">{t('agents.chat.agentModeSidebar.newConversation')}</span>
        </button>
        <NavLink
          to={ROUTES.plugins}
          className={({ isActive }) => cn(
            'flex h-9 w-full items-center gap-2 rounded-md px-2 type-body-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
            isActive && 'bg-accent text-accent-foreground',
          )}
        >
          <Plug size={14} className="shrink-0" />
          <span className="truncate">{t('agents.chat.agentModeSidebar.plugins')}</span>
        </NavLink>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <AgentSidebarGroup
          title={t('agents.chat.agentModeSidebar.project')}
          icon={<PanelTopOpen size={13} />}
          trailing={`${projectConversationCount}`}
          open={projectsOpen}
          onOpenChange={setProjectsOpen}
        >
          {projectGroups.length === 0 ? (
            <p className="px-2 py-1.5 type-caption text-muted-foreground">{t('agents.chat.agentModeSidebar.noProjectConversations')}</p>
          ) : (
            <div className="space-y-1">
              {visibleProjectGroups.map((group) => (
                <div key={group.projectId} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleProjectGroup(group.projectId)}
                    className="flex w-full items-center gap-1 rounded-md px-2 py-0.5 text-left type-caption font-medium leading-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    aria-expanded={openProjectGroups[group.projectId] ?? false}
                  >
                    {(openProjectGroups[group.projectId] ?? false)
                      ? <ChevronDown size={12} className="shrink-0" />
                      : <ChevronRight size={12} className="shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{group.projectName}</span>
                    <span className="shrink-0 type-tiny">{group.conversations.length}</span>
                  </button>
                  {(openProjectGroups[group.projectId] ?? false) ? (
                    <div className="ml-3 space-y-0.5 border-l border-border/60 pl-1.5">
                      {group.conversations.map((conversation) => (
                        <AgentSidebarConversation
                          key={conversation.id}
                          conversation={conversation}
                          active={conversation.id === activeConversationId}
                          locale={locale}
                          title={conversationDisplayTitle(conversation, t)}
                          onClick={() => selectConversation(conversation.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              {hiddenProjectGroupCount > 0 || showAllProjectGroups ? (
                <button
                  type="button"
                  onClick={() => setShowAllProjectGroups((value) => !value)}
                  className="flex w-full items-center rounded-md px-2 py-1 text-left type-caption leading-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {showAllProjectGroups
                    ? t('agents.chat.agentModeSidebar.showFewerProjects')
                    : t('agents.chat.agentModeSidebar.showMoreProjects', { count: hiddenProjectGroupCount })}
                </button>
              ) : null}
            </div>
          )}
        </AgentSidebarGroup>

        <AgentSidebarGroup
          title={t('agents.chat.agentModeSidebar.conversations')}
          icon={<MessageSquare size={13} />}
          trailing={chatConversations.length > 0 ? `${chatConversations.length}` : undefined}
          open={conversationsOpen}
          onOpenChange={setConversationsOpen}
        >
          {sortedChatConversations.length === 0 ? (
            <button
              type="button"
              onClick={startNewConversation}
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left type-caption leading-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <Plus size={12} />
              {t('agents.chat.agentModeSidebar.startConversation')}
            </button>
          ) : (
            <div className="ml-3 space-y-0.5 border-l border-border/60 pl-1.5">
              {visibleChatConversations.map((conversation) => (
                <AgentSidebarConversation
                  key={conversation.id}
                  conversation={conversation}
                  active={conversation.id === activeConversationId}
                  locale={locale}
                  title={conversationDisplayTitle(conversation, t)}
                  onClick={() => selectConversation(conversation.id)}
                />
              ))}
              {hiddenChatConversationCount > 0 || showAllChatConversations ? (
                <button
                  type="button"
                  onClick={() => setShowAllChatConversations((value) => !value)}
                  className="flex w-full items-center rounded-md px-2 py-1 text-left type-caption leading-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  {showAllChatConversations
                    ? t('agents.chat.agentModeSidebar.showFewerConversations')
                    : t('agents.chat.agentModeSidebar.showMoreConversations', { count: hiddenChatConversationCount })}
                </button>
              ) : null}
            </div>
          )}
        </AgentSidebarGroup>
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <NavLink
          to={ROUTES.agentSettings}
          className={({ isActive }) => cn(
            'mb-1 flex h-9 w-full items-center gap-2 rounded-md px-2 type-body-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
            isActive && 'bg-accent text-accent-foreground',
          )}
        >
          <Settings size={14} className="shrink-0" />
          <span className="truncate">{t('agents.chat.agentModeSidebar.settings')}</span>
        </NavLink>
        <NavLink
          to={ROUTES.user}
          className={({ isActive }) => cn(
            'flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60',
            isActive && 'bg-accent',
          )}
        >
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarFallback className="bg-muted type-caption font-semibold text-muted-foreground">
              {currentUser?.username[0]?.toUpperCase() ?? <UserRound size={13} />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate type-caption font-medium text-foreground">{currentUser?.username ?? t('agents.chat.agentModeSidebar.defaultUser')}</p>
            <p className="truncate type-tiny text-muted-foreground">{t('agents.chat.agentModeSidebar.settingsUser')}</p>
          </div>
        </NavLink>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左侧栏宽度"
        aria-valuemin={AGENT_SIDEBAR_MIN_WIDTH}
        aria-valuemax={AGENT_SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        className={cn(
          'absolute right-0 top-0 h-full w-2 translate-x-1 cursor-col-resize outline-none',
          'after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors',
          'hover:after:bg-sidebar-border focus-visible:after:bg-ring',
          resizing && 'after:bg-ring',
        )}
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            adjustSidebarWidth(event.shiftKey ? -32 : -12)
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            adjustSidebarWidth(event.shiftKey ? 32 : 12)
          }
        }}
      />
    </aside>
  )
}

function AgentSidebarGroup({
  title,
  icon,
  trailing,
  open,
  onOpenChange,
  children,
}: {
  title: string
  icon: ReactNode
  trailing?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <section className="mb-3">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="mb-1 flex h-7 w-full items-center gap-2 rounded-md px-2 text-left type-caption font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        aria-expanded={open}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {trailing ? <span className="type-tiny font-medium">{trailing}</span> : null}
        {open ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />}
      </button>
      {open ? <div className="space-y-0.5">{children}</div> : null}
    </section>
  )
}

function conversationProjectId(
  conversation: Conversation,
  context: {
    localThreadsById: Map<string, AgentThreadSummary>
    localThreadIdsByConversation: Record<string, string>
    pageTasks: ReturnType<typeof useAgentSessionStore.getState>['pageTasks']
  },
) {
  const taskProjectId = Object.values(context.pageTasks)
    .filter((task) => task.conversationId === conversation.id)
    .map((task) => task.payload.projectId)
    .find((projectId): projectId is number => typeof projectId === 'number')
  if (taskProjectId !== undefined) return taskProjectId

  const threadId = context.localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId
  const threadProjectId = threadId ? context.localThreadsById.get(threadId)?.projectId : undefined
  return typeof threadProjectId === 'number' ? threadProjectId : undefined
}

function AgentSidebarConversation({
  conversation,
  active,
  locale,
  title,
  onClick,
}: {
  conversation: Conversation
  active: boolean
  locale: string
  title: string
  onClick: () => void
}) {
  const lastMessage = conversation.messages[conversation.messages.length - 1]?.content.trim()

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full min-w-0 items-start gap-1.5 rounded-md px-2 py-1 text-left transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
      )}
    >
      <MessageSquare size={11} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate type-caption font-medium leading-4">{title}</span>
        <span className={cn('block truncate type-tiny leading-3.5', active ? 'text-accent-foreground/70' : 'text-muted-foreground')}>
          {lastMessage || formatAgentDate(conversation.updatedAt, locale)}
        </span>
      </span>
    </button>
  )
}

function ProjectAgentChatSurface({ userId, className }: { userId: string; className?: string }) {
  const getActiveConversationId = useAgentStore((s) => s.getActiveConversationId)
  const createConversation = useAgentStore((s) => s.createConversation)
  const activeConversationId = getActiveConversationId(userId)

  useEffect(() => {
    if (activeConversationId) return
    createConversation(userId)
  }, [activeConversationId, createConversation, userId])

  return (
    <section className={cn('min-h-0 flex-1 overflow-hidden bg-background', className)}>
      <div className="h-full min-h-0 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
        <AgentBuiltinChatShell
          userId={userId}
          onCollapse={() => {}}
          showCollapse={false}
          surface="page"
        />
      </div>
    </section>
  )
}

function ProjectAgentModeWorkspace({ userId, className }: { userId: string; className?: string }) {
  return (
    <section className={cn('flex min-h-0 flex-1 overflow-hidden bg-background', className)}>
      <ProjectAgentChatSurface userId={userId} className="min-w-[360px] flex-1 p-0" />
      <ProjectAgentContentPanel />
    </section>
  )
}

function ProjectAgentContentPanel() {
  const resizeStart = useRef({ x: 0, width: AGENT_CONTENT_PANEL_DEFAULT_WIDTH })
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return AGENT_CONTENT_PANEL_DEFAULT_WIDTH
    const saved = Number(window.localStorage.getItem(AGENT_CONTENT_PANEL_WIDTH_STORAGE_KEY))
    return Number.isFinite(saved) ? clampAgentContentPanelWidth(saved) : AGENT_CONTENT_PANEL_DEFAULT_WIDTH
  })
  const [resizing, setResizing] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(AGENT_CONTENT_PANEL_WIDTH_STORAGE_KEY, String(panelWidth))
  }, [panelWidth])

  useEffect(() => {
    if (!resizing) return

    const handlePointerMove = (event: PointerEvent) => {
      const delta = resizeStart.current.x - event.clientX
      setPanelWidth(clampAgentContentPanelWidth(resizeStart.current.width + delta))
    }
    const handlePointerUp = () => setResizing(false)
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [resizing])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    resizeStart.current = { x: event.clientX, width: panelWidth }
    setResizing(true)
  }

  const adjustPanelWidth = (delta: number) => {
    setPanelWidth((width) => clampAgentContentPanelWidth(width + delta))
  }

  return (
    <aside
      className={cn(
        'relative hidden h-full shrink-0 overflow-hidden border-l border-border bg-background lg:block',
        resizing ? '' : 'transition-[width] duration-200',
      )}
      style={{ width: panelWidth }}
      aria-label="Agent 内容区"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整内容区宽度"
        aria-valuemin={AGENT_CONTENT_PANEL_MIN_WIDTH}
        aria-valuemax={AGENT_CONTENT_PANEL_MAX_WIDTH}
        aria-valuenow={panelWidth}
        tabIndex={0}
        className={cn(
          'absolute left-0 top-0 z-10 h-full w-2 -translate-x-1 cursor-col-resize outline-none',
          'after:absolute after:left-1/2 after:top-0 after:h-full after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors',
          'hover:after:bg-border focus-visible:after:bg-ring',
          resizing && 'after:bg-ring',
        )}
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            adjustPanelWidth(event.shiftKey ? 32 : 12)
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            adjustPanelWidth(event.shiftKey ? -32 : -12)
          }
        }}
      />
    </aside>
  )
}
