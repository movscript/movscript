import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const agentPackageSource = readSource('packages/ui/src/components/business/agent/index.tsx')
const agentPackageCss = readSource('packages/ui/src/components/business/agent/styles.css')
const agentConsolePageSource = readSource('apps/frontend/src/features/agent/components/AgentConsolePage.tsx')
const agentConsoleUiSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleUi.tsx')
const agentConsoleIssueUiSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleIssueUi.tsx')
const agentConsoleLocalToolUiSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleLocalToolUi.tsx')
const agentConsoleGlobalPluginPanelSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleGlobalPluginPanel.tsx')
const agentConsoleGlobalPluginsHookSource = readSource('apps/frontend/src/features/agent/application/useAgentConsoleGlobalPlugins.ts')
const agentConsoleFeatureSource = [
  agentConsoleUiSource,
  agentConsoleIssueUiSource,
  agentConsoleLocalToolUiSource,
].join('\n')
const agentConsoleUiCss = readSource('apps/frontend/src/features/agent/components/AgentConsoleUi.css')
const agentConsoleCompositeCss = readSource('apps/frontend/src/features/agent/components/AgentConsoleUi.composite.css')
const agentsPageSource = [
  readSource('apps/frontend/src/features/agent/components/AgentsPage.tsx'),
  readSource('apps/frontend/src/features/agent/components/AgentsPageParts.tsx'),
].join('\n')
const agentControlCenterSource = readSource('apps/frontend/src/features/agent/application/agentControlCenter.ts')
const agentControlCapabilityHealthSource = readSource('apps/frontend/src/features/agent/application/agentControlCapabilityHealth.ts')
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
    assert.match(agentConsoleFeatureSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(agentPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must not be package-owned`)
  }

  assert.match(agentConsoleUiSource, /from "@\/features\/agent\/components\/AgentConsoleLocalToolUi"/)
  assert.match(agentConsoleUiSource, /from "@\/features\/agent\/components\/AgentConsoleIssueUi"/)
  assert.match(agentConsoleLocalToolUiSource, /function AgentConsoleLocalToolCard[\s\S]*?<AgentSurfaceBlock[\s\S]*?invalid \? toneSurfaceClass\("danger"\) : undefined/)
  assert.match(agentConsoleIssueUiSource, /function AgentConsoleMetricCard[\s\S]*?tone === "action" \? XCircle/)
  assert.match(agentConsoleUiSource, /AgentConsoleToneSurfaceBlock[\s\S]*?toneSurfaceClass\(tone\)/)
  assert.match(agentConsoleUiCss, /\.agent-console-panel\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-page-body\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-agent-list\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-agent-switch\s*\{/)
  assert.match(agentConsoleUiSource, /role="switch"[\s\S]*?aria-checked=\{checked\}/)
  assert.match(appCss, /@import "@\/features\/agent\/components\/AgentConsoleUi\.css";/)
})

test('agent console composite component styles stay in a companion stylesheet', () => {
  assert.match(agentConsoleUiCss, /@import "\.\/AgentConsoleUi\.composite\.css";/)
  for (const selector of [
    '.agent-console-local-tool-card',
    '.agent-console-run-summary-link',
    '.agent-console-management-link',
    '.agent-console-history-clear',
    '.agent-console-metric-card',
  ]) {
    assert.doesNotMatch(agentConsoleUiCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should not grow the shell CSS`)
    assert.match(agentConsoleCompositeCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should live with composite console styles`)
  }

  for (const selector of [
    '.agent-console-page-body',
    '.agent-console-panel',
    '.agent-console-agent-list',
  ]) {
    assert.match(agentConsoleUiCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should stay in the shell CSS`)
  }
})

test('agent selection uses one switch list while configuration stays row navigation', () => {
  assert.match(agentsPageSource, /<AgentConsoleAgentList aria-label="Agent 切换列表">/)
  assert.match(agentsPageSource, /<AgentConsoleAgentListRow[\s\S]*?onClick=\{\(\) => onSelectProfile\(profile\)\}/)
  assert.match(agentsPageSource, /<AgentConsoleAgentSwitch[\s\S]*?checked=\{profile\.current\}/)
  assert.match(agentsPageSource, /event\.stopPropagation\(\)[\s\S]*?onActivateProfile\(profile\)/)
  assert.doesNotMatch(agentsPageSource, /AgentConsoleTabList/)
  assert.doesNotMatch(agentsPageSource, /AgentConsoleTabButton/)
})

test('agent control capability health probing is isolated from the console orchestration model', () => {
  assert.match(agentControlCenterSource, /from '@\/features\/agent\/application\/agentControlCapabilityHealth'/)
  assert.match(agentControlCenterSource, /inspectAgentControlProviderCapabilities/)
  assert.match(agentControlCenterSource, /EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH/)
  assert.doesNotMatch(agentControlCenterSource, /createAgentChatDataSourceForProvider/)
  assert.doesNotMatch(agentControlCenterSource, /inspectCapabilityCall/)
  assert.doesNotMatch(agentControlCenterSource, /countMcpServers|countResolvedTools|countSkillItems/)

  assert.match(agentControlCapabilityHealthSource, /createAgentChatDataSourceForProvider/)
  assert.match(agentControlCapabilityHealthSource, /export async function inspectAgentControlProviderCapabilities/)
  assert.match(agentControlCapabilityHealthSource, /export async function inspectAgentControlDataSourceCapabilities/)
  assert.match(agentControlCapabilityHealthSource, /export function summarizeAgentControlCapabilityHealth/)
})

test('agent console page delegates global plugin orchestration', () => {
  assert.match(agentConsolePageSource, /from '@\/features\/agent\/application\/useAgentConsoleGlobalPlugins'/)
  assert.match(agentConsolePageSource, /useAgentConsoleGlobalPlugins\(\{ onChanged: refreshAll \}\)/)
  assert.match(agentConsolePageSource, /from '@\/features\/agent\/components\/AgentConsoleGlobalPluginPanel'/)
  assert.match(agentConsolePageSource, /<AgentConsoleGlobalPluginPanel/)
  assert.doesNotMatch(agentConsolePageSource, /\buseQuery\(/)
  assert.doesNotMatch(agentConsolePageSource, /requireWorkspaceRootAPI/)
  assert.doesNotMatch(agentConsolePageSource, /loadProjectPluginSnapshot/)
  assert.doesNotMatch(agentConsolePageSource, /setProjectPluginEnabled/)
  assert.doesNotMatch(agentConsolePageSource, /function GlobalPluginPanel/)
  assert.doesNotMatch(agentConsolePageSource, /function GlobalPluginCard/)

  assert.match(agentConsoleGlobalPluginsHookSource, /export function useAgentConsoleGlobalPlugins/)
  assert.match(agentConsoleGlobalPluginsHookSource, /agentConsoleKeys\.globalPlugins/)
  assert.match(agentConsoleGlobalPluginsHookSource, /requireWorkspaceRootAPI\(\)\.getRoot\(\)/)
  assert.match(agentConsoleGlobalPluginsHookSource, /loadProjectPluginSnapshot/)
  assert.match(agentConsoleGlobalPluginsHookSource, /setProjectPluginEnabled/)
  assert.match(agentConsoleGlobalPluginsHookSource, /onChanged\(\)/)
  assert.match(agentConsoleGlobalPluginPanelSource, /export function AgentConsoleGlobalPluginPanel/)
  assert.match(agentConsoleGlobalPluginPanelSource, /function GlobalPluginCard/)
  assert.match(agentConsoleGlobalPluginPanelSource, /from '@movscript\/ui\/primitives'/)
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
