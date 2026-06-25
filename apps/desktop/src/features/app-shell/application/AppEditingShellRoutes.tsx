import type { EditingSurfaceHeaderRenderer } from '@movscript/editing-surface/surface-routes'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Home } from 'lucide-react'
import { AppWindowIconButton } from '@movscript/ui/business/app'
import { Header } from '@/features/app-shell/components/Header'
import { OrgGuard, RouteErrorBoundary, RouteSuspense } from '@/features/app-shell/application/AppRouteBoundaries'
import { EditingListSurfaceRoute, EditingWorkspaceSurfaceRoute } from '@/features/app-shell/application/appRouteComponents'
import { useRememberSettingsReturnPath } from '@/features/app-shell/application/appShellRouteHeaders'
import { openHomeWindow } from '@/shared/infrastructure/appWindowContext'
import { getAppRouteLayoutSpec } from '@/routes/appRouteModel'
import { appRouteViewportScrollForMode } from '@/routes/routeLayoutRegistry'
import { ROUTES } from '@/routes/projectRoutes'
import i18n from '@/i18n'

export function EditingListShellRoute() {
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)

  return (
    <OrgGuard>
      <RouteErrorBoundary>
        <RouteSuspense>
          <EditingListSurfaceRoute
            viewportScroll={appRouteViewportScrollForMode(routeLayout.scrollMode)}
            navigation={<EditingListHeaderNavigation />}
            renderHeader={renderDesktopEditingHeader}
          />
        </RouteSuspense>
      </RouteErrorBoundary>
    </OrgGuard>
  )
}

export function EditingProjectShellRoute() {
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)

  return (
    <OrgGuard>
      <RouteErrorBoundary>
        <RouteSuspense>
          <EditingWorkspaceSurfaceRoute
            viewportScroll={appRouteViewportScrollForMode(routeLayout.scrollMode)}
            navigation={<EditingProjectHeaderNavigation />}
            renderHeader={renderDesktopEditingHeader}
          />
        </RouteSuspense>
      </RouteErrorBoundary>
    </OrgGuard>
  )
}

const renderDesktopEditingHeader: EditingSurfaceHeaderRenderer = ({
  navigation,
  status,
  title,
  primaryActions,
}) => (
  <Header
    navigationControls={navigation}
    layoutControls={status}
    centerContent={title}
    primaryActions={primaryActions}
  />
)

function EditingListHeaderNavigation() {
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

function EditingProjectHeaderNavigation() {
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
        onClick={() => navigate(ROUTES.editing)}
        title={i18n.t('header.titles.editing', { defaultValue: '剪辑' })}
        aria-label={i18n.t('header.titles.editing', { defaultValue: '剪辑' })}
      >
        <ArrowLeft size={12} />
      </AppWindowIconButton>
    </>
  )
}
