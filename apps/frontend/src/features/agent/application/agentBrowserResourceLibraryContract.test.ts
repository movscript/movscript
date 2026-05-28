import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('agent browser opens resource library inside the agent content panel', () => {
  const agentBrowserPanelSource = readFileSync(resolve('src/features/agent/components/AgentBrowserPanel.tsx'), 'utf8')
  const uiAgentBrowserCssSource = readFileSync(resolve('../../packages/ui/src/components/business/agent/browser/styles.css'), 'utf8')

  assert.match(agentBrowserPanelSource, /kind: 'resources'/)
  assert.match(agentBrowserPanelSource, /kind: 'canvas_list'/)
  assert.match(agentBrowserPanelSource, /function openResourceLibraryTab\(\)/)
  assert.match(agentBrowserPanelSource, /function openResourceLibraryInCurrentTab\(\)/)
  assert.match(agentBrowserPanelSource, /function openCanvasListInCurrentTab\(\)/)
  assert.match(agentBrowserPanelSource, /replaceActiveBlank/)
  assert.match(agentBrowserPanelSource, /<ResourceLibraryView variant="pane" \/>/)
  assert.match(agentBrowserPanelSource, /<CanvasListView source="agent" className="agent-browser-canvas-list-view" \/>/)
  assert.match(agentBrowserPanelSource, /onOpenResourceLibrary=\{openResourceLibraryInCurrentTab\}/)
  assert.match(agentBrowserPanelSource, /onOpenCanvasList=\{openCanvasListInCurrentTab\}/)
  assert.match(agentBrowserPanelSource, /title="打开资源库"/)
  assert.doesNotMatch(agentBrowserPanelSource, /navigateInternalRoute\(ROUTES\.resources\)/)
  assert.doesNotMatch(agentBrowserPanelSource, /navigateInternalRoute\(ROUTES\.project\.agentCanvases\)/)
  assert.match(uiAgentBrowserCssSource, /\.agent-browser-resource-pane \{[\s\S]*height: 100%;[\s\S]*overflow: hidden;/)
  assert.match(uiAgentBrowserCssSource, /\.agent-browser-internal-pane \{[\s\S]*height: 100%;[\s\S]*overflow-y: auto;/)
})
