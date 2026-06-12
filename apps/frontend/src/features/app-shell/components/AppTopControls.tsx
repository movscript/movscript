import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  Check,
  FolderOpen,
  Languages,
  LayoutDashboard,
  MessageSquare,
  Palette,
  Plus,
  Settings,
} from 'lucide-react'
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
  AppTopMenuLabelSecondary,
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
import { useTheme } from '@/features/app-shell/application/useTheme'
import { canvasRouteSourceFromSearch, getAppRouteLayoutSpec, routeForWorkMode, workModeForRoute } from '@/routes/appRouteModel'
import { useAgentPanelUiStore } from '@/features/agent/presentation/agentPanelUiStore'
import { projectListQueryKey } from '@/features/project/application/projectQueries'
import { api } from '@/shared/infrastructure/api'
import { ROUTES } from '@/routes/projectRoutes'
import { useAppShellDialogStore } from '@/features/app-shell/application/appShellDialogStore'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { runtimeAppTopControls } from '@runtime'
import type { Project } from '@/types'

interface AppTopControlsProps {
  className?: string
  compact?: boolean
  showProjectSelector?: boolean
  showAssistantShortcut?: boolean
  showAgentContentPanelShortcut?: boolean
}

export function AppTopControls({
  className = '',
  compact = false,
  showProjectSelector = true,
  showAssistantShortcut: showAssistantShortcutProp = true,
  showAgentContentPanelShortcut: _showAgentContentPanelShortcutProp = true,
}: AppTopControlsProps) {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const queryClient = useQueryClient()
  const current = useProjectStore((s) => s.current)
  const setCurrent = useProjectStore((s) => s.setCurrent)
  const currentOrgID = useUserStore((s) => s.currentOrgID)
  const workMode = useAppSettingsStore((s) => s.settings.workMode)
  const setWorkMode = useAppSettingsStore((s) => s.setWorkMode)
  const openProjectDialog = useAppShellDialogStore((s) => s.openProjectDialog)
  const agentPanelOpen = useAgentPanelUiStore((s) => s.open)
  const toggleAgentPanelOpen = useAgentPanelUiStore((s) => s.toggleOpen)
  const { theme, selectTheme } = useTheme()
  const { t, i18n } = useTranslation()
  const [createOpen, setCreateOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const routeLayout = getAppRouteLayoutSpec(pathname)
  const routeSurface = routeLayout.surface
  const currentRouteWorkMode = routeSurface === 'canvas'
    ? canvasRouteSourceFromSearch(search)
    : workModeForRoute(pathname, workMode)
  const nextMode = currentRouteWorkMode === 'agent' ? 'detail' : 'agent'
  const ModeIcon = nextMode === 'agent' ? Bot : LayoutDashboard
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: projectListQueryKey(currentOrgID),
    queryFn: () => api.get('/projects').then((response) => response.data),
    enabled: showProjectSelector && projectMenuOpen,
  })
  const createProject = useMutation({
    mutationFn: (input: { name: string; description: string }) => api.post('/projects', input).then((response) => response.data as Project),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectListQueryKey(currentOrgID) })
      selectProject(project)
      setProjectName('')
      setProjectDescription('')
      setCreateOpen(false)
    },
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
    if (runtimeAppTopControls.projectMenuVariant === 'enterprise') {
      setCreateOpen(true)
      return
    }
    openProjectDialog()
  }

  function submitProject() {
    const name = projectName.trim()
    if (!name || createProject.isPending) return
    createProject.mutate({ name, description: projectDescription.trim() })
  }

  const density = compact ? 'compact' : 'default'
  const iconSize = compact ? 11 : 16
  const modeButtonVariant = runtimeAppTopControls.modeButtonVariant ?? 'ghost'
  const projectMenuVariant = runtimeAppTopControls.projectMenuVariant ?? 'community'
  const languageControl = runtimeAppTopControls.languageControl ?? 'select'
  const settingsAction = runtimeAppTopControls.settingsAction ?? 'accountDialog'
  const showAssistantShortcut = routeSurface === 'detail' && showAssistantShortcutProp
  const AssistantShortcutIcon = MessageSquare
  const assistantShortcutTitle = agentPanelOpen
    ? t('agents.chat.collapseAssistant')
    : t('agents.chat.aiAssistant')
  const currentLanguageLabel = i18n.language
  const currentThemeLabel = getThemeLabel(theme, t)

  function handleLanguageSelect(language: string) {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) return
    i18n.changeLanguage(language as SupportedLanguage)
    setLanguageMenuOpen(false)
  }

  function handleThemeSelect(nextTheme: string) {
    if (!isMovScriptThemeName(nextTheme)) return
    selectTheme(nextTheme)
    setThemeMenuOpen(false)
  }

  return (
    <AppTopControlsRoot density={density} extraClassName={className}>
      <AppTopControlButton
        variant={modeButtonVariant}
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
          onClick={toggleAgentPanelOpen}
          active={agentPanelOpen}
          title={assistantShortcutTitle}
          aria-label={assistantShortcutTitle}
        >
          <AssistantShortcutIcon size={iconSize} />
        </AppTopControlButton>
      )}
      {showProjectSelector ? (
        <DropdownMenu open={projectMenuOpen} onOpenChange={(open) => {
          setProjectMenuOpen(open)
          if (open) {
            setLanguageMenuOpen(false)
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
          {projectMenuVariant === 'enterprise' ? (
            <EnterpriseProjectMenuContent
              current={current}
              projects={projects}
              projectsLoading={projectsLoading}
              onProjectSelect={selectProject}
              onManageProjects={() => navigate(ROUTES.projects)}
              onCreateProject={startCreateProject}
              t={t}
            />
          ) : (
            <CommunityProjectMenuContent
              current={current}
              projects={projects}
              projectsLoading={projectsLoading}
              onProjectSelect={selectProject}
              onClearProject={clearProject}
              onCreateProject={startCreateProject}
              t={t}
            />
          )}
        </DropdownMenu>
      ) : null}
      {languageControl === 'menu' ? (
        <DropdownMenu open={languageMenuOpen} onOpenChange={(open) => {
          setLanguageMenuOpen(open)
          if (open) {
            setProjectMenuOpen(false)
            setThemeMenuOpen(false)
          }
        }}>
          <DropdownMenuTrigger asChild>
            <AppTopControlButton
              type="button"
              variant="ghost"
              density={density}
              title={`${t('header.language')}: ${currentLanguageLabel}`}
              aria-label={`${t('header.language')}: ${currentLanguageLabel}`}
            >
              <Languages size={iconSize} />
            </AppTopControlButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="app-top-selection-menu">
            <DropdownMenuLabel>
              <div className="ms-dropdown__label">
                <AppTopMenuLabelPrimary>{t('header.language')}</AppTopMenuLabelPrimary>
                <AppTopMenuLabelSecondary>{currentLanguageLabel}</AppTopMenuLabelSecondary>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={i18n.language} onValueChange={handleLanguageSelect}>
              {SUPPORTED_LANGUAGES.map((language) => (
                <DropdownMenuRadioItem key={language} value={language}>
                  <AppTopMenuItemText>{language}</AppTopMenuItemText>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <>
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
        </>
      )}
      <DropdownMenu open={themeMenuOpen} onOpenChange={(open) => {
        setThemeMenuOpen(open)
        if (open) {
          setProjectMenuOpen(false)
          setLanguageMenuOpen(false)
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
        onClick={() => {
          if (settingsAction === 'appSettingsRoute' || settingsAction === 'accountDialog') {
            navigate(ROUTES.appSettings)
            return
          }
        }}
        title={t('appSettings.title')}
        aria-label={t('appSettings.title')}
      >
        <Settings size={iconSize} />
      </AppTopControlButton>
      {projectMenuVariant === 'enterprise' ? (
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
      ) : null}
    </AppTopControlsRoot>
  )
}

type AppTopControlsT = ReturnType<typeof useTranslation>['t']

interface ProjectMenuContentProps {
  current: Project | null
  projects: Project[]
  projectsLoading: boolean
  onProjectSelect: (project: Project) => void
  onCreateProject: () => void
  t: AppTopControlsT
}

function CommunityProjectMenuContent({
  current,
  projects,
  projectsLoading,
  onProjectSelect,
  onClearProject,
  onCreateProject,
  t,
}: ProjectMenuContentProps & { onClearProject: () => void }) {
  return (
    <AppTopProjectMenuContent>
      <DropdownMenuLabel>
        <div className="ms-dropdown__label">
          <AppTopMenuLabelPrimary>{t('header.titles.projects')}</AppTopMenuLabelPrimary>
          <AppTopMenuLabelSecondary>{current?.name ?? t('common.noProject', { defaultValue: 'No project' })}</AppTopMenuLabelSecondary>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onClearProject}>
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
        <DropdownMenuItem key={project.ID} onSelect={() => onProjectSelect(project)}>
          <AppTopMenuItemText>{project.name}</AppTopMenuItemText>
          {current?.ID === project.ID ? <AppTopMenuSelectedIcon icon={Check} /> : null}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onCreateProject}>
        <AppTopMenuItemText>{t('pages.projects.newProject')}</AppTopMenuItemText>
        <Plus size={14} className="app-top-menu-item__selected-icon" />
      </DropdownMenuItem>
    </AppTopProjectMenuContent>
  )
}

function EnterpriseProjectMenuContent({
  current,
  projects,
  projectsLoading,
  onProjectSelect,
  onManageProjects,
  onCreateProject,
  t,
}: ProjectMenuContentProps & { onManageProjects: () => void }) {
  return (
    <AppTopProjectMenuContent>
      <DropdownMenuLabel>
        <div className="ms-dropdown__label">
          <AppTopMenuLabelPrimary>{current?.name ?? t('header.titles.projects')}</AppTopMenuLabelPrimary>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {projectsLoading ? (
        <DropdownMenuItem disabled>
          <AppTopMenuItemText>{t('common.loadingShort')}</AppTopMenuItemText>
        </DropdownMenuItem>
      ) : projects.length === 0 ? (
        <DropdownMenuItem disabled>
          <AppTopMenuItemText>{t('pages.projects.empty')}</AppTopMenuItemText>
        </DropdownMenuItem>
      ) : projects.map((project) => (
        <DropdownMenuItem key={project.ID} onSelect={() => onProjectSelect(project)}>
          <AppTopMenuItemText>{project.name}</AppTopMenuItemText>
          {current?.ID === project.ID ? <AppTopMenuSelectedIcon icon={Check} /> : null}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onManageProjects}>
        <AppTopMenuLeadingIcon icon={FolderOpen} />
        <AppTopMenuItemText>{t('header.titles.projects')}</AppTopMenuItemText>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onCreateProject}>
        <AppTopMenuLeadingIcon icon={Plus} />
        <AppTopMenuItemText>{t('pages.projects.newProject')}</AppTopMenuItemText>
      </DropdownMenuItem>
    </AppTopProjectMenuContent>
  )
}

function getThemeLabel(themeName: MovScriptThemeName, t: ReturnType<typeof useTranslation>['t']) {
  return t(`header.theme.options.${themeName}`, {
    defaultValue: getMovScriptThemeMeta(themeName).label,
  })
}
