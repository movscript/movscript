import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Download, Home, Loader2, Save, Scissors } from 'lucide-react'
import { WorkspaceShell, AppRouteViewport } from '@movscript/ui/layout'
import { AppWindowIconButton } from '@movscript/ui/business/app'
import { Header } from '@/features/app-shell/components/Header'
import { OrgGuard, RouteContentShell, RouteErrorBoundary, RouteSuspense } from '@/features/app-shell/application/AppRouteBoundaries'
import { EditingListPage, EditingWorkspacePage } from '@/features/app-shell/application/appRouteComponents'
import { useRememberSettingsReturnPath } from '@/features/app-shell/application/appShellRouteHeaders'
import { useEditingHeaderStore } from '@/features/editing/application/editingHeaderStore'
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
      <WorkspaceShell
        surface="tool"
        header={(
          <Header
            navigationControls={<EditingListHeaderNavigation />}
            layoutControls={<EditingHeaderStatus />}
            centerContent={<EditingHeaderTitle />}
          />
        )}
      >
        <AppRouteViewport scroll={appRouteViewportScrollForMode(routeLayout.scrollMode)}>
          <RouteErrorBoundary>
            <RouteSuspense>
              <RouteContentShell width="xwide">
                <EditingListPage />
              </RouteContentShell>
            </RouteSuspense>
          </RouteErrorBoundary>
        </AppRouteViewport>
      </WorkspaceShell>
    </OrgGuard>
  )
}

export function EditingProjectShellRoute() {
  const { pathname, search } = useLocation()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)

  return (
    <OrgGuard>
      <WorkspaceShell
        surface="tool"
        header={(
          <Header
            navigationControls={<EditingProjectHeaderNavigation />}
            layoutControls={<EditingHeaderStatus />}
            centerContent={<EditingHeaderTitle />}
            primaryActions={<EditingProjectHeaderActions />}
          />
        )}
      >
        <AppRouteViewport scroll={appRouteViewportScrollForMode(routeLayout.scrollMode)}>
          <RouteErrorBoundary>
            <RouteSuspense>
              <EditingWorkspacePage />
            </RouteSuspense>
          </RouteErrorBoundary>
        </AppRouteViewport>
      </WorkspaceShell>
    </OrgGuard>
  )
}

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

function EditingHeaderStatus() {
  return (
    <span
      className="app-window-route-status"
      title={i18n.t('header.titles.editing', { defaultValue: '剪辑' })}
      aria-label={i18n.t('header.titles.editing', { defaultValue: '剪辑' })}
    >
      <Scissors size={12} />
    </span>
  )
}

function EditingHeaderTitle() {
  const title = useEditingHeaderStore((s) => s.title)
  return (
    <div className="app-window-route-title app-window-no-drag">
      <span className="app-window-route-title__text">
        {title || i18n.t('header.titles.editing', { defaultValue: '剪辑' })}
      </span>
    </div>
  )
}

function EditingProjectHeaderActions() {
  const canSave = useEditingHeaderStore((s) => s.canSave)
  const canRender = useEditingHeaderStore((s) => s.canRender)
  const busy = useEditingHeaderStore((s) => s.busy)
  const onSave = useEditingHeaderStore((s) => s.onSave)
  const onRenderMp4 = useEditingHeaderStore((s) => s.onRenderMp4)
  const saveLabel = busy ? i18n.t('common.saving') : i18n.t('common.save')
  const exportLabel = i18n.t('editing.header.export', { defaultValue: '导出' })
  return (
    <>
      <AppWindowIconButton
        type="button"
        onClick={onSave}
        disabled={!canSave || busy || !onSave}
        title={saveLabel}
        aria-label={saveLabel}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={onRenderMp4}
        disabled={!canRender || busy || !onRenderMp4}
        title={exportLabel}
        aria-label={exportLabel}
      >
        <Download size={12} />
      </AppWindowIconButton>
    </>
  )
}
