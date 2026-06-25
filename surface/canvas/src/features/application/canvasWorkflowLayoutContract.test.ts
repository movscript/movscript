import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('canvas workflow side panel resizing is owned by the shared layout controller', () => {
  const workflowPanelsSource = readFileSync(resolve('src/features/canvas/ui/CanvasWorkflowPanels.tsx'), 'utf8')
  const workflowComponentSource = readFileSync(resolve('src/features/canvas/ui/CanvasWorkflowSidePanelUi.tsx'), 'utf8')
  const workflowStyles = readFileSync(resolve('src/features/canvas/ui/CanvasWorkflowUi.css'), 'utf8')
  const packageCanvasSource = readFileSync(resolve('../../packages/ui/src/components/business/canvas/index.tsx'), 'utf8')
  const packageCanvasStyles = readFileSync(resolve('../../packages/ui/src/components/business/canvas/styles.css'), 'utf8')

  assert.match(workflowPanelsSource, /useResizablePanel\(\{[\s\S]*resizeEdge: 'left'/)
  assert.match(workflowPanelsSource, /from '@\/features\/canvas\/ui\/CanvasWorkflowUi'/)
  assert.match(workflowPanelsSource, /<CanvasWorkflowResizeHandle[\s\S]*\{\.{3}sidePanelResize\.resizeHandleProps\}[\s\S]*side="left"/)
  assert.match(workflowComponentSource, /return <PanelResizeHandle className=\{cn\("canvas-workflow-side-panel__resize-handle"/)
  assert.match(workflowStyles, /\.canvas-workflow-side-panel__resize-handle\.panel-resize-handle--left \{[\s\S]*width: 8px;[\s\S]*transform: translateX\(-4px\);/)
  assert.doesNotMatch(packageCanvasSource, /from "\.\/workflow"/)
  assert.doesNotMatch(packageCanvasStyles, /@import "\.\/workflow\/styles\.css"/)
  assert.doesNotMatch(workflowPanelsSource, /function startResize/)
  assert.doesNotMatch(workflowPanelsSource, /window\.addEventListener\('pointermove'/)
})

test('canvas viewport overlays are owned by an explicit viewport overlay layer', () => {
  const canvasEditorViewportSource = readFileSync(resolve('src/features/canvas/components/CanvasEditorViewport.tsx'), 'utf8')
  const contextMenuSource = readFileSync(resolve('src/features/canvas/ui/ContextMenu.tsx'), 'utf8')
  const contextMenuPlacementSource = readFileSync(resolve('src/features/canvas/presentation/canvasContextMenuPlacement.ts'), 'utf8')
  const canvasEditorComponentSource = readFileSync(resolve('src/features/canvas/ui/CanvasEditorUi.tsx'), 'utf8')
  const canvasEditorStyles = readCssBundle('src/features/canvas/ui/CanvasEditorUi.css')
  const contextMenuStyles = readFileSync(resolve('src/features/canvas/ui/CanvasContextMenuUi.css'), 'utf8')
  const packageCanvasSource = readFileSync(resolve('../../packages/ui/src/components/business/canvas/index.tsx'), 'utf8')
  const packageCanvasStyles = readFileSync(resolve('../../packages/ui/src/components/business/canvas/styles.css'), 'utf8')

  assert.match(canvasEditorComponentSource, /export function CanvasViewportOverlayLayer/)
  assert.match(canvasEditorStyles, /\.canvas-viewport-overlay-layer \{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*z-index: 100;/)
  assert.match(canvasEditorViewportSource, /<CanvasViewportOverlayLayer>[\s\S]*<CanvasViewportEmptyOverlay>[\s\S]*<CanvasDropOverlay>[\s\S]*<CanvasViewportStatusOverlay[\s\S]*<ContextMenu/)
  assert.match(canvasEditorViewportSource, /positioning="viewport"/)
  assert.match(contextMenuSource, /positioning\?: 'fixed' \| 'viewport'/)
  assert.match(contextMenuPlacementSource, /export function canvasContextMenuPositionFromElement/)
  assert.match(contextMenuPlacementSource, /export function canvasContextMenuStyleFromPosition/)
  assert.match(contextMenuSource, /canvasContextMenuPositionFromElement\(\{/)
  assert.match(contextMenuSource, /from '\.\/CanvasContextMenuUi'/)
  assert.match(contextMenuSource, /canvasContextMenuStyleFromPosition\(position\)/)
  assert.doesNotMatch(contextMenuSource, /left: position\.left/)
  assert.doesNotMatch(contextMenuSource, /top: position\.top/)
  assert.doesNotMatch(contextMenuSource, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(contextMenuSource, /window\.innerWidth/)
  assert.doesNotMatch(contextMenuSource, /window\.innerHeight/)
  assert.match(contextMenuStyles, /\.canvas-context-menu--viewport \{[\s\S]*position: absolute;/)
  assert.doesNotMatch(packageCanvasSource, /CanvasContextMenuView|from "\.\/context-menu"/)
  assert.doesNotMatch(packageCanvasStyles, /context-menu\/styles\.css/)
})

test('canvas drop target parsing is centralized before page-level commit actions', () => {
  const canvasEditorSource = readCanvasEditorContractSource()
  const dropControllerSource = readFileSync(resolve('src/features/canvas/presentation/useCanvasDropController.ts'), 'utf8')
  const dropTargetSource = readFileSync(resolve('src/features/canvas/domain/canvasDropTarget.ts'), 'utf8')
  const viewportGeometrySource = readFileSync(resolve('src/features/canvas/presentation/canvasViewportGeometry.ts'), 'utf8')

  assert.match(dropTargetSource, /export type CanvasDropPayload =/)
  assert.match(dropTargetSource, /export interface CanvasDropLayoutHitMap/)
  assert.match(dropTargetSource, /export function createCanvasViewportDropHitMap/)
  assert.match(dropTargetSource, /export function canvasDropHasAcceptedPayload/)
  assert.match(dropTargetSource, /export function acceptCanvasDropDragOver/)
  assert.match(dropTargetSource, /export function startCanvasNodeTemplateDrag/)
  assert.match(dropTargetSource, /export function startCanvasWorkflowDrag/)
  assert.match(dropTargetSource, /export function readCanvasDropPayload/)
  assert.match(viewportGeometrySource, /export function createCanvasViewportDropHitMapFromElement/)
  assert.match(viewportGeometrySource, /export function canvasClientPointFromEvent/)
  assert.match(viewportGeometrySource, /export function canvasViewportDropHitBoxFromEvent/)
  assert.match(canvasEditorSource, /useCanvasDropController\(\{/)
  assert.match(dropControllerSource, /const payload = readCanvasDropPayload\(event\.dataTransfer/)
  assert.match(dropControllerSource, /const clientPoint = canvasClientPointFromEvent\(event\)/)
  assert.match(dropControllerSource, /canvasViewportDropHitBoxFromEvent\(\{ event, viewport: canvasPaneRef\.current, payload \}\)/)
  assert.match(dropControllerSource, /switch \(payload\.kind\)/)
  assert.match(dropControllerSource, /acceptCanvasDropDragOver\(\{ dataTransfer: event\.dataTransfer, hitBox \}\)/)
  assert.doesNotMatch(canvasEditorSource, /createCanvasViewportDropHitMap\(\{/)
  assert.doesNotMatch(canvasEditorSource, /e\.clientX/)
  assert.doesNotMatch(canvasEditorSource, /e\.clientY/)
  assert.doesNotMatch(canvasEditorSource, /canvasPaneRef\.current\?\.getBoundingClientRect\(\)/)
  assert.doesNotMatch(canvasEditorSource, /readCanvasWorkflowDragPayload\(e\.dataTransfer\)/)
  assert.doesNotMatch(canvasEditorSource, /readCanvasNodeTypeDragPayload\(e\.dataTransfer\)/)
  assert.doesNotMatch(canvasEditorSource, /readResourceFromDragPayload\(e\.dataTransfer\)/)
  assert.doesNotMatch(canvasEditorSource, /writeCanvasNodeTypeDragPayload\(/)
  assert.doesNotMatch(canvasEditorSource, /dataTransfer\.dropEffect = 'copy'/)
})

test('canvas viewport geometry is owned by the presentation adapter', () => {
  const canvasEditorSource = readCanvasEditorContractSource()
  const contextMenuControllerSource = readFileSync(resolve('src/features/canvas/presentation/useCanvasContextMenuController.ts'), 'utf8')
  const nodeCreationControllerSource = readFileSync(resolve('src/features/canvas/presentation/useCanvasNodeCreationController.ts'), 'utf8')
  const renderDiagnosticsHookSource = readFileSync(resolve('src/features/canvas/presentation/useCanvasEditorRenderDiagnostics.ts'), 'utf8')
  const viewportPerformanceHookSource = readFileSync(resolve('src/features/canvas/presentation/useCanvasViewportPerformanceState.ts'), 'utf8')
  const viewportGeometrySource = readFileSync(resolve('src/features/canvas/presentation/canvasViewportGeometry.ts'), 'utf8')

  assert.match(viewportGeometrySource, /export function canvasDefaultClientPointFromViewportElement/)
  assert.match(viewportGeometrySource, /export function canvasOverlayPointFromClient/)
  assert.match(viewportGeometrySource, /export function canvasViewportContextMenuBoundary/)
  assert.match(viewportGeometrySource, /export function canvasViewportSizeFromElement/)
  assert.match(viewportGeometrySource, /export function canvasRenderDiagnosticViewport/)
  assert.match(canvasEditorSource, /useCanvasNodeCreationController\(\{/)
  assert.match(nodeCreationControllerSource, /canvasDefaultClientPointFromViewportElement\(canvasPaneRef\.current\)/)
  assert.match(contextMenuControllerSource, /canvasOverlayPointFromViewportElement\(point, canvasPaneRef\.current\)/)
  assert.match(contextMenuControllerSource, /boundary: canvasViewportContextMenuBoundary\(canvasPaneRef\.current\)/)
  assert.match(viewportPerformanceHookSource, /const viewportSize = canvasViewportSizeFromElement\(canvasPaneRef\.current\)/)
  assert.match(renderDiagnosticsHookSource, /viewport: canvasRenderDiagnosticViewport\(\)/)
  assert.doesNotMatch(canvasEditorSource, /canvasDefaultClientPointFromViewportElement/)
  assert.doesNotMatch(canvasEditorSource, /window\.innerWidth/)
  assert.doesNotMatch(canvasEditorSource, /window\.innerHeight/)
  assert.doesNotMatch(canvasEditorSource, /window\.devicePixelRatio/)
})

test('canvas viewport performance states avoid imperative CSS overrides', () => {
  const flowStyles = readFileSync(resolve('src/features/canvas/ui/CanvasEditorFlowUi.css'), 'utf8')

  assert.match(flowStyles, /\.canvas-flow\.canvas-flow--debug-no-shadows \.react-flow__node/)
  assert.match(flowStyles, /\.canvas-flow\.canvas-flow--overview \.react-flow__handle/)
  assert.match(flowStyles, /\.canvas-flow\.canvas-flow--overview \.canvas-node-card,[\s\S]*box-shadow: none;/)
  assert.doesNotMatch(flowStyles, /!important/)
})

test('canvas render diagnostics reuse layout helpers for rect formatting', () => {
  const canvasEditorSource = readCanvasEditorContractSource()
  const routeControlsSource = readFileSync(resolve('src/features/canvas/application/useCanvasWorkspaceRouteControls.ts'), 'utf8')
  const renderDiagnosticsHookSource = readFileSync(resolve('src/features/canvas/presentation/useCanvasEditorRenderDiagnostics.ts'), 'utf8')
  const layoutSource = readFileSync(resolve('src/features/canvas/domain/layout.ts'), 'utf8')
  const renderDiagnosticsSource = readFileSync(resolve('src/features/canvas/presentation/canvasRenderDiagnostics.ts'), 'utf8')
  const debugOptionsSource = readFileSync(resolve('src/features/canvas/presentation/canvasDebugOptions.ts'), 'utf8')

  assert.match(layoutSource, /export function compactCanvasLayoutRect/)
  assert.match(renderDiagnosticsSource, /compactCanvasLayoutRect\(dom\.rootRect\)/)
  assert.match(renderDiagnosticsSource, /compactCanvasLayoutRect\(dom\.flowRect\)/)
  assert.match(renderDiagnosticsSource, /compactCanvasLayoutRect\(rect\)/)
  assert.match(debugOptionsSource, /export function parseCanvasDebugOptions/)
  assert.match(debugOptionsSource, /readBrowserStorageItem\('local', key\)/)
  assert.doesNotMatch(debugOptionsSource, /window\.localStorage/)
  assert.match(routeControlsSource, /parseCanvasDebugOptions\(search\)/)
  assert.match(canvasEditorSource, /useCanvasWorkspaceRouteControls\(\)/)
  assert.match(renderDiagnosticsHookSource, /canvasRenderDiagnosticsEnabled\(\{[\s\S]*dev: import\.meta\.env\.DEV,[\s\S]*renderDiagnostics: import\.meta\.env\.VITE_MOVSCRIPT_RENDER_DIAGNOSTICS/)
  assert.match(renderDiagnosticsHookSource, /logCanvasRenderDiagnostics\(\{/)
  assert.doesNotMatch(canvasEditorSource, /function compactCanvasRect/)
  assert.doesNotMatch(canvasEditorSource, /function compactCanvasMediaElement/)
  assert.doesNotMatch(canvasEditorSource, /querySelectorAll\('img'\)/)
  assert.doesNotMatch(canvasEditorSource, /window\.localStorage\.getItem/)
  assert.doesNotMatch(canvasEditorSource, /movscript\.canvasDebug/)
})

test('canvas text node card layout is keyed by explicit content mode', () => {
  const nodeCardSource = readFileSync(resolve('src/features/canvas/ui/CanvasNodeCardPrimitives.tsx'), 'utf8')
  const nodeCardViewSource = readFileSync(resolve('src/features/canvas/ui/CanvasNodeCardViews.tsx'), 'utf8')
  const nodeCardStyles = readFileSync(resolve('src/features/canvas/ui/CanvasNodeCardUi.css'), 'utf8')

  assert.match(nodeCardSource, /contentMode\?: "text"/)
  assert.match(nodeCardSource, /data-content-mode=\{contentMode\}/)
  assert.match(nodeCardViewSource, /<CanvasNodeCard selected=\{selected\} contentMode="text">/)
  assert.match(nodeCardStyles, /\.canvas-node-card\[data-content-mode="text"\]/)
  assert.doesNotMatch(nodeCardStyles, /\.canvas-node-card:has\(\.canvas-node-card-(textarea|preview-text)\)/)
})

function readCanvasEditorContractSource(): string {
  return [
    readFileSync(resolve('src/features/canvas/components/CanvasEditorPage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/canvas/components/CanvasWorkspace.tsx'), 'utf8'),
    readFileSync(resolve('src/features/canvas/components/useCanvasWorkspaceController.ts'), 'utf8'),
    readFileSync(resolve('src/features/canvas/components/useCanvasWorkspaceInteractionController.ts'), 'utf8'),
  ].join('\n')
}

function readCssBundle(path: string, seen = new Set<string>()): string {
  const absolutePath = resolve(path)
  if (seen.has(absolutePath)) return ''
  seen.add(absolutePath)

  const source = readFileSync(absolutePath, 'utf8')
  const importedSources = [...source.matchAll(/@import\s+['"]\.\/([^'"]+)['"];/g)].map((match) =>
    readCssBundle(resolve(absolutePath, '..', match[1]), seen),
  )

  return [source, ...importedSources].join('\n')
}
