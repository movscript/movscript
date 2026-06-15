import { useCallback } from 'react'
import {
  AgentModeContentPanel,
  AgentModeResizeHandle,
} from '@/features/agent/components/AgentModeUi'
import { AgentUnifiedChatShell } from '@/features/agent/components/AgentUnifiedChatShell'
import { useResizablePanel } from '@movscript/ui/layout'
import {
  AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
  AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
  clampAgentModeContentPanelWidth,
} from '@/features/agent/presentation/agentModePanelSizing'
import type { Project } from '@/types'

export function ProjectAIAssistantPanel({
  userId,
  project,
  collapsed = false,
  onCollapsedChange,
  width,
  onWidthChange,
}: {
  userId: string
  project: Project | null
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  width?: number
  onWidthChange?: (width: number) => void
}) {
  const panelWidth = clampAgentModeContentPanelWidth(width ?? AGENT_MODE_CONTENT_PANEL_DEFAULT_WIDTH)
  const setPanelWidth = useCallback((nextWidth: number) => {
    onWidthChange?.(clampAgentModeContentPanelWidth(nextWidth))
  }, [onWidthChange])
  const panelResize = useResizablePanel({
    size: panelWidth,
    onSizeChange: setPanelWidth,
    minSize: AGENT_MODE_CONTENT_PANEL_MIN_WIDTH,
    maxSize: AGENT_MODE_CONTENT_PANEL_MAX_WIDTH,
    resizeEdge: 'left',
    collapsed,
    onCollapsedChange,
    collapseMode: 'after-min',
    ariaLabel: '调整 AI 会话面板宽度',
  })

  return (
    <AgentModeContentPanel
      resizing={panelResize.resizing}
      collapsed={collapsed}
      width={panelWidth}
      minWidth={AGENT_MODE_CONTENT_PANEL_MIN_WIDTH}
      aria-label="AI 会话面板"
      aria-hidden={collapsed ? true : undefined}
    >
      <AgentUnifiedChatShell
        userId={userId}
        currentProject={project}
        composerWorkspaceContextLocked
        hideComposerWorkspaceProjectSelector
        emptyThreadLabel={project?.name ? `${project.name}` : '我们做些什么'}
        onCollapse={() => onCollapsedChange?.(true)}
        showCollapse={false}
        host="dock-panel"
        surface="panel"
      />
      {!collapsed ? (
        <AgentModeResizeHandle
          {...panelResize.resizeHandleProps}
          side="left"
        />
      ) : null}
    </AgentModeContentPanel>
  )
}
