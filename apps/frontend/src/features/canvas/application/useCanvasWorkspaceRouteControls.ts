import { useCallback, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import { parseCanvasDebugOptions } from '@/features/canvas/presentation/canvasDebugOptions'
import { clampCanvasWorkflowPaneWidth } from '@/features/canvas/components/canvasEditorModel'
import { canvasBackPath } from '@/routes/appRouteModel'
import {
  CANVAS_WORKFLOW_PANE_ID,
  routeLayoutSpecForPathname,
} from '@/routes/routeLayoutRegistry'

export function useCanvasWorkspaceRouteControls() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const routeLayout = useMemo(() => routeLayoutSpecForPathname(pathname), [pathname])
  const canvasDebug = useMemo(() => parseCanvasDebugOptions(search), [search])
  const [workflowPanelCollapsed, setWorkflowPanelCollapsed] = useState(false)
  const workflowPane = useRouteLayoutPaneController({
    routeLayout,
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
    navigate(canvasBackPath(search))
  }, [navigate, search])

  return {
    canvasDebug,
    navigateBack,
    toggleWorkflowPanelCollapsed,
    workflowPane,
    workflowPanelCollapsed,
  }
}
