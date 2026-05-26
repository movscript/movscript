import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bot, Check, FolderOpen, LayoutDashboard, MessageCircle, Palette, PanelRightClose, PanelRightOpen, Plus, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMovScriptThemeMeta, isMovScriptThemeName, movScriptThemeNames, type MovScriptThemeName } from '@movscript/theme'
import {
  AppTopControlButton,
  AppTopControlsRoot,
  AppTopCreateProjectActionButton,
  AppTopCreateProjectActions,
  AppTopCreateProjectDialogContent,
  AppTopCreateProjectField,
  AppTopCreateProjectForm,
  AppTopCreateProjectInput,
  AppTopCreateProjectLabel,
  AppTopCreateProjectTextarea,
  AppTopLanguageLabel,
  AppTopLanguageSelect,
  AppTopMenuItemText,
  AppTopMenuLabelPrimary,
  AppTopMenuLeadingIcon,
  AppTopMenuSelectedIcon,
  AppTopProjectMenuContent,
  Dialog,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@movscript/ui'

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'
import { api } from '@/shared/infrastructure/api'
import { useTheme } from '@/features/app-shell/application/useTheme'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { canvasRouteSourceFromSearch, getAppRouteSurface, routeForWorkMode, workModeForRoute } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

interface AppTopControlsProps {
  className?: string
  compact?: boolean
}

export function AppTopControls({ className = '', compact = false }: AppTopControlsProps) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
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
  const { theme, selectTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const routeSurface = getAppRouteSurface(pathname)
  const currentRouteWorkMode = routeSurface === 'canvas'
    ? canvasRouteSourceFromSearch(search)
    : workModeForRoute(pathname, workMode)
  const nextMode = currentRouteWorkMode === 'agent' ? 'detail' : 'agent'
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
    navigate(routeForWorkMode(nextMode, !!current), { replace: routeSurface !== 'detail' })
  }

  function openProject(project: Project) {
    setCurrent(project)
    navigate(routeForWorkMode(workMode, true))
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

  const density = compact ? 'compact' : 'default'
  const iconSize = compact ? 11 : 16
  const showAssistantShortcut = routeSurface === 'detail'
  const showAgentContentPanelShortcut = routeSurface === 'agent'
  const AssistantShortcutIcon = conversationCount === 0 ? Plus : MessageCircle
  const assistantShortcutTitle = conversationCount === 0
    ? t('agents.chat.newConversation')
    : agentPanelOpen ? t('agents.chat.collapseAssistant') : t('agents.chat.aiAssistant')
  const AgentContentPanelIcon = agentModeContentPanelCollapsed ? PanelRightOpen : PanelRightClose
  const agentContentPanelTitle = agentModeContentPanelCollapsed
    ? t('agents.chat.expandAgentContentPanel')
    : t('agents.chat.collapseAgentContentPanel')
  const currentThemeLabel = getThemeLabel(theme, t)
  const themeSelectLabel = `${t('header.theme.select')}: ${currentThemeLabel}`

  function handleThemeSelect(nextTheme: string) {
    if (!isMovScriptThemeName(nextTheme)) return
    selectTheme(nextTheme)
  }

  return (
    <AppTopControlsRoot density={density} extraClassName={className}>
      <AppTopControlButton
        variant="outline"
        density={density}
        onClick={switchMode}
        title={nextMode === 'agent' ? t('appSettings.agentWorkMode') : t('appSettings.detailWorkMode')}
        aria-label={nextMode === 'agent' ? t('appSettings.agentWorkMode') : t('appSettings.detailWorkMode')}
      >
        <ModeIcon size={compact ? 11 : 14} />
      </AppTopControlButton>
      {showAssistantShortcut && (
        <AppTopControlButton
          variant="ghost"
          density={density}
          onClick={handleAssistantShortcut}
          active={agentPanelOpen && conversationCount > 0}
          title={assistantShortcutTitle}
          aria-label={assistantShortcutTitle}
        >
          <AssistantShortcutIcon size={iconSize} />
        </AppTopControlButton>
      )}
      {showAgentContentPanelShortcut && (
        <AppTopControlButton
          variant="ghost"
          density={density}
          onClick={toggleAgentModeContentPanelCollapsed}
          active={!agentModeContentPanelCollapsed}
          title={agentContentPanelTitle}
          aria-label={agentContentPanelTitle}
        >
          <AgentContentPanelIcon size={iconSize} />
        </AppTopControlButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <AppTopControlButton
            variant="ghost"
            density={density}
            title={current?.name ?? t('header.titles.projects')}
            aria-label={current?.name ?? t('header.titles.projects')}
          >
            <FolderOpen size={iconSize} />
          </AppTopControlButton>
        </DropdownMenuTrigger>
        <AppTopProjectMenuContent>
          <DropdownMenuLabel>
            <AppTopMenuLabelPrimary>{current?.name ?? t('header.titles.projects')}</AppTopMenuLabelPrimary>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projects.length === 0 ? (
            <DropdownMenuItem disabled>{t('pages.projects.empty')}</DropdownMenuItem>
          ) : projects.map((project) => (
            <DropdownMenuItem key={project.ID} onClick={() => openProject(project)}>
              <AppTopMenuItemText>{project.name}</AppTopMenuItemText>
              {current?.ID === project.ID ? <AppTopMenuSelectedIcon icon={Check} /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate(ROUTES.projects)}>
            <AppTopMenuLeadingIcon icon={FolderOpen} />
            {t('header.titles.projects')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <AppTopMenuLeadingIcon icon={Plus} />
            {t('pages.projects.newProject')}
          </DropdownMenuItem>
        </AppTopProjectMenuContent>
      </DropdownMenu>
      <AppTopLanguageLabel htmlFor={compact ? 'language-select-compact' : 'language-select'}>{t('header.language')}</AppTopLanguageLabel>
      <AppTopLanguageSelect
        id={compact ? 'language-select-compact' : 'language-select'}
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value as SupportedLanguage)}
        density={density}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>{language}</option>
        ))}
      </AppTopLanguageSelect>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <AppTopControlButton
            variant="ghost"
            density={density}
            title={themeSelectLabel}
            aria-label={themeSelectLabel}
          >
            <Palette size={iconSize} />
          </AppTopControlButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="app-top-theme-menu">
          <DropdownMenuLabel>
            <AppTopMenuLabelPrimary>{t('header.theme.select')}</AppTopMenuLabelPrimary>
            <AppTopMenuLabelSecondary>{currentThemeLabel}</AppTopMenuLabelSecondary>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeSelect}>
            {movScriptThemeNames.map((themeName) => (
              <DropdownMenuRadioItem key={themeName} value={themeName}>
                <AppTopMenuItemText>{getThemeLabel(themeName, t)}</AppTopMenuItemText>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AppTopControlButton
        variant="ghost"
        density={density}
        onClick={() => navigate(ROUTES.appSettings)}
        title={t('appSettings.title')}
        aria-label={t('appSettings.title')}
      >
        <Settings size={iconSize} />
      </AppTopControlButton>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <AppTopCreateProjectDialogContent>
          <DialogHeader>
            <DialogTitle>{t('pages.projects.newProject')}</DialogTitle>
          </DialogHeader>
          <AppTopCreateProjectForm>
            <AppTopCreateProjectField>
              <AppTopCreateProjectLabel htmlFor="top-project-name">{t('pages.projects.nameRequired')}</AppTopCreateProjectLabel>
              <AppTopCreateProjectInput
                id="top-project-name"
                autoFocus
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submitProject()
                }}
                placeholder={t('pages.projects.namePlaceholder')}
              />
            </AppTopCreateProjectField>
            <AppTopCreateProjectField>
              <AppTopCreateProjectLabel htmlFor="top-project-description">{t('pages.projects.descriptionOptional')}</AppTopCreateProjectLabel>
              <AppTopCreateProjectTextarea
                id="top-project-description"
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
                rows={3}
                placeholder={t('pages.projects.descriptionPlaceholder')}
              />
            </AppTopCreateProjectField>
            <AppTopCreateProjectActions>
              <AppTopCreateProjectActionButton type="button" variant="ghost" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</AppTopCreateProjectActionButton>
              <AppTopCreateProjectActionButton type="button" onClick={submitProject} disabled={!projectName.trim() || createProject.isPending}>
                <Plus size={14} />
                {t('pages.projects.createProject')}
              </AppTopCreateProjectActionButton>
            </AppTopCreateProjectActions>
          </AppTopCreateProjectForm>
        </AppTopCreateProjectDialogContent>
      </Dialog>
    </AppTopControlsRoot>
  )
}

function getThemeLabel(themeName: MovScriptThemeName, t: ReturnType<typeof useTranslation>['t']) {
  return t(`header.theme.options.${themeName}`, {
    defaultValue: getMovScriptThemeMeta(themeName).label,
  })
}
