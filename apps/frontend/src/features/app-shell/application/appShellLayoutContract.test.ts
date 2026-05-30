import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('stacked app shell reserves overlap without shrinking pane content', () => {
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')

  assert.match(
    workspaceStyles,
    /\.app-shell\[data-layout="stacked"\] \.app-shell__slot:has\(\+ \.app-shell__slot\) \{[\s\S]*box-sizing: content-box;[\s\S]*padding-right: var\(--app-shell-stack-overlap\);/,
  )
})

test('app sidebar resizing is owned by the shared layout controller', () => {
  const sidebarSource = readFileSync(resolve('src/features/app-shell/components/Sidebar.tsx'), 'utf8')

  assert.match(sidebarSource, /useResizablePanel\(\{[\s\S]*resizeEdge: 'right'[\s\S]*collapseMode: 'after-min'/)
  assert.match(sidebarSource, /\{\.{3}sidebarResize\.resizeHandleProps\}[\s\S]*side="right"/)
  assert.doesNotMatch(sidebarSource, /resizeStart/)
  assert.doesNotMatch(sidebarSource, /setResizing/)
  assert.doesNotMatch(sidebarSource, /document\.body\.style\.cursor/)
  assert.doesNotMatch(sidebarSource, /window\.addEventListener\('pointermove'/)
})

test('shared resizable panel controller supports horizontal and vertical pane edges', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')

  assert.match(workspaceSource, /export type ResizablePanelEdge = "left" \| "right" \| "top" \| "bottom"/)
  assert.match(workspaceSource, /resizablePanelCursor\(edge: ResizablePanelEdge\)[\s\S]*row-resize[\s\S]*col-resize/)
  assert.match(workspaceSource, /resizablePanelAriaOrientation\(edge: ResizablePanelEdge\): "horizontal" \| "vertical"/)
  assert.match(workspaceSource, /resizablePanelKeyboardKeys\(edge: ResizablePanelEdge\)[\s\S]*ArrowUp[\s\S]*ArrowDown[\s\S]*ArrowLeft[\s\S]*ArrowRight/)
})
