import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bot,
  Check,
  FolderOpen,
  LayoutDashboard,
  MessageCircle,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getMovScriptThemeMeta, isMovScriptThemeName, movScriptThemeNames, type MovScriptThemeName } from '@movscript/theme'
import {
  AppTopControlButton,
  AppTopControlsRoot,
  AppTopLanguageLabel,
  AppTopLanguageSelect,
  AppTopProjectMenuContent,
  AppTopMenuItemText,
  AppTopMenuLabelPrimary,
  AppTopMenuLabelSecondary,
  AppTopMenuSelectedIcon,
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
import { useTheme } from '@/features/app-shell/application/useTheme'
import { canvasRouteSourceFromSearch, getAppRouteSurface, routeForWorkMode, workModeForRoute } from '@/routes/appRouteModel'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { useAgentStore } from '@/features/agent/state/agentStore'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { api } from '@/shared/infrastructure/api'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useAppShellDialogStore } from '@/features/app-shell/application/appShellDialogStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Project } from '@/types'

interface AppTopControlsProps {
  className?: string
  compact?: boolean
  showAssistantShortcut?: boolean
  showAgentContentPanelShortcut?: boolean
}

export function AppTopControls({
  className = '',
  compact = false,
  showAssistantShortcut: showAssistantShortcutProp = true,
  showAgentContentPanelShortcut: showAgentContentPanelShortcutProp = true,
}: AppTopControlsProps) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const userId = currentUser ? String(currentUser.ID) : ''
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const openAccountSettings = useAppShellDialogStore((s) => s.openAccountSettings)
  const openProjectDialog = useAppShellDialogStore((s) => s.openProjectDialog)
  const agentPanelOpen = useAgentPanelUiStore((s) => s.open)
  const setAgentPanelOpen = useAgentPanelUiStore((s) => s.setOpen)
  const agentModeContentPanelCollapsed = useAgentPanelUiStore((s) => s.agentModeContentPanelCollapsed)
  const toggleAgentModeContentPanelCollapsed = useAgentPanelUiStore((s) => s.toggleAgentModeContentPanelCollapsed)
  const conversationCount = useAgentStore((s) => s.convsByUser[userId]?.conversations.length ?? 0)
  const createConversation = useAgentStore((s) => s.createConversation)
  const { theme, selectTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const routeSurface = getAppRouteSurface(pathname)
  const currentRouteWorkMode = routeSurface === 'canvas'
    ? canvasRouteSourceFromSearch(search)
    : workModeForRoute(pathname, workMode)
  const nextMode = currentRouteWorkMode === 'agent' ? 'detail' : 'agent'
  const ModeIcon = nextMode === 'agent' ? Bot : LayoutDashboard
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
    enabled: projectMenuOpen,
  })

  function switchMode() {
    setWorkMode(nextMode)
    navigate(routeForWorkMode(nextMode, !!current), { replace: routeSurface !== 'detail' })
  }

  function selectProject(project: Project) {
    setCurrent(project)
    setProjectMenuOpen(false)
    navigate(routeForWorkMode(currentRouteWorkMode, true))
  }

  function clearProject() {
    setCurrent(null)
    setProjectMenuOpen(false)
    navigate(routeForWorkMode(currentRouteWorkMode, false))
  }

  function startCreateProject() {
    setProjectMenuOpen(false)
    openProjectDialog()
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
  const showAssistantShortcut = routeSurface === 'detail' && showAssistantShortcutProp
  const showAgentContentPanelShortcut = routeSurface === 'agent' && showAgentContentPanelShortcutProp
  const AssistantShortcutIcon = conversationCount === 0 ? Plus : MessageCircle
  const assistantShortcutTitle = conversationCount === 0
    ? t('agents.chat.newConversation')
    : agentPanelOpen ? t('agents.chat.collapseAssistant') : t('agents.chat.aiAssistant')
  const AgentContentPanelIcon = agentModeContentPanelCollapsed ? PanelRightOpen : PanelRightClose
  const agentContentPanelTitle = agentModeContentPanelCollapsed
    ? t('agents.chat.expandAgentContentPanel')
    : t('agents.chat.collapseAgentContentPanel')
  const currentLanguageLabel = i18n.language
  const currentThemeLabel = getThemeLabel(theme, t)

  function handleLanguageSelect(language: string) {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) return
    i18n.changeLanguage(language as SupportedLanguage)
  }

  function handleThemeSelect(nextTheme: string) {
    if (!isMovScriptThemeName(nextTheme)) return
    selectTheme(nextTheme)
    setThemeMenuOpen(false)
  }

  return (
    <AppTopControlsRoot density={density} extraClassName={className}>
      <AppTopControlButton
        variant="ghost"
        density={density}
        className="app-top-control-button--mode-switch"
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
      <DropdownMenu open={projectMenuOpen} onOpenChange={(open) => {
        setProjectMenuOpen(open)
        if (open) {
          setThemeMenuOpen(false)
        }
      }}>
        <DropdownMenuTrigger asChild>
          <AppTopControlButton
            type="button"
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
            <div className="ms-dropdown__label">
              <AppTopMenuLabelPrimary>{t('header.titles.projects')}</AppTopMenuLabelPrimary>
              <AppTopMenuLabelSecondary>{current?.name ?? t('common.noProject', { defaultValue: 'No project' })}</AppTopMenuLabelSecondary>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={clearProject}>
            <AppTopMenuItemText>{t('common.noProject', { defaultValue: 'No project' })}</AppTopMenuItemText>
            {!current ? <AppTopMenuSelectedIcon icon={Check} /> : null}
          </DropdownMenuItem>
          {projectsLoading ? (
            <DropdownMenuItem disabled>
              <AppTopMenuItemText>{t('common.loadingShort')}</AppTopMenuItemText>
            </DropdownMenuItem>
          ) : projects.length === 0 ? (
            <DropdownMenuItem disabled>
              <AppTopMenuItemText>{t('pages.projects.empty')}</AppTopMenuItemText>
            </DropdownMenuItem>
          ) : projects.map((project) => (
            <DropdownMenuItem key={project.ID} onSelect={() => selectProject(project)}>
                <AppTopMenuItemText>{project.name}</AppTopMenuItemText>
                {current?.ID === project.ID ? <AppTopMenuSelectedIcon icon={Check} /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={startCreateProject}>
            <AppTopMenuItemText>{t('pages.projects.newProject')}</AppTopMenuItemText>
            <Plus size={14} className="app-top-menu-item__selected-icon" />
          </DropdownMenuItem>
        </AppTopProjectMenuContent>
      </DropdownMenu>
      <AppTopLanguageLabel htmlFor="app-top-language-select">{t('header.language')}</AppTopLanguageLabel>
      <AppTopLanguageSelect
        id="app-top-language-select"
        density={density}
        value={i18n.language}
        onChange={(event) => handleLanguageSelect(event.target.value)}
        title={`${t('header.language')}: ${currentLanguageLabel}`}
        aria-label={`${t('header.language')}: ${currentLanguageLabel}`}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language}>{language}</option>
        ))}
      </AppTopLanguageSelect>
      <DropdownMenu open={themeMenuOpen} onOpenChange={(open) => {
        setThemeMenuOpen(open)
        if (open) {
          setProjectMenuOpen(false)
        }
      }}>
        <DropdownMenuTrigger asChild>
          <AppTopControlButton
            type="button"
            variant="ghost"
            density={density}
            title={`${t('header.theme.select')}: ${currentThemeLabel}`}
            aria-label={`${t('header.theme.select')}: ${currentThemeLabel}`}
          >
            <Palette size={iconSize} />
          </AppTopControlButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="app-top-selection-menu">
          <DropdownMenuLabel>
            <div className="ms-dropdown__label">
              <AppTopMenuLabelPrimary>{t('header.theme.select')}</AppTopMenuLabelPrimary>
              <AppTopMenuLabelSecondary>{currentThemeLabel}</AppTopMenuLabelSecondary>
            </div>
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
        onClick={() => openAccountSettings('settings')}
        title={t('appSettings.title')}
        aria-label={t('appSettings.title')}
      >
        <Settings size={iconSize} />
      </AppTopControlButton>
    </AppTopControlsRoot>
  )
}

function getThemeLabel(themeName: MovScriptThemeName, t: ReturnType<typeof useTranslation>['t']) {
  return t(`header.theme.options.${themeName}`, {
    defaultValue: getMovScriptThemeMeta(themeName).label,
  })
}
