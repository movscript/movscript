import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BriefcaseBusiness, HardDrive, Home, Loader2, Lightbulb, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Play, Save, Workflow, Zap } from 'lucide-react'
import { WorkspaceShell } from '@movscript/ui/layout'
import { AppWindowIconButton } from '@movscript/ui/business/app'
import { AppRouteViewport } from '@movscript/ui/layout'
import { Button, Input } from '@movscript/ui/primitives'
import { Header } from '@/features/app-shell/components/Header'
import { OrgGuard, RouteErrorBoundary, RouteSuspense } from '@/features/app-shell/application/AppRouteBoundaries'
import { CanvasEditorPage } from '@/features/app-shell/application/appRouteComponents'
import { useRememberSettingsReturnPath } from '@/features/app-shell/application/appShellRouteHeaders'
import { useCanvasHeaderStore } from '@/features/canvas/presentation/canvasHeaderStore'
import { useInlineTitleEditor } from '@/features/canvas/presentation/useInlineTitleEditor'
import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import { api } from '@/shared/infrastructure/api'
import { canvasBackPath, getAppRouteLayoutSpec } from '@/routes/appRouteModel'
import { appRouteViewportScrollForMode } from '@/routes/routeLayoutRegistry'
import { ROUTES } from '@/routes/projectRoutes'
import type { Canvas } from '@/types'
import i18n from '@/i18n'

export function CanvasEditorShellRoute() {
  const { pathname, search } = useLocation()
  const { id } = useParams<{ id: string }>()
  useRememberSettingsReturnPath(pathname, search)
  const routeLayout = getAppRouteLayoutSpec(pathname)
  const canvasQuery = useQuery<Canvas>({
    queryKey: canvasKeys.detail(id ?? ''),
    queryFn: () => api.get(`/canvases/${id}`).then((response) => response.data),
    enabled: Boolean(id),
  })

  return (
    <OrgGuard>
      <WorkspaceShell
        surface="canvas"
        header={(
          <Header
            navigationControls={<CanvasHeaderNavigation />}
            layoutControls={<CanvasHeaderLayoutControls />}
            primaryActions={<CanvasHeaderPrimaryActions />}
            contextActions={<CanvasHeaderContextActions />}
            centerContent={<CanvasHeaderTitle fallbackName={canvasQuery.data?.name} />}
          />
        )}
      >
        <AppRouteViewport scroll={appRouteViewportScrollForMode(routeLayout.scrollMode)}>
          <RouteErrorBoundary>
            <RouteSuspense>
              <CanvasEditorPage embeddedInShell />
            </RouteSuspense>
          </RouteErrorBoundary>
        </AppRouteViewport>
      </WorkspaceShell>
    </OrgGuard>
  )
}

function CanvasHeaderNavigation() {
  const navigate = useNavigate()
  const { search } = useLocation()
  return (
    <>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(ROUTES.root)}
        title={i18n.t('header.titles.home', { defaultValue: '回到首页' })}
        aria-label={i18n.t('header.titles.home', { defaultValue: '回到首页' })}
      >
        <Home size={12} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(canvasBackPath(search))}
        title={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
        aria-label={i18n.t('header.titles.canvases', { defaultValue: 'Canvases' })}
      >
        <ArrowLeft size={12} />
      </AppWindowIconButton>
    </>
  )
}

function CanvasHeaderLayoutControls() {
  const canvasType = useCanvasHeaderStore((s) => s.canvasType)
  const nodeCount = useCanvasHeaderStore((s) => s.nodeCount)
  const runningCount = useCanvasHeaderStore((s) => s.runningCount)
  const activeRunLabel = useCanvasHeaderStore((s) => s.activeRunLabel)
  const libraryCollapsed = useCanvasHeaderStore((s) => s.libraryCollapsed)
  const onToggleLibrary = useCanvasHeaderStore((s) => s.onToggleLibrary)
  const canvasTypeLabel = i18n.t(`canvas.editor.canvasType.${canvasType}`)
  const nodeCountLabel = i18n.t('canvas.editor.nodesCount', { count: nodeCount })
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      <AppWindowIconButton
        type="button"
        onClick={onToggleLibrary}
        disabled={!onToggleLibrary}
        title={libraryCollapsed
          ? i18n.t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
          : i18n.t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
        aria-label={libraryCollapsed
          ? i18n.t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
          : i18n.t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
      >
        {libraryCollapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </AppWindowIconButton>
      <span
        className="app-window-route-status"
        title={canvasTypeLabel}
        aria-label={canvasTypeLabel}
      >
        {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
      </span>
      <span
        className="app-window-route-status hidden sm:inline-flex"
        title={nodeCountLabel}
        aria-label={nodeCountLabel}
      >
        <Workflow size={12} />
        <span className="app-window-route-status__text">{nodeCount}</span>
      </span>
      {runningCount > 0 && (
        <span
          className="app-window-route-status inline-flex"
          title={i18n.t('canvas.editor.runningCount', { count: runningCount })}
          aria-label={i18n.t('canvas.editor.runningCount', { count: runningCount })}
        >
          <Loader2 size={12} className="animate-spin" />
          <span className="app-window-route-status__text">{runningCount}</span>
        </span>
      )}
      {canvasType === 'workflow' && activeRunLabel && (
        <span
          className="app-window-route-status hidden 2xl:inline-flex"
          title={activeRunLabel}
          aria-label={activeRunLabel}
        >
          <Zap size={12} />
          <span className="app-window-route-status__text">{activeRunLabel}</span>
        </span>
      )}
    </div>
  )
}

function CanvasHeaderTitle({ fallbackName }: { fallbackName?: string }) {
  const canvasName = useCanvasHeaderStore((s) => s.canvasName)
  const onNameChange = useCanvasHeaderStore((s) => s.onNameChange)
  const effectiveCanvasName = canvasName || fallbackName || ''
  const titleEditor = useInlineTitleEditor({
    value: effectiveCanvasName,
    onCommit: (name) => onNameChange?.(name),
  })
  const displayName = effectiveCanvasName.trim() || i18n.t('canvas.editor.untitled')
  if (titleEditor.editing) {
    return (
      <Input
        ref={titleEditor.inputRef}
        className="app-window-no-drag absolute left-1/2 top-1/2 h-7 w-[min(360px,38vw)] -translate-x-1/2 -translate-y-1/2 border-none bg-transparent px-2 text-center type-label font-semibold text-foreground outline-none"
        value={effectiveCanvasName}
        onChange={(event) => {
          titleEditor.setWorkspace(event.target.value)
          onNameChange?.(event.target.value)
        }}
        onBlur={titleEditor.commitEditing}
        onKeyDown={titleEditor.handleInputKeyDown}
        placeholder={i18n.t('canvas.editor.untitled')}
        aria-label={i18n.t('canvas.editor.untitled')}
      />
    )
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="app-window-no-drag absolute left-1/2 top-1/2 h-7 w-[min(360px,38vw)] -translate-x-1/2 -translate-y-1/2 truncate rounded-sm border-none bg-transparent px-2 text-center type-label font-semibold text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
      onDoubleClick={titleEditor.startEditing}
      onKeyDown={titleEditor.handleDisplayKeyDown}
      title={i18n.t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
      aria-label={i18n.t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
    >
      {displayName}
    </Button>
  )
}

function CanvasHeaderPrimaryActions() {
  const onRun = useCanvasHeaderStore((s) => s.onRun)
  const onSave = useCanvasHeaderStore((s) => s.onSave)
  const saving = useCanvasHeaderStore((s) => s.saving)
  const startingRun = useCanvasHeaderStore((s) => s.startingRun)
  const runLabel = startingRun ? i18n.t('canvas.editor.starting') : i18n.t('canvas.editor.startRun')
  const saveLabel = saving ? i18n.t('common.saving') : i18n.t('common.save')
  return (
    <>
      <AppWindowIconButton
        type="button"
        onClick={onRun}
        disabled={!onRun || startingRun}
        title={runLabel}
        aria-label={runLabel}
      >
        {startingRun ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={onSave}
        disabled={!onSave || saving}
        title={saveLabel}
        aria-label={saveLabel}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
      </AppWindowIconButton>
    </>
  )
}

function CanvasHeaderContextActions() {
  const navigate = useNavigate()
  const workflowPanelCollapsed = useCanvasHeaderStore((s) => s.workflowPanelCollapsed)
  const onToggleWorkflowPanel = useCanvasHeaderStore((s) => s.onToggleWorkflowPanel)
  const workflowPanelLabel = workflowPanelCollapsed
    ? i18n.t('canvas.editor.expandWorkflowPanel', { defaultValue: '展开右侧栏' })
    : i18n.t('canvas.editor.collapseWorkflowPanel', { defaultValue: '缩略右侧栏' })
  return (
    <>
      <AppWindowIconButton
        type="button"
        onClick={onToggleWorkflowPanel}
        disabled={!onToggleWorkflowPanel}
        title={workflowPanelLabel}
        aria-label={workflowPanelLabel}
      >
        {workflowPanelCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(ROUTES.resources)}
        title={i18n.t('header.titles.resources', { defaultValue: 'Resources' })}
        aria-label={i18n.t('header.titles.resources', { defaultValue: 'Resources' })}
      >
        <HardDrive size={12} />
      </AppWindowIconButton>
      <AppWindowIconButton
        type="button"
        onClick={() => navigate(ROUTES.jobs)}
        title={i18n.t('header.titles.jobs', { defaultValue: 'Jobs' })}
        aria-label={i18n.t('header.titles.jobs', { defaultValue: 'Jobs' })}
      >
        <BriefcaseBusiness size={12} />
      </AppWindowIconButton>
    </>
  )
}
