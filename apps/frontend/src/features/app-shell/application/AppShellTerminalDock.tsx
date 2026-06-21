import React from 'react'
import { useResizablePanel } from '@movscript/ui/layout'

import { AgentTerminalPanel } from '@/features/app-shell/application/appRouteComponents'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import {
  APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
  APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
} from '@/routes/routeLayoutRegistry'

export function clampTerminalDockHeight(size: number): number {
  return Math.min(APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT, Math.max(APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT, size))
}

export function AppShellTerminalDock({
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
  const terminalResize = useResizablePanel({
    size: paneSize,
    onSizeChange: onPaneSizeChange,
    minSize: APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
    maxSize: APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
    resizeEdge: 'top',
    collapsed: !open,
    ariaLabel: '调整 Terminal 高度',
  })
  const { active: terminalResizeActive, ...terminalResizeHandleProps } = terminalResize.resizeHandleProps

  return (
    <div
      className="app-shell-terminal-panel-frame"
      data-resizing={terminalResize.resizing ? 'true' : undefined}
      style={{
        height: paneSize,
        minHeight: APP_SHELL_TERMINAL_DOCK_MIN_HEIGHT,
        maxHeight: APP_SHELL_TERMINAL_DOCK_MAX_HEIGHT,
        flexBasis: paneSize,
      }}
    >
      <div
        className="app-shell-terminal-resize-handle"
        data-active={terminalResizeActive ? 'true' : undefined}
        {...terminalResizeHandleProps}
      />
      <React.Suspense fallback={null}>
        <AgentTerminalPanel
          open={open}
          onOpenChange={onOpenChange}
          shellPlacement={placement}
          workspaceContext={workspaceContext}
        />
      </React.Suspense>
    </div>
  )
}
