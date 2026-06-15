import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const packageAgentSource = readSource('packages/ui/src/components/business/agent/index.tsx')
const packageAgentCss = readSource('packages/ui/src/components/business/agent/styles.css')
const agentModeUiSource = readSource('apps/frontend/src/features/agent/components/AgentModeUi.tsx')
const agentModeUiCss = readSource('apps/frontend/src/features/agent/components/AgentModeUi.css')
const agentModeSidebarCss = readSource('apps/frontend/src/features/agent/components/AgentModeUi.sidebar.css')
const agentModeWorkspaceCss = readSource('apps/frontend/src/features/agent/components/AgentModeUi.workspace.css')
const agentModePanelsCss = readSource('apps/frontend/src/features/agent/components/AgentModeUi.panels.css')
const projectAgentModeSource = [
  readSource('apps/frontend/src/features/agent/components/ProjectAgentModePage.tsx'),
  readSource('apps/frontend/src/features/agent/components/ProjectAgentModeSidebar.tsx'),
  readSource('apps/frontend/src/features/agent/components/ProjectAgentModeSidebarParts.tsx'),
  readSource('apps/frontend/src/features/agent/components/ProjectAgentModeWorkspace.tsx'),
  readSource('apps/frontend/src/features/agent/components/ProjectAgentContentPanel.tsx'),
].join('\n')

test('agent mode UI is owned by the frontend feature boundary', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/mode/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/mode/styles.css')), false)
  assert.doesNotMatch(packageAgentSource, /export \* from "\.\/mode"/)
  assert.doesNotMatch(packageAgentCss, /@import "\.\/mode\/styles\.css"/)

  assert.match(agentModeUiSource, /import '\.\/AgentModeUi\.css'/)
  assert.match(agentModeUiCss, /@import "\.\/AgentModeUi\.sidebar\.css"/)
  assert.match(agentModeUiCss, /@import "\.\/AgentModeUi\.workspace\.css"/)
  assert.match(agentModeUiCss, /@import "\.\/AgentModeUi\.panels\.css"/)
  assert.match(agentModeUiSource, /from '@movscript\/ui\/layout'/)
  assert.match(agentModeUiSource, /from '@movscript\/ui\/primitives'/)
  assert.match(agentModeUiSource, /from '@movscript\/ui\/business\/agent'/)

  for (const exportName of [
    'AgentModeRoot',
    'AgentModeSidebar',
    'AgentModeProjectGroupToggle',
    'AgentModeConversationArchiveButton',
    'AgentModeWorkspace',
    'AgentModeContentPanel',
  ]) {
    assert.match(agentModeUiSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should be feature-owned`)
  }

  assert.match(agentModeUiSource, /project-agent-mode agent-mode-root/)
  assert.match(agentModeSidebarCss, /\.agent-mode-root\s*\{/)
  assert.match(agentModeWorkspaceCss, /\.agent-mode-workspace\s*\{/)
  assert.match(agentModePanelsCss, /\.agent-mode-content-panel\s*\{/)
  assert.match(projectAgentModeSource, /from '@\/features\/agent\/components\/AgentModeUi'/)
  assert.doesNotMatch(projectAgentModeSource, /AgentMode[A-Za-z0-9_]*[\s\S]*from '@movscript\/ui\/business\/agent'/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
