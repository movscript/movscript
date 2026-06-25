import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  AudioLines,
  CirclePlay,
  Database,
  FileAudio,
  FolderArchive,
  Home,
  Images,
  Languages,
  ListTodo,
  MessageCircle,
  Mic,
  Music,
  Move,
  Palette,
  ScanSearch,
  Shapes,
  Video,
  Volume2,
  Wand2,
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
import { ROUTES } from '@/routes/projectRoutes'
import { useUserStore } from '@/shared/infrastructure/session/userStore'

export const SIDEBAR_WIDTH_STORAGE_KEY = APP_SIDEBAR_WIDTH_STORAGE_KEY
export const SIDEBAR_DEFAULT_WIDTH = APP_SIDEBAR_DEFAULT_WIDTH
export const SIDEBAR_MIN_WIDTH = APP_SIDEBAR_MIN_WIDTH
export const SIDEBAR_MAX_WIDTH = APP_SIDEBAR_MAX_WIDTH

export function clampSidebarWidth(width: number) {
  return clampAppSidebarWidth(width)
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed = false,
  indent = false,
  end = false,
}: {
  to: string
  icon: LucideIcon
  label: string
  collapsed?: boolean
  indent?: boolean
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
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
  const currentUser = useUserStore((s) => s.currentUser)
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
  return (
    <AppSidebarShell collapsed={collapsed} width={width}>
      {(reserveHeader || headerActions) ? (
        <AppSidebarHeader className="app-sidebar__header--actions">
          {headerActions}
        </AppSidebarHeader>
      ) : null}
      <AppSidebarNav collapsed={collapsed}>
        <AppSidebarSection title={t('sidebar.sections.tools')} collapsed={collapsed}>
          <NavItem to={ROUTES.tools.refImageGen} icon={Images} label={t('sidebar.items.refImageGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.refVideoGen} icon={CirclePlay} label={t('sidebar.items.refVideoGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.audioGen} icon={AudioLines} label={t('sidebar.items.audioGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.audioChat} icon={MessageCircle} label={t('sidebar.items.audioChat')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.audioTranscribe} icon={FileAudio} label={t('sidebar.items.audioTranscribe')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.audioTranslate} icon={Languages} label={t('sidebar.items.audioTranslate')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.musicGen} icon={Music} label={t('sidebar.items.musicGen')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.audioSfx} icon={Volume2} label={t('sidebar.items.audioSfx')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.voiceClone} icon={Mic} label={t('sidebar.items.voiceClone')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.voiceDesign} icon={Wand2} label={t('sidebar.items.voiceDesign')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.motionImitation} icon={Move} label={t('sidebar.items.motionImitation')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.styleTransfer} icon={Palette} label={t('sidebar.items.styleTransfer')} collapsed={collapsed} />
          <NavItem to={ROUTES.tools.multiAngle} icon={Shapes} label={t('sidebar.items.multiAngle')} collapsed={collapsed} />
        </AppSidebarSection>

        <AppSidebarDivider collapsed={collapsed} />

        <AppSidebarSection title={t('sidebar.sections.files')} collapsed={collapsed}>
          <NavItem to={ROUTES.resources} icon={FolderArchive} label={t('sidebar.items.resources')} collapsed={collapsed} end />
          <NavItem to={ROUTES.projectData} icon={Database} label={t('sidebar.items.projectData')} collapsed={collapsed} />
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
    </AppSidebarShell>
  )
}
