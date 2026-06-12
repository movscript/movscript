import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('agent browser opens resource library inside the agent content panel', () => {
  const agentBrowserPanelSource = readFileSync(resolve('src/features/agent/components/AgentBrowserPanel.tsx'), 'utf8')
  const projectAgentModePageSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8')
  const agentContentAreaStoreSource = readFileSync(resolve('src/features/agent/state/agentContentAreaStore.ts'), 'utf8')
  const agentBrowserFeatureSource = `${agentBrowserPanelSource}\n${agentContentAreaStoreSource}`
  const uiAgentBrowserCssSource = readFileSync(resolve('../../packages/ui/src/components/business/agent/browser/styles.css'), 'utf8')

  assert.match(agentBrowserFeatureSource, /kind: 'resources'/)
  assert.match(agentBrowserFeatureSource, /kind: 'external_resources'/)
  assert.match(agentBrowserFeatureSource, /kind: 'canvas_list'/)
  assert.match(agentBrowserPanelSource, /function openResourceLibraryTab\(\)/)
  assert.match(agentBrowserPanelSource, /function openResourceLibraryInCurrentTab\(\)/)
  assert.match(agentBrowserPanelSource, /function openExternalResourceLibraryTab\(\)/)
  assert.match(agentBrowserPanelSource, /function openExternalResourceLibraryInCurrentTab\(\)/)
  assert.match(agentBrowserPanelSource, /function openCanvasListInCurrentTab\(\)/)
  assert.match(agentBrowserPanelSource, /replaceActiveBlank/)
  assert.match(agentBrowserPanelSource, /<ResourceLibraryView variant="pane" \/>/)
  assert.match(agentBrowserPanelSource, /<ExternalResourceSearchPage variant="pane" \/>/)
  assert.match(agentBrowserPanelSource, /<AgentBrowserInternalPane>[\s\S]*<CanvasListView source="agent" \/>[\s\S]*<\/AgentBrowserInternalPane>/)
  assert.match(agentBrowserPanelSource, /onOpenResourceLibrary=\{openResourceLibraryInCurrentTab\}/)
  assert.match(agentBrowserPanelSource, /onOpenExternalResourceLibrary=\{openExternalResourceLibraryInCurrentTab\}/)
  assert.match(agentBrowserPanelSource, /onOpenCanvasList=\{openCanvasListInCurrentTab\}/)
  assert.match(agentBrowserPanelSource, /contentAreaId\?: string \| null/)
  assert.match(projectAgentModePageSource, /<AgentBrowserPanel contentAreaId=\{contentAreaId\} \/>/)
  assert.match(projectAgentModePageSource, /appServerActiveThreadId \?\? activeConversationId \?\? DEFAULT_AGENT_CONTENT_AREA_ID/)
  assert.match(agentBrowserPanelSource, /createTabId\('web', resolvedContentAreaId\)/)
  assert.match(agentBrowserPanelSource, /title="打开资源库"/)
  assert.match(agentBrowserPanelSource, /title="打开外部资源"/)
  assert.doesNotMatch(agentBrowserPanelSource, /navigateInternalRoute\(ROUTES\.resources\)/)
  assert.doesNotMatch(agentBrowserPanelSource, /navigateInternalRoute\(ROUTES\.project\.agentCanvases\)/)
  assert.match(uiAgentBrowserCssSource, /\.agent-browser-resource-pane \{[\s\S]*height: 100%;[\s\S]*overflow: hidden;/)
  assert.match(uiAgentBrowserCssSource, /\.agent-browser-internal-pane \{[\s\S]*height: 100%;[\s\S]*overflow-y: auto;/)
})

test('agent browser view bounds are owned by the presentation bounds helper', () => {
  const agentBrowserPanelSource = readFileSync(resolve('src/features/agent/components/AgentBrowserPanel.tsx'), 'utf8')
  const boundsSource = readFileSync(resolve('src/features/agent/presentation/agentBrowserBounds.ts'), 'utf8')

  assert.match(boundsSource, /export function agentBrowserBoundsFromViewportElement/)
  assert.match(boundsSource, /export function agentBrowserBoundsFromViewportRect/)
  assert.match(boundsSource, /export function subscribeAgentBrowserBoundsSync/)
  assert.match(agentBrowserPanelSource, /agentBrowserBoundsFromViewportElement\(viewportRef\.current\)/)
  assert.match(agentBrowserPanelSource, /subscribeAgentBrowserBoundsSync\(viewportRef\.current, syncBounds\)/)
  assert.doesNotMatch(agentBrowserPanelSource, /new ResizeObserver/)
  assert.doesNotMatch(agentBrowserPanelSource, /window\.addEventListener\('resize'/)
  assert.doesNotMatch(agentBrowserPanelSource, /rect\.width < 16/)
  assert.doesNotMatch(agentBrowserPanelSource, /Math\.round\(rect\.left\)/)
})
