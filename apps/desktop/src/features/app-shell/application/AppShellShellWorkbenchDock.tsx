import React from 'react'
import { useResizablePanel } from '@movscript/ui/layout'

import { ShellWorkbench } from '@/features/app-shell/application/appRouteComponents'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import {
  APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT,
  APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT,
} from '@/routes/routeLayoutRegistry'

export function clampShellWorkbenchDockHeight(size: number): number {
  return Math.min(APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT, Math.max(APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT, size))
}

export function AppShellShellWorkbenchDock({
  open,
  paneSize,
  placement,
  workspaceContext,
  onOpenChange,
  onPaneSizeChange,
}: {
  open: boolean
  paneSize: number
  placement: 'center' | 'center-right'
  workspaceContext: MovScriptWorkspaceContext
  onOpenChange: (open: boolean) => void
  onPaneSizeChange: (size: number) => void
}) {
  const shellWorkbenchResize = useResizablePanel({
    size: paneSize,
    onSizeChange: onPaneSizeChange,
    minSize: APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT,
    maxSize: APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT,
    resizeEdge: 'top',
    collapsed: !open,
    ariaLabel: '调整 Shell 高度',
  })
  const { active: shellWorkbenchResizeActive, ...shellWorkbenchResizeHandleProps } = shellWorkbenchResize.resizeHandleProps

  return (
    <div
      className="app-shell-shell-workbench-panel-frame"
      data-resizing={shellWorkbenchResize.resizing ? 'true' : undefined}
      style={{
        height: paneSize,
        minHeight: APP_SHELL_SHELL_WORKBENCH_DOCK_MIN_HEIGHT,
        maxHeight: APP_SHELL_SHELL_WORKBENCH_DOCK_MAX_HEIGHT,
        flexBasis: paneSize,
      }}
    >
      <div
        className="app-shell-shell-workbench-resize-handle"
        data-active={shellWorkbenchResizeActive ? 'true' : undefined}
        {...shellWorkbenchResizeHandleProps}
      />
      <React.Suspense fallback={null}>
        <ShellWorkbench
          open={open}
          onOpenChange={onOpenChange}
          shellPlacement={placement}
          workspaceContext={workspaceContext}
        />
      </React.Suspense>
    </div>
  )
}
