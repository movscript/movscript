import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const packageCanvasSource = readSource('packages/ui/src/components/business/canvas/index.tsx')
const packageCanvasCss = readSource('packages/ui/src/components/business/canvas/styles.css')
const workflowPanelsSource = readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowPanels.tsx')
const runtimeInputDialogsSource = readSource('apps/frontend/src/features/canvas/components/CanvasRuntimeInputDialogs.tsx')
const workflowUiSource = readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.tsx')
const workflowUiCss = readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.css')
const resourceShelfSource = readSource('apps/frontend/src/features/canvas/ui/CanvasResourceShelf.tsx')
const resourceShelfUiSource = readSource('apps/frontend/src/features/canvas/ui/CanvasResourceShelfUi.tsx')
const resourceShelfUiCss = readSource('apps/frontend/src/features/canvas/ui/CanvasResourceShelfUi.css')
const editorPageSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorPage.tsx')
const editorChromeSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorChromeBar.tsx')
const editorViewportSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorViewport.tsx')
const editorPaletteSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorNodePalette.tsx')
const editorUiSource = readSource('apps/frontend/src/features/canvas/ui/CanvasEditorUi.tsx')
const editorUiCss = readSource('apps/frontend/src/features/canvas/ui/CanvasEditorUi.css')

test('canvas workflow UI is feature-owned, not package canvas API', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/workflow/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/workflow/styles.css')), false)
  assert.doesNotMatch(packageCanvasSource, /from "\.\/workflow"/)
  assert.doesNotMatch(packageCanvasCss, /@import "\.\/workflow\/styles\.css"/)

  for (const exportName of [
    'CanvasWorkflowHistoryView',
    'CanvasWorkflowResizeHandle',
    'CanvasWorkflowReferencePickerShell',
    'CanvasWorkflowRunResultsView',
    'CanvasRuntimeInputDialogShell',
  ]) {
    assert.doesNotMatch(packageCanvasSource, new RegExp(`\\b${exportName}\\b`), `${exportName} should not remain package-owned`)
    assert.match(workflowUiSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should be owned by the canvas feature`)
  }

  assert.match(workflowUiSource, /import "\.\/CanvasWorkflowUi\.css"/)
  assert.match(workflowUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(workflowUiSource, /from "@movscript\/ui\/layout"/)
  assert.match(workflowUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(workflowPanelsSource, /from '@\/features\/canvas\/ui\/CanvasWorkflowUi'/)
  assert.match(runtimeInputDialogsSource, /from '@\/features\/canvas\/ui\/CanvasWorkflowUi'/)
  assert.match(workflowUiCss, /\.canvas-workflow-side-panel__resize-handle\.panel-resize-handle--left \{/)
  assert.match(workflowUiCss, /\.canvas-runtime-input-dialog-overlay \{/)
})

test('canvas resource shelf UI is feature-owned, not package canvas API', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/resource-shelf/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/resource-shelf/styles.css')), false)
  assert.doesNotMatch(packageCanvasSource, /from "\.\/resource-shelf"/)
  assert.doesNotMatch(packageCanvasCss, /@import "\.\/resource-shelf\/styles\.css"/)

  for (const exportName of [
    'CanvasResourceShelfView',
    'CanvasResourceShelfLazyFrame',
    'CanvasResourceShelfMetadataProbe',
    'CanvasResourceShelfMetadataText',
  ]) {
    assert.doesNotMatch(packageCanvasSource, new RegExp(`\\b${exportName}\\b`), `${exportName} should not remain package-owned`)
    assert.match(resourceShelfUiSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should be owned by the canvas feature`)
  }

  assert.match(resourceShelfSource, /from '\.\/CanvasResourceShelfUi'/)
  assert.match(resourceShelfUiSource, /import "\.\/CanvasResourceShelfUi\.css"/)
  assert.match(resourceShelfUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(resourceShelfUiSource, /from "@movscript\/ui\/business\/canvas"/)
  assert.match(resourceShelfUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(resourceShelfUiCss, /\.canvas-resource-shelf\s*\{/)
  assert.match(resourceShelfUiCss, /\.canvas-resource-shelf-card\s*\{/)
})

test('canvas editor chrome, viewport, and palette UI are feature-owned', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/editor/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/editor/styles.css')), false)
  assert.doesNotMatch(packageCanvasSource, /from "\.\/editor"/)
  assert.doesNotMatch(packageCanvasCss, /@import "\.\/editor\/styles\.css"/)

  for (const exportName of [
    'CanvasEditorShell',
    'CanvasEditorChrome',
    'CanvasViewportPane',
    'CanvasViewportOverlayLayer',
    'CanvasPalettePanel',
    'canvasFlowClassName',
  ]) {
    assert.doesNotMatch(packageCanvasSource, new RegExp(`\\b${exportName}\\b`), `${exportName} should not remain package-owned`)
    assert.match(editorUiSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should be owned by the canvas feature`)
  }

  assert.match(editorUiSource, /import "\.\/CanvasEditorUi\.css"/)
  assert.match(editorUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(editorUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(editorPageSource, /from '@\/features\/canvas\/ui\/CanvasEditorUi'/)
  assert.match(editorChromeSource, /from '@\/features\/canvas\/ui\/CanvasEditorUi'/)
  assert.match(editorViewportSource, /from '@\/features\/canvas\/ui\/CanvasEditorUi'/)
  assert.match(editorPaletteSource, /from '@\/features\/canvas\/ui\/CanvasEditorUi'/)
  assert.match(editorUiCss, /\.canvas-editor\s*\{/)
  assert.match(editorUiCss, /\.canvas-viewport-overlay-layer\s*\{/)
  assert.match(editorUiCss, /\.canvas-palette\s*\{/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
