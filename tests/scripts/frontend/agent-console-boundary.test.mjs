import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const agentPackageSource = readSource('packages/ui/src/components/business/agent/index.tsx')
const agentPackageCss = readSource('packages/ui/src/components/business/agent/styles.css')
const agentConsoleUiSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleUi.tsx')
const agentConsoleUiCss = readSource('apps/frontend/src/features/agent/components/AgentConsoleUi.css')
const agentsPageSource = readSource('apps/frontend/src/features/agent/components/AgentsPage.tsx')
const appCss = readSource('apps/frontend/src/index.css')

test('agent console UI is feature-owned instead of a package business domain', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/console')), false)
  assert.doesNotMatch(agentPackageSource, /export \* from "\.\/console"/)
  assert.doesNotMatch(agentPackageCss, /@import "\.\/console\/styles\.css"/)

  for (const exportName of [
    'AgentConsolePanel',
    'AgentConsolePageBody',
    'AgentConsoleDocumentBody',
    'AgentConsoleLocalToolCard',
    'AgentConsoleMetricCard',
    'AgentConsoleAgentList',
    'AgentConsoleAgentListRow',
    'AgentConsoleAgentSwitch',
    'AgentConsoleActionButton',
  ]) {
    assert.match(agentConsoleUiSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(agentPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must not be package-owned`)
  }

  assert.match(agentConsoleUiSource, /function AgentConsoleLocalToolCard[\s\S]*?<AgentConsoleToneSurfaceBlock[\s\S]*?tone=\{invalid \? "danger" : undefined\}/)
  assert.match(agentConsoleUiSource, /AgentConsoleToneSurfaceBlock[\s\S]*?toneSurfaceClass\(tone\)/)
  assert.match(agentConsoleUiCss, /\.agent-console-panel\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-page-body\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-agent-list\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-agent-switch\s*\{/)
  assert.match(agentConsoleUiSource, /role="switch"[\s\S]*?aria-checked=\{checked\}/)
  assert.match(appCss, /@import "@\/features\/agent\/components\/AgentConsoleUi\.css";/)
})

test('agent selection uses one switch list while configuration stays row navigation', () => {
  assert.match(agentsPageSource, /<AgentConsoleAgentList aria-label="Agent 切换列表">/)
  assert.match(agentsPageSource, /<AgentConsoleAgentListRow[\s\S]*?onClick=\{\(\) => navigate\(providerRoute\(key\)\)\}/)
  assert.match(agentsPageSource, /<AgentConsoleAgentSwitch[\s\S]*?checked=\{current\}/)
  assert.match(agentsPageSource, /event\.stopPropagation\(\)[\s\S]*?activateProvider\(provider\)/)
  assert.doesNotMatch(agentsPageSource, /AgentConsoleTabList/)
  assert.doesNotMatch(agentsPageSource, /AgentConsoleTabButton/)
})
