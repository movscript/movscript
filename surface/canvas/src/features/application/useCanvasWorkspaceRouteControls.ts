import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRouteLayoutPaneController } from '@movscript/ui/layout'
import { parseCanvasDebugOptions } from '../presentation/canvasDebugOptions'
import { clampCanvasWorkflowPaneWidth } from '../components/canvasEditorModel'
import {
  CANVAS_WORKBENCH_ROUTE_LAYOUT,
  CANVAS_WORKFLOW_PANE_ID,
} from '../presentation/canvasWorkspaceLayoutSpec'
import { canvasBackSurfacePath } from '@movscript/shared'

export function useCanvasWorkspaceRouteControls() {
  const navigate = useNavigate()
  const { search } = useLocation()
  const canvasDebug = useMemo(() => parseCanvasDebugOptions(search), [search])
  const [workflowPanelCollapsed, setWorkflowPanelCollapsed] = useState(false)
  const workflowPane = useRouteLayoutPaneController({
    routeLayout: CANVAS_WORKBENCH_ROUTE_LAYOUT,
    paneId: CANVAS_WORKFLOW_PANE_ID,
    clampSize: clampCanvasWorkflowPaneWidth,
    controlledState: workflowPanelCollapsed ? 'collapsed' : 'default',
    onStateChange: (state) => setWorkflowPanelCollapsed(state !== 'default'),
  })
  const toggleWorkflowPanelCollapsed = useCallback(() => {
    if (workflowPane.collapsed) workflowPane.show()
    else workflowPane.collapse()
  }, [workflowPane])
  const navigateBack = useCallback(() => {
    navigate(canvasBackSurfacePath(search))
  }, [navigate, search])

  return {
    canvasDebug,
    navigateBack,
    toggleWorkflowPanelCollapsed,
    workflowPane,
    workflowPanelCollapsed,
  }
}
