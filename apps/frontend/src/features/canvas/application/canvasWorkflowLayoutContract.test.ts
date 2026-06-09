import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('canvas workflow side panel resizing is owned by the shared layout controller', () => {
  const workflowPanelsSource = readFileSync(resolve('src/features/canvas/ui/CanvasWorkflowPanels.tsx'), 'utf8')
  const workflowComponentSource = readFileSync(resolve('../../packages/ui/src/components/business/canvas/workflow/index.tsx'), 'utf8')
  const workflowStyles = readFileSync(resolve('../../packages/ui/src/components/business/canvas/workflow/styles.css'), 'utf8')

  assert.match(workflowPanelsSource, /useResizablePanel\(\{[\s\S]*resizeEdge: 'left'/)
  assert.match(workflowPanelsSource, /<CanvasWorkflowResizeHandle[\s\S]*\{\.{3}sidePanelResize\.resizeHandleProps\}[\s\S]*side="left"/)
  assert.match(workflowComponentSource, /return <PanelResizeHandle className=\{cn\("canvas-workflow-side-panel__resize-handle"/)
  assert.match(workflowStyles, /\.canvas-workflow-side-panel__resize-handle\.panel-resize-handle--left \{[\s\S]*width: 8px;[\s\S]*transform: translateX\(-4px\);/)
  assert.doesNotMatch(workflowPanelsSource, /function startResize/)
  assert.doesNotMatch(workflowPanelsSource, /window\.addEventListener\('pointermove'/)
})
