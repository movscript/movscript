import React from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Home, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { WorkspaceShell, AppRouteViewport } from '@movscript/ui/layout'
import { AppWindowIconButton } from '@movscript/ui/business/app'
import { Header } from '@/features/app-shell/components/Header'
import { Sidebar, clampSidebarWidth } from '@/features/app-shell/components/Sidebar'
import { OrgGuard, RouteErrorBoundary, RouteSuspense } from '@/features/app-shell/application/AppRouteBoundaries'
import {
  AudioToolPage,
  PluginToolPage,
  ProviderAssetLibraryPage,
  ImageToolPage,
  TextToolPage,
  VideoToolPage,
} from '@/features/app-shell/application/appRouteComponents'
import { toolRouteHeaderTitle, useRememberSettingsReturnPath } from '@/features/app-shell/application/appShellRouteHeaders'
import { GlobalNavigationEffects } from '@/features/app-shell/application/GlobalNavigationEffects'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import { openHomeWindow } from '@/shared/infrastructure/appWindowContext'
import { getAppRouteLayoutSpec } from '@/routes/appRouteModel'
import { ROUTES } from '@/routes/projectRoutes'
import {
  APP_SHELL_TOOL_SIDEBAR_PANE_ID,
  appRouteViewportScrollForMode,
} from '@/routes/routeLayoutRegistry'

export function ToolShellRoute() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)
  const routeViewportScroll = appRouteViewportScrollForMode(routeLayout.scrollMode)
  const toolSidebarPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: APP_SHELL_TOOL_SIDEBAR_PANE_ID,
    clampSize: clampSidebarWidth,
  })
  const toolSidebarHidden = toolSidebarPane.hidden
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
      navigationControls={toolSidebarHidden ? homeHeaderControl : undefined}
      layoutControls={toolSidebarHidden ? toolSidebarLayoutControls : undefined}
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
      >
        <AppRouteViewport scroll={routeViewportScroll}>
          <RouteErrorBoundary>
            <RouteSuspense>
              <Routes>
                <Route index element={<Navigate to={ROUTES.tools.image} replace />} />
                <Route path="image" element={<ImageToolPage />} />
                <Route path="video" element={<VideoToolPage />} />
                <Route path="audio" element={<AudioToolPage />} />
                <Route path="text" element={<TextToolPage />} />
                <Route path="private-assets" element={<ProviderAssetLibraryPage />} />
                <Route path="plugin/:pluginId" element={<PluginToolPage />} />
                <Route path="*" element={<Navigate to={ROUTES.tools.image} replace />} />
              </Routes>
            </RouteSuspense>
          </RouteErrorBoundary>
        </AppRouteViewport>
      </WorkspaceShell>
    </OrgGuard>
  )
}
