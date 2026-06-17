import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AppWindow,
  AudioLines,
  ChevronRight,
  CirclePlay,
  FolderArchive,
  FolderOpen,
  Home,
  Images,
  ListTodo,
  Move,
  Palette,
  ScanSearch,
  Scissors,
  Shapes,
  Video,
} from 'lucide-react'
import {
  APP_SIDEBAR_DEFAULT_WIDTH,
  APP_SIDEBAR_MAX_WIDTH,
  APP_SIDEBAR_MIN_WIDTH,
  APP_SIDEBAR_WIDTH_STORAGE_KEY,
  AppSidebarDivider,
  AppSidebarFooter,
  AppSidebarHeader,
  AppSidebarMenuLeadingIcon,
  AppSidebarNav,
  AppSidebarNavItemFrame,
  AppSidebarNavItemContent,
  AppSidebarSection,
  AppSidebarShell,
  AppSidebarUserButton,
  AppSidebarUserButtonContent,
  AppSidebarUserMenuContent,
  PanelResizeHandle,
  clampAppSidebarWidth,
  useResizablePanel
} from '@movscript/ui/layout'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@movscript/ui/primitives'
import { useAppShortcutOpenCommands } from '@/features/app-shell/application/appShortcutOpenCommands'
import {
  readRecentEditingProjectShortcuts,
  useAppShortcutRecentItems,
  type EditingProjectShortcut,
} from '@/features/app-shell/application/appShortcutRecentItems'
import { ROUTES } from '@/routes/projectRoutes'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import type { Canvas, Project } from '@/types'

export const SIDEBAR_WIDTH_STORAGE_KEY = APP_SIDEBAR_WIDTH_STORAGE_KEY
export const SIDEBAR_DEFAULT_WIDTH = APP_SIDEBAR_DEFAULT_WIDTH
export const SIDEBAR_MIN_WIDTH = APP_SIDEBAR_MIN_WIDTH
export const SIDEBAR_MAX_WIDTH = APP_SIDEBAR_MAX_WIDTH

export function clampSidebarWidth(width: number) {
  return clampAppSidebarWidth(width)
}

type DesktopShortcutMenuItem = {
  id: string
  label: string
  icon?: LucideIcon
  active?: boolean
  onSelect: () => void
}

type DesktopShortcutMenuState = {
  x: number
  y: number
  title: string
  quickItems: DesktopShortcutMenuItem[]
  recentTitle: string
  recentItems: DesktopShortcutMenuItem[]
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed = false,
  indent = false,
  end = false,
  onContextMenu,
}: {
  to: string
  icon: LucideIcon
  label: string
  collapsed?: boolean
  indent?: boolean
  end?: boolean
  onContextMenu?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      onContextMenu={onContextMenu}
    >
      {({ isActive }) => (
        <AppSidebarNavItemFrame active={isActive} collapsed={collapsed} indent={indent}>
          <AppSidebarNavItemContent icon={Icon} label={label} collapsed={collapsed} />
        </AppSidebarNavItemFrame>
      )}
    </NavLink>
  )
}

interface SidebarProps {
  collapsed?: boolean
  width?: number
  headerActions?: ReactNode
  reserveHeader?: boolean
  onWidthChange?: (width: number) => void
  onHide?: () => void
}

export function Sidebar({
  collapsed = false,
  width = SIDEBAR_DEFAULT_WIDTH,
  headerActions,
  reserveHeader = false,
  onWidthChange,
  onHide,
}: SidebarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const currentUser = useUserStore((s) => s.currentUser)
  const [shortcutMenu, setShortcutMenu] = useState<DesktopShortcutMenuState | null>(null)
  const { recentProjects, recentCanvases } = useAppShortcutRecentItems(5)
  const shortcutCommands = useAppShortcutOpenCommands()
  const sidebarResize = useResizablePanel({
    size: width,
    onSizeChange: (nextWidth) => onWidthChange?.(clampSidebarWidth(nextWidth)),
    minSize: SIDEBAR_MIN_WIDTH,
    maxSize: SIDEBAR_MAX_WIDTH,
    resizeEdge: 'right',
    collapsed,
    onCollapsedChange: (nextCollapsed) => {
      if (nextCollapsed) onHide?.()
    },
    collapseMode: 'after-min',
    ariaLabel: '调整左侧栏宽度',
  })

  useEffect(() => {
    if (!shortcutMenu) return undefined
    const closeMenu = () => setShortcutMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('pointerdown', closeMenu)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('pointerdown', closeMenu)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [shortcutMenu])

  function openShortcutMenu(event: MouseEvent<HTMLAnchorElement>, menu: Omit<DesktopShortcutMenuState, 'x' | 'y'>) {
    event.preventDefault()
    event.stopPropagation()
    setShortcutMenu({
      ...menu,
      ...shortcutMenuPosition(event),
    })
  }

  function closeShortcutMenu() {
    setShortcutMenu(null)
  }

  const quickHomeShortcuts = createQuickHomeShortcuts({
    pathname,
    openAppHomeRoot: shortcutCommands.openAppHome,
    openToolRoot: shortcutCommands.openToolHome,
    openCanvasRoot: shortcutCommands.openCanvasHome,
    openEditingRoot: shortcutCommands.openEditHome,
    t,
  })
  const projectShortcutMenu = createProjectShortcutMenu({
    quickItems: quickHomeShortcuts,
    projects: recentProjects,
    onOpenProject: shortcutCommands.openProject,
    t,
  })
  const canvasShortcutMenu = createCanvasShortcutMenu({
    quickItems: quickHomeShortcuts,
    canvases: recentCanvases,
    onOpenCanvas: shortcutCommands.openCanvas,
    t,
  })
  function createEditingShortcutMenu(projects: EditingProjectShortcut[]) {
    return {
      title: t('sidebar.items.editing', { defaultValue: '剪辑' }),
      quickItems: quickHomeShortcuts,
      recentTitle: t('sidebar.shortcuts.recentEditingProjects', { defaultValue: '最近 5 个 Edit Project' }),
      recentItems: projects.map((project) => ({
        id: `editing:${project.id}`,
        label: project.title,
        icon: Scissors,
        onSelect: () => shortcutCommands.openEditingProject(project),
      })),
    }
  }

  return (
    <AppSidebarShell collapsed={collapsed} width={width}>
      {(reserveHeader || headerActions) ? (
        <AppSidebarHeader className="app-sidebar__header--actions">
          {headerActions}
        </AppSidebarHeader>
      ) : null}
      <AppSidebarNav collapsed={collapsed}>
        <AppSidebarSection title={t('sidebar.sections.tools')} collapsed={collapsed}>
          <NavItem to={ROUTES.projects} icon={FolderOpen} label="Project" collapsed={collapsed} onContextMenu={(event) => openShortcutMenu(event, projectShortcutMenu)} />
          <NavItem to={ROUTES.canvases} icon={AppWindow} label={t('sidebar.items.canvas')} collapsed={collapsed} onContextMenu={(event) => openShortcutMenu(event, canvasShortcutMenu)} />
          <NavItem
            to={ROUTES.editing}
            icon={Scissors}
            label={t('sidebar.items.editing', { defaultValue: '剪辑' })}
            collapsed={collapsed}
            onContextMenu={(event) => {
              const latestEditingProjects = readRecentEditingProjectShortcuts(5)
              openShortcutMenu(event, createEditingShortcutMenu(latestEditingProjects))
            }}
          />
          <NavItem to={ROUTES.tools.refImageGen} icon={Images} label={t('sidebar.items.refImageGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.refVideoGen} icon={CirclePlay} label={t('sidebar.items.refVideoGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.audioGen} icon={AudioLines} label={t('sidebar.items.audioGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.motionImitation} icon={Move} label={t('sidebar.items.motionImitation')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.styleTransfer} icon={Palette} label={t('sidebar.items.styleTransfer')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.multiAngle} icon={Shapes} label={t('sidebar.items.multiAngle')} collapsed={collapsed} />
        </AppSidebarSection>

        <AppSidebarDivider collapsed={collapsed} />

        <AppSidebarSection title={t('sidebar.sections.files')} collapsed={collapsed}>
          <NavItem to={ROUTES.resources} icon={FolderArchive} label={t('sidebar.items.resources')} collapsed={collapsed} end />
          <NavItem to={ROUTES.externalResources} icon={ScanSearch} label={t('sidebar.items.externalResources', { defaultValue: '外部资源' })} collapsed={collapsed} />
          <NavItem to={ROUTES.shotLibrary} icon={Video} label={t('sidebar.items.shotLibrary')} collapsed={collapsed} />
          <NavItem to={ROUTES.jobs} icon={ListTodo} label={t('sidebar.items.jobs')} collapsed={collapsed} />
        </AppSidebarSection>

      </AppSidebarNav>

      {!collapsed && onWidthChange ? (
        <PanelResizeHandle
          {...sidebarResize.resizeHandleProps}
          side="right"
        />
      ) : null}
      {currentUser ? (
        <AppSidebarFooter collapsed={collapsed}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <AppSidebarUserButton
                collapsed={collapsed}
                title={currentUser.username}
                aria-label={currentUser.username}
              >
                <AppSidebarUserButtonContent username={currentUser.username} />
              </AppSidebarUserButton>
            </DropdownMenuTrigger>
            <AppSidebarUserMenuContent collapsed={collapsed} menuWidth={width}>
              <DropdownMenuItem onSelect={() => navigate(ROUTES.user)}>
                <AppSidebarMenuLeadingIcon icon={Home} />
                {t('sidebar.items.profile', { defaultValue: 'Profile' })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                {currentUser.system_role === 'super_admin' ? t('sidebar.roles.superAdmin') : t('sidebar.roles.user')}
              </DropdownMenuItem>
            </AppSidebarUserMenuContent>
          </DropdownMenu>
        </AppSidebarFooter>
      ) : null}
      {shortcutMenu ? (
        <DesktopShortcutMenu menu={shortcutMenu} onClose={closeShortcutMenu} />
      ) : null}
    </AppSidebarShell>
  )
}

function DesktopShortcutMenu({
  menu,
  onClose,
}: {
  menu: DesktopShortcutMenuState
  onClose: () => void
}) {
  return (
    <div
      role="menu"
      aria-label={menu.title}
      className="fixed z-50 w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="px-2 py-1.5 type-caption font-medium text-muted-foreground">{menu.title}</div>
      {menu.quickItems.map((item) => (
        <DesktopShortcutMenuButton key={item.id} item={item} onClose={onClose} />
      ))}
      <div className="my-1 h-px bg-border" />
      <div className="px-2 py-1 type-caption font-medium text-muted-foreground">{menu.recentTitle}</div>
      {menu.recentItems.length === 0 ? (
        <div className="px-2 py-2 type-caption text-muted-foreground">暂无最近项目</div>
      ) : menu.recentItems.map((item) => (
        <DesktopShortcutMenuButton key={item.id} item={item} onClose={onClose} />
      ))}
    </div>
  )
}

function DesktopShortcutMenuButton({
  item,
  onClose,
}: {
  item: DesktopShortcutMenuItem
  onClose: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      role="menuitem"
      className="flex h-9 w-full items-center gap-2 rounded px-2 text-left transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        onClose()
        item.onSelect()
      }}
    >
      {Icon ? <Icon size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />}
      <span className="min-w-0 flex-1 truncate type-label font-medium text-foreground">
        {item.label}
      </span>
      {item.active ? (
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 type-caption font-medium text-primary">已打开</span>
      ) : null}
    </button>
  )
}

type ShortcutTranslate = (key: string, options?: { defaultValue?: string }) => string

function createQuickHomeShortcuts({
  pathname,
  openAppHomeRoot,
  openToolRoot,
  openCanvasRoot,
  openEditingRoot,
  t,
}: {
  pathname: string
  openAppHomeRoot: () => void
  openToolRoot: () => void
  openCanvasRoot: () => void
  openEditingRoot: () => void
  t: ShortcutTranslate
}): DesktopShortcutMenuItem[] {
  return [
    {
      id: 'app-home',
      label: t('sidebar.shortcuts.appHome', { defaultValue: 'App Home' }),
      icon: Home,
      active: pathname === ROUTES.root,
      onSelect: openAppHomeRoot,
    },
    {
      id: 'tool-home',
      label: t('sidebar.shortcuts.toolHome', { defaultValue: 'Tool Home' }),
      icon: Images,
      active: pathname.startsWith('/tools'),
      onSelect: openToolRoot,
    },
    {
      id: 'edit-home',
      label: t('sidebar.shortcuts.editHome', { defaultValue: 'Edit Home' }),
      icon: Scissors,
      active: pathname === ROUTES.editing || pathname.startsWith('/editing/'),
      onSelect: openEditingRoot,
    },
    {
      id: 'canvas-home',
      label: t('sidebar.shortcuts.canvasHome', { defaultValue: 'Canvas Home' }),
      icon: AppWindow,
      active: pathname === ROUTES.canvases || pathname.startsWith('/canvases/'),
      onSelect: openCanvasRoot,
    },
  ]
}

function createProjectShortcutMenu({
  quickItems,
  projects,
  onOpenProject,
  t,
}: {
  quickItems: DesktopShortcutMenuItem[]
  projects: Project[]
  onOpenProject: (project: Project) => void
  t: ShortcutTranslate
}): Omit<DesktopShortcutMenuState, 'x' | 'y'> {
  return {
    title: 'Project',
    quickItems,
    recentTitle: t('sidebar.shortcuts.recentProjects', { defaultValue: '最近 5 个 Project' }),
    recentItems: projects.map((project) => ({
      id: `project:${project.ID}`,
      label: project.name,
      icon: FolderOpen,
      onSelect: () => onOpenProject(project),
    })),
  }
}

function createCanvasShortcutMenu({
  quickItems,
  canvases,
  onOpenCanvas,
  t,
}: {
  quickItems: DesktopShortcutMenuItem[]
  canvases: Canvas[]
  onOpenCanvas: (canvas: Canvas) => void
  t: ShortcutTranslate
}): Omit<DesktopShortcutMenuState, 'x' | 'y'> {
  return {
    title: 'Canvas',
    quickItems,
    recentTitle: t('sidebar.shortcuts.recentCanvases', { defaultValue: '最近 5 个 Canvas' }),
    recentItems: canvases.map((canvas) => ({
      id: `canvas:${canvas.ID}`,
      label: canvas.name,
      icon: AppWindow,
      onSelect: () => onOpenCanvas(canvas),
    })),
  }
}

function shortcutMenuPosition(event: MouseEvent<HTMLElement>) {
  const width = 288
  const height = 340
  const inset = 8
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight
  return {
    x: Math.max(inset, Math.min(event.clientX, viewportWidth - width - inset)),
    y: Math.max(inset, Math.min(event.clientY, viewportHeight - height - inset)),
  }
}
