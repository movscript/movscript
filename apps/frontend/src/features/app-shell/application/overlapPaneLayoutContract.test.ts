import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('overlap pane resizing is owned by the shared layout controller', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const preProductionSource = readFileSync(resolve('src/features/pre-production/components/PreProductionPage.tsx'), 'utf8')
  const productionSource = readFileSync(resolve('src/features/production/components/ProductionOrchestrationWorkspace.tsx'), 'utf8')
  const contentSource = readFileSync(resolve('src/features/content/components/ContentWorkbenchPage.tsx'), 'utf8')

  assert.match(workspaceSource, /export function OverlapPaneGroup/)
  assert.match(workspaceSource, /export function useResizableOverlapPane/)
  assert.match(workspaceSource, /export function useOverlapPaneController/)
  assert.match(workspaceSource, /export function usePersistentOverlapPaneController/)
  assert.match(workspaceSource, /useOverlapPaneDisclosure\(\{ defaultCollapsed, defaultExpanded \}\)/)
  assert.match(workspaceSource, /onCollapsedChange: disclosure\.setCollapsed/)
  assert.match(workspaceSource, /onExpandedChange: disclosure\.setExpanded/)
  assert.match(workspaceSource, /collapseMode === "after-min"[\s\S]*onCollapsedChange\(true\)/)
  assert.match(workspaceSource, /expandMode === "after-max"[\s\S]*onExpandedChange\(true\)/)
  const expandBranch = workspaceSource.match(/if \(nextSize > resolvedMaxSize\) \{[\s\S]*?onSizeChange\(resolvedMaxSize\);/)?.[0] ?? ''
  assert.doesNotMatch(expandBranch, /startSize >= resolvedMaxSize/)

  for (const pageSource of [toolDialogSource, scriptsSource, preProductionSource, productionSource, contentSource]) {
    assert.match(pageSource, /usePersistentOverlapPaneController/)
    assert.match(pageSource, /\.groupProps/)
    assert.doesNotMatch(pageSource, /useOverlapPaneDisclosure/)
    assert.doesNotMatch(pageSource, /useResizableOverlapPane/)
    assert.doesNotMatch(pageSource, /useOverlapPaneController/)
  }

  assert.doesNotMatch(toolDialogSource, /function startResourcePaneResize/)
  assert.doesNotMatch(scriptsSource, /railResizeStart|setIsResizingRail|function startRailResize/)
})

test('overlap pane pages follow the reference workbench direction and nesting contract', () => {
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const preProductionSource = readFileSync(resolve('src/features/pre-production/components/PreProductionPage.tsx'), 'utf8')
  const toolDialogLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/index.tsx'), 'utf8')
  const scriptLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/scripts/page/index.tsx'), 'utf8')
  const resourceLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/resource/page/index.tsx'), 'utf8')

  for (const source of [
    toolDialogSource,
    scriptsSource,
    preProductionSource,
    toolDialogLayoutSource,
    scriptLayoutSource,
    resourceLayoutSource,
  ]) {
    assert.doesNotMatch(source, /side=["']right["']/)
  }

  assert.match(toolDialogLayoutSource, /side="left"[\s\S]*resizeHandleSide=\{resizeHandleSide\}/)
  assert.match(resourceLayoutSource, /<OverlapPane as="main" side="left"/)
  assert.match(preProductionSource, /<OverlapPaneGroup[\s\S]*className="resource-prep-setting-assets"[\s\S]*\{\.{3}assetPaneLayoutProps\}/)
  assert.match(preProductionSource, /<OverlapPane[\s\S]*side="left"[\s\S]*overlapState=\{assetPane\.overlapState\}[\s\S]*resizeHandleSide="left"/)
})

test('overlap pane geometry and user width history use the shared contract', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const preProductionSource = readFileSync(resolve('src/features/pre-production/components/PreProductionPage.tsx'), 'utf8')
  const productionSource = readFileSync(resolve('src/features/production/components/ProductionOrchestrationWorkspace.tsx'), 'utf8')
  const contentSource = readFileSync(resolve('src/features/content/components/ContentWorkbenchPage.tsx'), 'utf8')
  const toolDialogStyles = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/styles.css'), 'utf8')
  const scriptStyles = readFileSync(resolve('../../packages/ui/src/components/business/scripts/page/styles.css'), 'utf8')
  const resourceStyles = readFileSync(resolve('../../packages/ui/src/components/business/resource/page/styles.css'), 'utf8')
  const productionStyles = readFileSync(resolve('../../packages/ui/src/components/business/production/orchestration/styles.css'), 'utf8')
  const contentStyles = readFileSync(resolve('../../packages/ui/src/components/business/content/workbench/styles.css'), 'utf8')

  assert.match(workspaceSource, /window\.localStorage\.getItem\(storageKey\)/)
  assert.match(workspaceSource, /window\.localStorage\.setItem\(storageKey, String\(size\)\)/)
  assert.match(workspaceSource, /"data-overlap-pane-collapsed": controller\.collapsedDataAttribute/)
  assert.match(workspaceSource, /"data-overlap-pane-expanded": controller\.expandedDataAttribute/)
  assert.match(workspaceSource, /"data-overlap-pane-resized": size !== defaultSize \? "true" : undefined/)
  assert.match(workspaceSource, /\[sizeVariableName\]: `\$\{size\}px`/)

  for (const pageSource of [toolDialogSource, scriptsSource, preProductionSource, productionSource, contentSource]) {
    assert.match(pageSource, /storageKey:/)
    assert.match(pageSource, /defaultSize:/)
    assert.match(pageSource, /\.\w+\.groupProps/)
    assert.doesNotMatch(pageSource, /data-(resource|script-detail|detail|asset)-pane-(collapsed|expanded|resized)=/)
    assert.doesNotMatch(pageSource, /--(tool-dialog-resource-pane-width|script-workbench-detail-pane-width|resource-prep-detail-pane-width|resource-prep-setting-asset-pane-width|production-orchestration-detail-pane-width|content-workbench-detail-pane-width)/)
  }

  for (const businessStyles of [toolDialogStyles, scriptStyles, resourceStyles, productionStyles, contentStyles]) {
    assert.match(businessStyles, /--overlap-pane-size/)
    assert.match(businessStyles, /data-overlap-pane-(collapsed|expanded|resized)/)
    assert.doesNotMatch(businessStyles, /data-(resource|script-detail|detail|asset)-pane/)
    assert.doesNotMatch(businessStyles, /--(tool-dialog-resource-pane-width|script-workbench-detail-pane-width|resource-prep-detail-pane-width|resource-prep-setting-asset-pane-width|production-orchestration-detail-pane-width|content-workbench-detail-pane-width)/)
  }
})

test('business overlap wrappers use the scoped group primitive', () => {
  const scriptLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/scripts/page/index.tsx'), 'utf8')
  const toolDialogLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/index.tsx'), 'utf8')
  const resourceLayoutSource = readFileSync(resolve('../../packages/ui/src/components/business/resource/page/index.tsx'), 'utf8')

  assert.match(scriptLayoutSource, /<OverlapPaneGroup className=\{cn\("script-workbench-layout"/)
  assert.match(toolDialogLayoutSource, /<OverlapPaneGroup className=\{cn\("tool-dialog-body"/)
  assert.match(resourceLayoutSource, /<OverlapPaneGroup className=\{cn\("resource-prep-workbench-layout"/)
})

test('overlap pane owns default block-axis fill behavior', () => {
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')

  assert.match(workspaceStyles, /\.overlap-pane \{[\s\S]*height: 100%;[\s\S]*min-height: 0;[\s\S]*align-self: stretch;/)
  assert.match(workspaceStyles, /\.overlap-pane-layout \{[\s\S]*min-height: 0;[\s\S]*position: relative;/)
})

test('overlap pane owns the shared pane padding', () => {
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')
  const toolDialogStyles = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/styles.css'), 'utf8')
  const scriptStyles = readFileSync(resolve('../../packages/ui/src/components/business/scripts/page/styles.css'), 'utf8')
  const scriptHeaderStyles = readFileSync(resolve('../../packages/ui/src/components/business/scripts/detail-header/styles.css'), 'utf8')
  const scriptTabsStyles = readFileSync(resolve('../../packages/ui/src/components/business/scripts/tabs/styles.css'), 'utf8')
  const resourceStyles = readFileSync(resolve('../../packages/ui/src/components/business/resource/page/styles.css'), 'utf8')
  const productionStyles = readFileSync(resolve('../../packages/ui/src/components/business/production/orchestration/styles.css'), 'utf8')
  const contentStyles = readFileSync(resolve('../../packages/ui/src/components/business/content/workbench/styles.css'), 'utf8')
  const overlapRule = workspaceStyles.match(/\.overlap-pane \{[\s\S]*?\}/)?.[0] ?? ''

  assert.match(overlapRule, /--overlap-pane-padding: var\(--ms-space-4\);/)
  assert.match(overlapRule, /padding: var\(--overlap-pane-padding\);/)

  assert.match(toolDialogStyles, /\.tool-dialog-resource-overlap > \.resource-panel \.resource-panel__filters \{[\s\S]*padding: 0 0 var\(--ms-space-2\);/)
  assert.match(scriptStyles, /\.script-editor-form__toolbar \{[\s\S]*padding: 0 0 calc\(var\(--script-workbench-content-y\) \* 0\.75\);/)
  assert.match(scriptStyles, /\.script-editor-form__body-grid \{[\s\S]*padding: var\(--script-workbench-content-y\) 0 0;/)
  assert.match(scriptStyles, /\.script-version-history-panel,[\s\S]*\.script-production-panel \{[\s\S]*padding: var\(--script-workbench-content-y\) 0 0;/)
  assert.match(scriptHeaderStyles, /\.script-detail-header \{[\s\S]*padding: 0 0 calc\(var\(--script-workbench-content-y, 12px\) \* 0\.5\);/)
  assert.match(scriptTabsStyles, /\.script-detail-tabs \{[\s\S]*padding: 0 0 calc\(var\(--script-workbench-content-y, 12px\) \* 0\.65\);/)
  assert.match(resourceStyles, /\.resource-prep-workbench-detail \{[\s\S]*padding: 0;/)
  assert.match(resourceStyles, /\.resource-prep-workbench-detail > \.resource-prep-inspector > \.resource-prep-inspector__panel \{[\s\S]*padding: 0;/)
  assert.match(resourceStyles, /\.resource-prep-inspector__panel--nested-pane \{[\s\S]*padding: 0;/)
  assert.match(resourceStyles, /\.resource-prep-setting-assets__detail \.resource-prep-inspector__panel \{[\s\S]*padding: 0;/)
  assert.match(productionStyles, /\.production-orchestration-detail-content \{[\s\S]*padding: 0;/)
  assert.match(contentStyles, /\.content-workbench-detail-content \{[\s\S]*padding: 0;/)
  assert.match(contentStyles, /\.content-workbench-unit-overlap-pane > \.content-workbench-unit-inspector \{[\s\S]*padding: 0;/)
})

test('overlap pane owns the global three-edge border', () => {
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')
  const overlapBeforeRule = workspaceStyles.match(/\.overlap-pane::before \{[\s\S]*?\}/)?.[0] ?? ''
  const expandedBeforeRule = workspaceStyles.match(/\.overlap-pane\[data-overlap-state="expanded"\]::before \{[\s\S]*?\}/)?.[0] ?? ''
  const overlapRule = workspaceStyles.match(/\.overlap-pane \{[\s\S]*?\}/)?.[0] ?? ''

  assert.match(overlapBeforeRule, /border-top: 1px solid var\(--overlap-pane-border-color\);/)
  assert.match(overlapBeforeRule, /border-bottom: 1px solid var\(--overlap-pane-border-color\);/)
  assert.match(overlapBeforeRule, /border-left: 1px solid var\(--overlap-pane-border-color\);/)
  assert.match(workspaceStyles, /--overlap-pane-border-z-index: 19;/)
  assert.match(workspaceStyles, /\.overlap-pane \{[\s\S]*isolation: isolate;/)
  assert.match(overlapBeforeRule, /z-index: var\(--overlap-pane-border-z-index\);/)
  assert.match(overlapRule, /background: var\(--ms-color-page-background\);/)
  assert.doesNotMatch(overlapBeforeRule, /border-right:/)
  assert.doesNotMatch(expandedBeforeRule, /content: none;/)
  assert.doesNotMatch(overlapRule, /border: 1px solid/)
})

test('overlap pane owns expanded geometry and chrome', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const preProductionSource = readFileSync(resolve('src/features/pre-production/components/PreProductionPage.tsx'), 'utf8')
  const toolDialogStyles = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/styles.css'), 'utf8')
  const scriptStyles = readFileSync(resolve('../../packages/ui/src/components/business/scripts/page/styles.css'), 'utf8')
  const resourceStyles = readFileSync(resolve('../../packages/ui/src/components/business/resource/page/styles.css'), 'utf8')

  assert.match(workspaceSource, /export type OverlapPaneState = "default" \| "expanded"/)
  assert.match(workspaceSource, /export function useOverlapPaneController/)
  assert.match(workspaceSource, /data-overlap-state=\{overlapState === "default" \? undefined : overlapState\}/)
  assert.match(workspaceSource, /export type OverlapPaneChrome = "plain" \| "card"/)
  assert.match(workspaceSource, /data-overlap-chrome=\{chrome === "plain" \? undefined : chrome\}/)
  assert.match(workspaceStyles, /\.overlap-pane\[data-overlap-state="expanded"\] \{[\s\S]*margin-left: 0;[\s\S]*margin-right: 0;[\s\S]*width: 100%;[\s\S]*border-radius: 0;[\s\S]*box-shadow: none;/)
  assert.match(workspaceStyles, /\.overlap-pane\[data-overlap-state="expanded"\]\[data-overlap-side="left"\],[\s\S]*border-radius: var\(--overlap-pane-radius\) 0 0 var\(--overlap-pane-radius\);/)
  assert.match(workspaceStyles, /\.overlap-pane\[data-overlap-state="expanded"\]\[data-overlap-side="right"\],[\s\S]*border-radius: 0 var\(--overlap-pane-radius\) var\(--overlap-pane-radius\) 0;/)

  assert.match(toolDialogSource, /overlapState=\{resourcePaneController\.overlapState\}/)
  assert.match(scriptsSource, /overlapState=\{detailPane\.overlapState\}/)
  assert.match(preProductionSource, /overlapState=\{detailPane\.overlapState\}/)
  assert.match(preProductionSource, /overlapState=\{assetPane\.overlapState\}/)
  assert.doesNotMatch(toolDialogSource, /const \[resourcePaneCollapsed|const \[resourcePaneExpanded/)
  assert.doesNotMatch(scriptsSource, /const \[detailPaneCollapsed|const \[detailPaneExpanded/)
  assert.doesNotMatch(preProductionSource, /const \[detailPaneCollapsed|const \[detailPaneExpanded|const \[assetPaneCollapsed|const \[assetPaneExpanded/)
  for (const pageSource of [toolDialogSource, scriptsSource, preProductionSource]) {
    assert.doesNotMatch(pageSource, /chrome="card"/)
    assert.doesNotMatch(pageSource, /data-overlap-chrome/)
  }

  for (const businessStyles of [toolDialogStyles, scriptStyles, resourceStyles]) {
    assert.doesNotMatch(businessStyles, /\.overlap-pane/)
    assert.doesNotMatch(businessStyles, /--overlap-pane-border/)
    assert.doesNotMatch(businessStyles, /--overlap-pane-radius/)
    assert.doesNotMatch(businessStyles, /(^|\n)[^{\n]*\.overlap-pane[^{]*\{[^}]*border-radius:/)
    assert.doesNotMatch(businessStyles, /(^|\n)[^{\n]*\.overlap-pane[^{]*\{[^}]*box-shadow:/)
  }
})

test('reference workbench panes expose full and collapsed affordance states', () => {
  const workspaceSource = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/index.tsx'), 'utf8')
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')
  const toolDialogStyles = readFileSync(resolve('../../packages/ui/src/components/business/tools/dialog/styles.css'), 'utf8')
  const toolDialogSource = readFileSync(resolve('src/features/tools/components/ToolDialog.tsx'), 'utf8')
  const scriptsSource = readFileSync(resolve('src/features/scripts/components/ScriptsPage.tsx'), 'utf8')
  const preProductionSource = readFileSync(resolve('src/features/pre-production/components/PreProductionPage.tsx'), 'utf8')

  assert.match(workspaceSource, /export function OverlapPaneRevealButton/)
  assert.match(workspaceSource, /className=\{cn\([\s\S]*"overlap-pane-reveal-button"[\s\S]*`overlap-pane-reveal-button--\$\{side\}`/)
  assert.match(workspaceStyles, /\.overlap-pane-reveal-button \{[\s\S]*--overlap-pane-reveal-transform: translateY\(-50%\);[\s\S]*transform: var\(--overlap-pane-reveal-transform\);/)
  assert.match(workspaceStyles, /\.overlap-pane-reveal-button\.ms-button:hover:not\(:disabled\),[\s\S]*\.overlap-pane-reveal-button\.ms-button:active:not\(:disabled\) \{[\s\S]*transform: var\(--overlap-pane-reveal-transform\);/)
  assert.match(workspaceStyles, /\.overlap-pane-reveal-button--top \{[\s\S]*--overlap-pane-reveal-transform: none;[\s\S]*top: var\(--ms-space-3\);/)
  assert.match(toolDialogStyles, /\[data-overlap-pane-expanded="true"\][\s\S]*grid-template-columns: minmax\(0, 1fr\);/)

  assert.match(toolDialogSource, /\{\.{3}resourcePaneController\.groupProps\}/)
  assert.match(toolDialogSource, /<OverlapPaneRevealButton[\s\S]*action="show"[\s\S]*action="restore"/)
  assert.match(toolDialogSource, /expandMode: 'after-max'/)

  assert.match(scriptsSource, /detailPane\.groupProps/)
  assert.match(scriptsSource, /\{\.{3}detailPaneLayoutProps\}/)
  assert.match(scriptsSource, /<OverlapPaneRevealButton[\s\S]*action="show"[\s\S]*action="restore"/)
  assert.match(preProductionSource, /detailPane\.groupProps/)
  assert.match(preProductionSource, /assetPane\.groupProps/)
  assert.match(preProductionSource, /\{\.{3}detailPaneLayoutProps\}/)
  assert.match(preProductionSource, /\{\.{3}assetPaneLayoutProps\}/)
  assert.match(preProductionSource, /<OverlapPaneRevealButton[\s\S]*action="show"[\s\S]*action="restore"/)

  for (const pageSource of [toolDialogSource, scriptsSource, preProductionSource]) {
    assert.doesNotMatch(pageSource, /className="overlap-pane-reveal-button/)
  }
})
