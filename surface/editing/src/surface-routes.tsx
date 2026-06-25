import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, Save, Scissors } from 'lucide-react'
import {
  AppWindowControls,
  AppWindowHeader,
  SurfaceRouteFrame,
  WorkspaceShell,
  type AppRouteViewportScroll,
} from '@movscript/ui/layout'
import { AppWindowIconButton } from '@movscript/ui/business/app'

import EditingListPage from './pages/EditingListPage'
import EditingWorkspacePage from './pages/EditingWorkspacePage'
import { useEditingHeaderStore } from './features/application/editingHeaderStore'

export interface EditingSurfaceHeaderSlots {
  navigation?: ReactNode
  status: ReactNode
  title: ReactNode
  primaryActions?: ReactNode
}

export type EditingSurfaceHeaderRenderer = (slots: EditingSurfaceHeaderSlots) => ReactNode

export interface EditingSurfaceRouteProps {
  viewportScroll?: AppRouteViewportScroll
  navigation?: ReactNode
  renderHeader?: EditingSurfaceHeaderRenderer
}

export function EditingListSurfaceRoute({
  viewportScroll = 'auto',
  navigation,
  renderHeader,
}: EditingSurfaceRouteProps) {
  return (
    <EditingSurfaceShell navigation={navigation} renderHeader={renderHeader}>
      <SurfaceRouteFrame
        viewportScroll={viewportScroll}
        content={{ variant: 'contained', width: 'xwide' }}
      >
        <EditingListPage />
      </SurfaceRouteFrame>
    </EditingSurfaceShell>
  )
}

export function EditingWorkspaceSurfaceRoute({
  viewportScroll = 'hidden',
  navigation,
  renderHeader,
}: EditingSurfaceRouteProps) {
  return (
    <EditingSurfaceShell navigation={navigation} renderHeader={renderHeader} primaryActions={<EditingHeaderActions />}>
      <SurfaceRouteFrame viewportScroll={viewportScroll} content={false}>
        <EditingWorkspacePage />
      </SurfaceRouteFrame>
    </EditingSurfaceShell>
  )
}

function EditingSurfaceShell({
  children,
  navigation,
  renderHeader,
  primaryActions,
}: {
  children: ReactNode
  navigation?: ReactNode
  renderHeader?: EditingSurfaceHeaderRenderer
  primaryActions?: ReactNode
}) {
  const slots: EditingSurfaceHeaderSlots = {
    navigation,
    status: <EditingHeaderStatus />,
    title: <EditingHeaderTitle />,
    primaryActions,
  }

  return (
    <WorkspaceShell
      surface="tool"
      header={renderHeader ? renderHeader(slots) : <DefaultEditingSurfaceHeader {...slots} />}
    >
      {children}
    </WorkspaceShell>
  )
}

function DefaultEditingSurfaceHeader({
  navigation,
  status,
  title,
  primaryActions,
}: EditingSurfaceHeaderSlots) {
  const leftControls = navigation || status ? (
    <>
      <HeaderActionGroup roleName="navigation">{navigation}</HeaderActionGroup>
      <HeaderActionGroup roleName="layout">{status}</HeaderActionGroup>
    </>
  ) : undefined
  const controls = primaryActions ? (
    <AppWindowControls>
      <HeaderActionGroup roleName="primary">{primaryActions}</HeaderActionGroup>
    </AppWindowControls>
  ) : undefined

  return (
    <AppWindowHeader
      isMacOS
      leftControls={leftControls}
      controls={controls}
      centerContent={title}
    />
  )
}

function HeaderActionGroup({
  children,
  roleName,
}: {
  children?: ReactNode
  roleName: 'navigation' | 'layout' | 'primary'
}) {
  if (!children) return null
  return (
    <div className="app-window-header-action-group" data-role={roleName}>
      {children}
    </div>
  )
}

function EditingHeaderStatus() {
  const { t } = useTranslation()
  const title = t('header.titles.editing', { defaultValue: '剪辑' })
  return (
    <span
      className="app-window-route-status"
      title={title}
      aria-label={title}
    >
      <Scissors size={12} />
    </span>
  )
}

function EditingHeaderTitle() {
  const { t } = useTranslation()
  const title = useEditingHeaderStore((s) => s.title)
  return (
    <div className="app-window-route-title app-window-no-drag">
      <span className="app-window-route-title__text">
        {title || t('header.titles.editing', { defaultValue: '剪辑' })}
      </span>
    </div>
  )
}

function EditingHeaderActions() {
  const { t } = useTranslation()
  const canSave = useEditingHeaderStore((s) => s.canSave)
  const canRender = useEditingHeaderStore((s) => s.canRender)
  const busy = useEditingHeaderStore((s) => s.busy)
  const onSave = useEditingHeaderStore((s) => s.onSave)
  const onRenderMp4 = useEditingHeaderStore((s) => s.onRenderMp4)
  const saveLabel = busy ? t('common.saving', { defaultValue: '保存中' }) : t('common.save', { defaultValue: '保存' })
  const exportLabel = t('editing.header.export', { defaultValue: '导出' })

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
