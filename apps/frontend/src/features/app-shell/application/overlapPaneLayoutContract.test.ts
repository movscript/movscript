import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('overlap pane resizing is owned by the shared layout controller', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const brainstormSource = readFileSync(resolve('src/features/tools/components/BrainstormPage.tsx'), 'utf8')
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')

  assert.match(workspaceSource, /export function OverlapPaneGroup/)
  assert.match(workspaceSource, /export function useResizableOverlapPane/)
  assert.match(workspaceSource, /collapseMode === "after-min"[\s\S]*onCollapsedChange\(true\)/)
  assert.match(workspaceSource, /expandMode === "after-max"[\s\S]*onExpandedChange\(true\)/)

  assert.match(toolDialogSource, /useResizableOverlapPane/)
  assert.match(brainstormSource, /useResizableOverlapPane/)
  assert.match(scriptsSource, /useResizableOverlapPane/)

  assert.doesNotMatch(toolDialogSource, /function startResourcePaneResize/)
  assert.doesNotMatch(brainstormSource, /function startResourcePaneResize/)
  assert.doesNotMatch(scriptsSource, /railResizeStart|setIsResizingRail|function startRailResize/)
})

test('business overlap wrappers use the scoped group primitive', () => {
  const scriptLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/scripts/page/index.tsx'), 'utf8')
  const toolDialogLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/index.tsx'), 'utf8')
  const brainstormLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/tools/brainstorm/index.tsx'), 'utf8')
  const resourceLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/resource/page/index.tsx'), 'utf8')

  assert.match(scriptLayoutSource, /<OverlapPaneGroup className=\{cn\("script-workbench-layout"/)
  assert.match(toolDialogLayoutSource, /<OverlapPaneGroup className=\{cn\("tool-dialog-body"/)
  assert.match(brainstormLayoutSource, /<OverlapPaneGroup className=\{cn\("tool-brainstorm-body"/)
  assert.match(resourceLayoutSource, /<OverlapPaneGroup className=\{cn\("resource-prep-workbench-layout"/)
})

test('reference workbench panes expose full and collapsed affordance states', () => {
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')
  const toolDialogStyles = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/styles.css'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const brainstormSource = readFileSync(resolve('src/features/tools/components/BrainstormPage.tsx'), 'utf8')

  assert.match(workspaceStyles, /\.overlap-pane-reveal-button \{[\s\S]*--overlap-pane-reveal-transform: translateY\(-50%\);[\s\S]*transform: var\(--overlap-pane-reveal-transform\);/)
  assert.match(workspaceStyles, /\.overlap-pane-reveal-button\.ms-button:hover:not\(:disabled\),[\s\S]*\.overlap-pane-reveal-button\.ms-button:active:not\(:disabled\) \{[\s\S]*transform: var\(--overlap-pane-reveal-transform\);/)
  assert.match(workspaceStyles, /\.overlap-pane-reveal-button--top \{[\s\S]*--overlap-pane-reveal-transform: none;[\s\S]*top: var\(--ms-space-3\);/)
  assert.match(toolDialogStyles, /\[data-resource-pane-expanded="true"\][\s\S]*grid-template-columns: minmax\(0, 1fr\);/)

  assert.match(toolDialogSource, /data-resource-pane-expanded=\{resourcePaneExpanded \? 'true' : undefined\}/)
  assert.match(toolDialogSource, /className="overlap-pane-reveal-button overlap-pane-reveal-button--top overlap-pane-reveal-button--right"/)
  assert.match(toolDialogSource, /expandMode: 'after-max'/)

  assert.match(brainstormSource, /data-resource-pane-expanded=\{resourcePaneExpanded \? 'true' : undefined\}/)
  assert.match(brainstormSource, /className="overlap-pane-reveal-button overlap-pane-reveal-button--top overlap-pane-reveal-button--right"/)
  assert.match(brainstormSource, /expandMode: 'after-max'/)
})
