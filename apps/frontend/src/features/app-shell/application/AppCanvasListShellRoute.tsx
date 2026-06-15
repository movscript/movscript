import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Home, LayoutTemplate } from 'lucide-react'
import { WorkspaceShell, AppRouteViewport } from '@movscript/ui/layout'
import { AppWindowIconButton } from '@movscript/ui/business/app'
import { Header } from '@/features/app-shell/components/Header'
import { OrgGuard, RouteContentShell, RouteErrorBoundary, RouteSuspense } from '@/features/app-shell/application/AppRouteBoundaries'
import { CanvasListPage } from '@/features/app-shell/application/appRouteComponents'
import { useRememberSettingsReturnPath } from '@/features/app-shell/application/appShellRouteHeaders'
import { openHomeWindow } from '@/shared/infrastructure/appWindowContext'
import { getAppRouteLayoutSpec } from '@/routes/appRouteModel'
import { appRouteViewportScrollForMode } from '@/routes/routeLayoutRegistry'
import i18n from '@/i18n'

export function CanvasListShellRoute() {
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)

  return (
    <OrgGuard>
      <WorkspaceShell
        surface="canvas"
        header={(
          <Header
            navigationControls={<CanvasListHeaderNavigation />}
            layoutControls={<CanvasListHeaderStatus />}
            centerContent={<CanvasListHeaderTitle />}
          />
        )}
      >
        <AppRouteViewport scroll={appRouteViewportScrollForMode(routeLayout.scrollMode)}>
          <RouteErrorBoundary>
            <RouteSuspense>
              <RouteContentShell width="xwide">
                <CanvasListPage />
              </RouteContentShell>
            </RouteSuspense>
          </RouteErrorBoundary>
        </AppRouteViewport>
      </WorkspaceShell>
    </OrgGuard>
  )
}

function CanvasListHeaderNavigation() {
  const navigate = useNavigate()
  return (
    <>
      <AppWindowIconButton
        type="button"
        onClick={() => {
          void openHomeWindow()
        }}
        title={i18n.t('header.titles.home', { defaultValue: '回到首页' })}
        aria-label={i18n.t('header.titles.home', { defaultValue: '回到首页' })}
      >
        <Home size={12} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(-1)}
        title={i18n.t('common.back')}
        aria-label={i18n.t('common.back')}
      >
        <ArrowLeft size={12} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(1)}
        title={i18n.t('common.forward', { defaultValue: '前进' })}
        aria-label={i18n.t('common.forward', { defaultValue: '前进' })}
      >
        <ArrowRight size={12} />
      </AppWindowIconButton>
    </>
  )
}

function CanvasListHeaderStatus() {
  return (
    <span
      className="app-window-route-status"
      title={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
      aria-label={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
    >
      <LayoutTemplate size={12} />
    </span>
  )
}

function CanvasListHeaderTitle() {
  return (
    <div className="app-window-route-title app-window-no-drag">
      <span className="app-window-route-title__text">
        {i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
      </span>
    </div>
  )
}
