import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bot, Check, FolderOpen, LayoutDashboard, MessageCircle, Moon, PanelRightClose, PanelRightOpen, Plus, Settings, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Textarea,
} from '@movscript/ui'

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import { api } from '@/lib/api'
import { useTheme } from '@/hooks/useTheme'
import { projectListQueryKey } from '@/lib/projectQueries'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentPanelUiStore } from '@/store/agentPanelUiStore'
import { useAgentStore } from '@/store/agentStore'
import { useAppSettingsStore } from '@/store/appSettingsStore'
import { useProjectStore } from '@/store/projectStore'
import { useUserStore } from '@/store/userStore'
import type { Project } from '@/types'

interface AppTopControlsProps {
  className?: string
  compact?: boolean
}

export function AppTopControls({ className = '', compact = false }: AppTopControlsProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const currentUser = useUserStore((s) => s.currentUser)
  const userId = currentUser ? String(currentUser.ID) : ''
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const agentPanelOpen = useAgentPanelUiStore((s) => s.open)
  const setAgentPanelOpen = useAgentPanelUiStore((s) => s.setOpen)
  const agentModeContentPanelCollapsed = useAgentPanelUiStore((s) => s.agentModeContentPanelCollapsed)
  const toggleAgentModeContentPanelCollapsed = useAgentPanelUiStore((s) => s.toggleAgentModeContentPanelCollapsed)
  const conversationCount = useAgentStore((s) => s.convsByUser[userId]?.conversations.length ?? 0)
  const createConversation = useAgentStore((s) => s.createConversation)
  const { theme, toggleTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const nextMode = workMode === 'agent' ? 'detail' : 'agent'
  const ModeIcon = nextMode === 'agent' ? Bot : LayoutDashboard
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const createProject = useMutation({
    mutationFn: (input: { name: string; description: string }) => api.post('/projects', input).then((response) => response.data as Project),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectListQueryKey(currentOrgID) })
      openProject(project)
      setProjectName('')
      setProjectDescription('')
      setCreateOpen(false)
    },
  })

  function switchMode() {
    setWorkMode(nextMode)
    if (nextMode === 'agent') {
      navigate(current ? ROUTES.project.agent : ROUTES.projects)
      return
    }
    if (pathname === ROUTES.project.agent) navigate(ROUTES.project.overview)
  }

  function openProject(project: Project) {
    setCurrent(project)
    navigate(workMode === 'agent' ? ROUTES.project.agent : ROUTES.project.overview)
  }

  function submitProject() {
    const name = projectName.trim()
    if (!name || createProject.isPending) return
    createProject.mutate({ name, description: projectDescription.trim() })
  }

  function handleAssistantShortcut() {
    if (conversationCount === 0) {
      createConversation(userId)
      setAgentPanelOpen(true)
      return
    }
    setAgentPanelOpen(!agentPanelOpen)
  }

  const controlSizeClass = compact ? 'h-5 w-5' : 'h-8 w-8'
  const selectClass = compact
    ? 'h-5 rounded-md border border-border bg-background px-1 type-min text-muted-foreground hover:text-foreground'
    : 'h-8 rounded-md border border-border bg-background px-2 type-label text-muted-foreground hover:text-foreground'
  const iconSize = compact ? 11 : 16
  const iconClassName = compact ? 'h-3 w-3' : undefined
  const showAssistantShortcut = workMode === 'detail'
  const showAgentContentPanelShortcut = workMode === 'agent'
  const AssistantShortcutIcon = conversationCount === 0 ? Plus : MessageCircle
  const assistantShortcutTitle = conversationCount === 0
    ? t('agents.chat.newConversation')
    : agentPanelOpen ? t('agents.chat.collapseAssistant') : t('agents.chat.aiAssistant')
  const AgentContentPanelIcon = agentModeContentPanelCollapsed ? PanelRightOpen : PanelRightClose
  const agentContentPanelTitle = agentModeContentPanelCollapsed
    ? t('agents.chat.expandAgentContentPanel')
    : t('agents.chat.collapseAgentContentPanel')

  return (
    <div className={`flex min-w-0 shrink-0 items-center ${compact ? 'gap-1' : 'gap-2'} ${className}`}>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={switchMode}
        className={controlSizeClass}
        title={nextMode === 'agent' ? t('appSettings.agentWorkMode') : t('appSettings.detailWorkMode')}
        aria-label={nextMode === 'agent' ? t('appSettings.agentWorkMode') : t('appSettings.detailWorkMode')}
      >
        <ModeIcon size={compact ? 11 : 14} className={iconClassName} />
      </Button>
      {showAssistantShortcut && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleAssistantShortcut}
          className={`${controlSizeClass} text-muted-foreground hover:text-foreground ${agentPanelOpen && conversationCount > 0 ? 'bg-muted text-foreground' : ''}`}
          title={assistantShortcutTitle}
          aria-label={assistantShortcutTitle}
        >
          <AssistantShortcutIcon size={iconSize} className={iconClassName} />
        </Button>
      )}
      {showAgentContentPanelShortcut && (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleAgentModeContentPanelCollapsed}
          className={`${controlSizeClass} text-muted-foreground hover:text-foreground ${!agentModeContentPanelCollapsed ? 'bg-muted text-foreground' : ''}`}
          title={agentContentPanelTitle}
          aria-label={agentContentPanelTitle}
        >
          <AgentContentPanelIcon size={iconSize} className={iconClassName} />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={`${controlSizeClass} text-muted-foreground hover:text-foreground`}
            title={current?.name ?? t('header.titles.projects')}
            aria-label={current?.name ?? t('header.titles.projects')}
          >
            <FolderOpen size={iconSize} className={iconClassName} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <span className="block truncate type-label font-medium">{current?.name ?? t('header.titles.projects')}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.length === 0 ? (
            <DropdownMenuItem disabled>{t('pages.projects.empty')}</DropdownMenuItem>
          ) : projects.map((project) => (
            <DropdownMenuItem key={project.ID} onClick={() => openProject(project)}>
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {current?.ID === project.ID ? <Check size={14} className="ml-2 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate(ROUTES.projects)}>
            <FolderOpen size={14} className="mr-2" />
            {t('header.titles.projects')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-2" />
            {t('pages.projects.newProject')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <label className="sr-only" htmlFor={compact ? 'language-select-compact' : 'language-select'}>{t('header.language')}</label>
      <select
        id={compact ? 'language-select-compact' : 'language-select'}
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value as SupportedLanguage)}
        className={selectClass}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>{language}</option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className={`${controlSizeClass} text-muted-foreground hover:text-foreground`}
        title={theme === 'dark' ? t('header.theme.light') : t('header.theme.dark')}
        aria-label={theme === 'dark' ? t('header.theme.light') : t('header.theme.dark')}
      >
        {theme === 'dark' ? <Sun size={iconSize} className={iconClassName} /> : <Moon size={iconSize} className={iconClassName} />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => navigate(ROUTES.appSettings)}
        className={`${controlSizeClass} text-muted-foreground hover:text-foreground`}
        title={t('appSettings.title')}
        aria-label={t('appSettings.title')}
      >
        <Settings size={iconSize} className={iconClassName} />
      </Button>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('pages.projects.newProject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="top-project-name">{t('pages.projects.nameRequired')}</Label>
              <Input
                id="top-project-name"
                autoFocus
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitProject()
                }}
                placeholder={t('pages.projects.namePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="top-project-description">{t('pages.projects.descriptionOptional')}</Label>
              <Textarea
                id="top-project-description"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                rows={3}
                placeholder={t('pages.projects.descriptionPlaceholder')}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
              <Button type="button" onClick={submitProject} disabled={!projectName.trim() || createProject.isPending}>
                <Plus size={14} />
                {t('pages.projects.createProject')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
