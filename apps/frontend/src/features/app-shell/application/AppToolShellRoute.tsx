import React from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Home, PanelLeftClose, PanelLeftOpen, Terminal } from 'lucide-react'
import { WorkspaceShell, useResizablePanel, AppRouteViewport } from '@movscript/ui/layout'
import { AppWindowIconButton } from '@movscript/ui/business/app'
import { Header } from '@/features/app-shell/components/Header'
import { Sidebar, clampSidebarWidth } from '@/features/app-shell/components/Sidebar'
import { OrgGuard, RouteErrorBoundary, RouteSuspense } from '@/features/app-shell/application/AppRouteBoundaries'
import {
  AgentTerminalPanel,
  AudioGenPage,
  MotionImitationPage,
  MultiAnglePage,
  PluginToolPage,
  RefImageGenPage,
  RefVideoGenPage,
  StyleTransferPage,
} from '@/features/app-shell/application/appRouteComponents'
import { toolRouteHeaderTitle, useRememberSettingsReturnPath } from '@/features/app-shell/application/appShellRouteHeaders'
import { GlobalNavigationEffects } from '@/features/app-shell/application/GlobalNavigationEffects'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { openHomeWindow } from '@/shared/infrastructure/appWindowContext'
import { getAppRouteLayoutSpec } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import {
  APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_PANE_ID,
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
  appRouteViewportScrollForMode,
} from '@/routes/routeLayoutRegistry'

function clampTerminalDockHeight(size: number): number {
  return Math.min(APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT, Math.max(APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT, size))
}

export function ToolShellRoute() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)
  const routeViewportScroll = appRouteViewportScrollForMode(routeLayout.scrollMode)
  const currentUser = useUserStore((s) => s.currentUser)
  const currentProject = useProjectStore((s) => s.current)
  const userId = currentUser ? String(currentUser.ID) : ''
  const toolSidebarPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_TOOL_SIDEBAR_PANE_ID,
    clampSize: clampSidebarWidth,
  })
  const terminalPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_TERMINAL_DOCK_PANE_ID,
    fallbackSize: APP_SHELL_TERMINAL_DOCK_DEFAULT_HEIGHT,
    clampSize: clampTerminalDockHeight,
    fallbackState: 'hidden',
  })
  const toolSidebarHidden = toolSidebarPane.hidden
  const terminalOpen = !terminalPane.hidden
  const terminalWorkspaceContext = React.useMemo(() => {
    if (currentProject?.ID) {
      return {
        scope: 'project' as const,
        userId: userId || undefined,
        projectId: currentProject.ID,
      }
    }
    return {
      scope: 'global' as const,
      userId: userId || undefined,
    }
  }, [currentProject?.ID, userId])
  const terminalResize = useResizablePanel({
    size: terminalPane.size,
    onSizeChange: terminalPane.setSize,
    minSize: APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
    maxSize: APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
    resizeEdge: 'top',
    collapsed: !terminalOpen,
    ariaLabel: '调整 Terminal 高度',
  })
  const { active: terminalResizeActive, ...terminalResizeHandleProps } = terminalResize.resizeHandleProps
  const terminalHeaderControl = (
    <AppWindowIconButton
      type="button"
      className="app-window-terminal-toggle"
      data-active={terminalOpen ? 'true' : undefined}
      onClick={terminalOpen ? terminalPane.hide : terminalPane.show}
      title={terminalOpen ? '收起 Terminal' : '展开 Terminal'}
      aria-label={terminalOpen ? '收起 Terminal' : '展开 Terminal'}
    >
      <Terminal size={13} />
    </AppWindowIconButton>
  )
  const terminalPanel = (
    <div
      className="app-shell-terminal-panel-frame"
      data-resizing={terminalResize.resizing ? 'true' : undefined}
      style={{
        height: terminalPane.size,
        minHeight: APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
        maxHeight: APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
        flexBasis: terminalPane.size,
      }}
    >
      <div
        className="app-shell-terminal-resize-handle"
        data-active={terminalResizeActive ? 'true' : undefined}
        {...terminalResizeHandleProps}
      />
      <React.Suspense fallback={null}>
        <AgentTerminalPanel
          open={terminalOpen}
          onOpenChange={(open) => {
            if (open) terminalPane.show()
            else terminalPane.hide()
          }}
          shellPlacement="center"
          workspaceContext={terminalWorkspaceContext}
        />
      </React.Suspense>
    </div>
  )
  const showToolSidebar = React.useCallback(() => {
    toolSidebarPane.show()
  }, [toolSidebarPane])
  const hideToolSidebar = React.useCallback(() => {
    toolSidebarPane.hide()
  }, [toolSidebarPane])
  const toolSidebarLayoutControls = (
    <div className="tool-sidebar-window-controls flex shrink-0 items-center gap-1">
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle"
        onClick={toolSidebarHidden ? showToolSidebar : hideToolSidebar}
        title={toolSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
        aria-label={toolSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
      >
        {toolSidebarHidden ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle tool-sidebar-window-controls__nav"
        onClick={() => navigate(-1)}
        title="后退"
        aria-label="后退"
      >
        <ArrowLeft size={14} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        className="app-window-sidebar-toggle tool-sidebar-window-controls__nav"
        onClick={() => navigate(1)}
        title="前进"
        aria-label="前进"
      >
        <ArrowRight size={14} />
      </AppWindowIconButton>
    </div>
  )
  const homeHeaderControl = (
    <AppWindowIconButton
      type="button"
      className="app-window-sidebar-toggle app-window-home-button"
      onClick={() => {
        void openHomeWindow()
      }}
      title="回到首页"
      aria-label="回到首页"
    >
      <Home size={13} />
    </AppWindowIconButton>
  )
  const toolLeftHeader = !toolSidebarHidden ? (
    <Header
      showAppControls={false}
      showFallbackBrand={false}
      navigationControls={homeHeaderControl}
      layoutControls={toolSidebarLayoutControls}
      leftControlsLayout="fill"
    />
  ) : undefined
  const toolCenterHeader = (
    <Header
      showWindowControls={!toolLeftHeader}
      showAppControls
      showFallbackBrand={false}
      showSettingsAction={false}
      navigationControls={toolSidebarHidden ? homeHeaderControl : undefined}
      layoutControls={toolSidebarHidden ? toolSidebarLayoutControls : undefined}
      contextActions={terminalHeaderControl}
      centerContent={toolRouteHeaderTitle(pathname)}
    />
  )
  const toolLeftSlotStyle = {
    width: toolSidebarHidden ? 0 : toolSidebarPane.size,
    minWidth: toolSidebarHidden ? 0 : toolSidebarPane.size,
    flexBasis: toolSidebarHidden ? 0 : toolSidebarPane.size,
  }

  return (
    <OrgGuard>
      <GlobalNavigationEffects />
      <WorkspaceShell
        surface="tool"
        sidebar={(
          <Sidebar
            width={toolSidebarPane.size}
            onWidthChange={toolSidebarPane.setSize}
            onHide={hideToolSidebar}
          />
        )}
        leftHeader={toolLeftHeader}
        centerHeader={toolCenterHeader}
        leftSlotStyle={toolLeftSlotStyle}
        leftPaneHidden={toolSidebarHidden}
        terminalPanel={terminalPanel}
        terminalOpen={terminalOpen}
        terminalPlacement="center"
      >
        <AppRouteViewport scroll={routeViewportScroll}>
          <RouteErrorBoundary>
            <RouteSuspense>
              <Routes>
                <Route index element={<Navigate to={ROUTES.tools.refImageGen} replace />} />
                <Route path="ref-image-gen" element={<RefImageGenPage />} />
                <Route path="ref-video-gen" element={<RefVideoGenPage />} />
                <Route path="audio-gen" element={<AudioGenPage />} />
                <Route path="motion-imitation" element={<MotionImitationPage />} />
                <Route path="style-transfer" element={<StyleTransferPage />} />
                <Route path="multi-angle" element={<MultiAnglePage />} />
                <Route path="plugin/:pluginId" element={<PluginToolPage />} />
                <Route path="*" element={<Navigate to={ROUTES.tools.refImageGen} replace />} />
              </Routes>
            </RouteSuspense>
          </RouteErrorBoundary>
        </AppRouteViewport>
      </WorkspaceShell>
    </OrgGuard>
  )
}
