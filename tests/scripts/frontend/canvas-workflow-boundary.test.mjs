import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const packageCanvasSource = readSource('packages/ui/src/components/business/canvas/index.tsx')
const packageCanvasCss = readSource('packages/ui/src/components/business/canvas/styles.css')
const workflowPanelsSource = [
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowPanels.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowReferencePicker.tsx'),
].join('\n')
const runtimeInputDialogsSource = readSource('apps/frontend/src/features/canvas/components/CanvasRuntimeInputDialogs.tsx')
const workflowUiSource = [
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowHistoryUi.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowHistoryParts.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowHistoryItems.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowHistoryTypes.ts'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowSidePanelUi.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowReferenceCardUi.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowRunResultsUi.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasRuntimeInputDialogUi.tsx'),
].join('\n')
const workflowUiCss = [
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.css'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.history.css'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.reference-picker.css'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowReferenceCardUi.css'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowRunResultsUi.css'),
].join('\n')
const workflowShellCss = readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.css')
const workflowHistoryCss = readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.history.css')
const workflowReferencePickerCss = readSource('apps/frontend/src/features/canvas/ui/CanvasWorkflowUi.reference-picker.css')
const resourceShelfSource = readSource('apps/frontend/src/features/canvas/ui/CanvasResourceShelf.tsx')
const resourceShelfUiSource = readSource('apps/frontend/src/features/canvas/ui/CanvasResourceShelfUi.tsx')
const resourceShelfCardUiSource = readSource('apps/frontend/src/features/canvas/ui/CanvasResourceShelfCardUi.tsx')
const resourceShelfUiCss = readSource('apps/frontend/src/features/canvas/ui/CanvasResourceShelfUi.css')
const editorPageSource = [
  readSource('apps/frontend/src/features/canvas/components/CanvasEditorPage.tsx'),
  readSource('apps/frontend/src/features/canvas/components/CanvasWorkspace.tsx'),
  readSource('apps/frontend/src/features/canvas/components/useCanvasWorkspaceController.ts'),
  readSource('apps/frontend/src/features/canvas/components/useCanvasWorkspaceInteractionController.ts'),
  readSource('apps/frontend/src/features/canvas/components/CanvasEditorWorkspaceView.tsx'),
].join('\n')
const editorChromeSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorChromeBar.tsx')
const editorViewportSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorViewport.tsx')
const editorPaletteSource = readSource('apps/frontend/src/features/canvas/components/CanvasEditorNodePalette.tsx')
const editorUiSource = [
  readSource('apps/frontend/src/features/canvas/ui/CanvasEditorUi.tsx'),
  readSource('apps/frontend/src/features/canvas/ui/CanvasEditorPaletteUi.tsx'),
].join('\n')
const editorUiCss = readCssBundle('apps/frontend/src/features/canvas/ui/CanvasEditorUi.css')

test('canvas workflow UI is feature-owned, not package canvas API', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/workflow/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/workflow/styles.css')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/card/node/workflow-reference/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/card/node/workflow-reference/styles.css')), false)
  assert.doesNotMatch(packageCanvasSource, /from "\.\/workflow"/)
  assert.doesNotMatch(packageCanvasSource, /CanvasWorkflowReferenceCard/)
  assert.doesNotMatch(packageCanvasCss, /@import "\.\/workflow\/styles\.css"/)

  for (const exportName of [
    'CanvasWorkflowHistoryView',
    'CanvasWorkflowResizeHandle',
    'CanvasWorkflowReferencePickerShell',
    'CanvasWorkflowReferenceCard',
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
  assert.match(workflowUiCss, /\.canvas-workflow-reference-card \{/)
  assert.match(workflowUiCss, /\.canvas-runtime-input-dialog-overlay \{/)
})

test('canvas workflow history and reference picker styles stay in companion stylesheets', () => {
  assert.match(workflowShellCss, /@import "\.\/CanvasWorkflowUi\.history\.css";/)
  assert.match(workflowShellCss, /@import "\.\/CanvasWorkflowUi\.reference-picker\.css";/)

  for (const selector of [
    '.canvas-workflow-history',
    '.canvas-workflow-history-table',
  ]) {
    assert.doesNotMatch(workflowShellCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should not grow the workflow shell CSS`)
    assert.match(workflowHistoryCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should live in workflow history CSS`)
  }

  for (const selector of [
    '.canvas-workflow-reference-picker',
    '.canvas-workflow-reference-picker__card',
  ]) {
    assert.doesNotMatch(workflowShellCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should not grow the workflow shell CSS`)
    assert.match(workflowReferencePickerCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should live in workflow reference picker CSS`)
  }

  assert.match(workflowShellCss, /\.canvas-workflow-side-panel\s*\{/)
})

test('canvas resource shelf UI is feature-owned, not package canvas API', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/resource-shelf/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/canvas/resource-shelf/styles.css')), false)
  assert.doesNotMatch(packageCanvasSource, /from "\.\/resource-shelf"/)
  assert.doesNotMatch(packageCanvasCss, /@import "\.\/resource-shelf\/styles\.css"/)

  const resourceShelfFeatureSource = `${resourceShelfUiSource}\n${resourceShelfCardUiSource}`
  for (const exportName of [
    'CanvasResourceShelfView',
    'CanvasResourceShelfLazyFrame',
    'CanvasResourceShelfMetadataProbe',
    'CanvasResourceShelfMetadataText',
  ]) {
    assert.doesNotMatch(packageCanvasSource, new RegExp(`\\b${exportName}\\b`), `${exportName} should not remain package-owned`)
    assert.match(resourceShelfFeatureSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should be owned by the canvas feature`)
  }

  assert.match(resourceShelfSource, /from '\.\/CanvasResourceShelfUi'/)
  assert.match(resourceShelfUiSource, /import "\.\/CanvasResourceShelfUi\.css"/)
  assert.match(resourceShelfUiSource, /from "\.\/CanvasResourceShelfCardUi"/)
  assert.match(resourceShelfUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(resourceShelfUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(resourceShelfCardUiSource, /from "@movscript\/ui\/business\/app"/)
  assert.match(resourceShelfCardUiSource, /from "@movscript\/ui\/business\/canvas"/)
  assert.match(resourceShelfCardUiSource, /from "@movscript\/ui\/primitives"/)
  assert.match(resourceShelfCardUiSource, /export function CanvasResourceShelfResourceCard/)
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

function readCssBundle(path, seen = new Set()) {
  const absolutePath = resolve(path)
  if (seen.has(absolutePath)) return ''
  seen.add(absolutePath)

  const source = readFileSync(absolutePath, 'utf8')
  const importedSources = [...source.matchAll(/@import\s+['"]\.\/([^'"]+)['"];/g)].map((match) =>
    readCssBundle(resolve(absolutePath, '..', match[1]), seen),
  )

  return [source, ...importedSources].join('\n')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
