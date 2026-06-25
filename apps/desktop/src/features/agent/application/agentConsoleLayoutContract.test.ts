import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const agentConsolePages = [
  {
    label: 'overview',
    path: 'src/features/agent/components/AgentConsolePage.tsx',
    body: 'AgentConsolePageBody',
  },
  {
    label: 'model providers',
    path: 'src/features/agent/components/ModelProvidersPage.tsx',
    body: 'AgentConsoleDocumentBody',
  },
  {
    label: 'agents',
    path: 'src/features/agent/components/AgentsPage.tsx',
    companionPaths: ['src/features/agent/components/AgentsPageParts.tsx'],
    body: 'AgentConsoleDocumentBody',
  },
  {
    label: 'connections',
    path: 'src/features/agent/components/AgentConnectionsPage.tsx',
    body: 'AgentThreePanePageBody',
  },
] as const

const globalEnvironmentPages = [
  {
    label: 'plugins',
    path: 'src/features/plugins/components/ClientPluginsPage.tsx',
    body: 'PluginPageShellBody',
  },
  {
    label: 'workspace files',
    path: 'src/features/agent/components/MovScriptWorkspaceFilesPage.tsx',
    body: 'AgentWorkspacesPageBody',
  },
  {
    label: 'workspace review',
    path: 'src/features/agent/components/MovScriptWorkspaceReviewPage.tsx',
    body: 'AgentWorkspacesPageBody',
  },
] as const

test('agent console pages share the shell header nav body layout contract', () => {
  for (const page of agentConsolePages) {
    const source = [
      readFileSync(resolve(page.path), 'utf8'),
      ...('companionPaths' in page ? page.companionPaths.map((path) => readFileSync(resolve(path), 'utf8')) : []),
    ].join('\n')

    assert.match(source, /<AgentPageShell[\s>]/, `${page.label} should render the shared agent page shell`)
    assert.match(source, /<AgentPageShellHeader>/, `${page.label} should render the shared page header slot`)
    assert.match(source, /<AgentConsoleHeader>/, `${page.label} should render the shared console header`)
    assert.match(source, /<\/AgentPageShellHeader>\s*<AgentConsoleNav compact \/>/, `${page.label} should keep console nav outside the header slot`)
    assert.match(source, new RegExp(`<${page.body}[\\s>]`), `${page.label} should render the expected shared body primitive`)
  }
})

test('global environment pages stay outside agent console navigation', () => {
  for (const page of globalEnvironmentPages) {
    const source = readFileSync(resolve(page.path), 'utf8')

    assert.match(source, /<AgentPageShell[\s>]/, `${page.label} should keep the shared page shell`)
    assert.match(source, /<AgentPageShellHeader>/, `${page.label} should keep the shared page header slot`)
    assert.match(source, new RegExp(`<${page.body}[\\s>]`), `${page.label} should render the expected body primitive`)
    assert.doesNotMatch(source, /<AgentConsoleNav compact \/>/, `${page.label} should not render agent console nav`)
  }
})

test('agent console nav stays inside settings-hosted console tabs', () => {
  const navSource = readFileSync(resolve('src/features/agent/components/AgentConsoleNav.tsx'), 'utf8')
  const routeModelSource = readFileSync(resolve('src/features/agent/application/agentConsoleRouteModel.ts'), 'utf8')

  assert.doesNotMatch(routeModelSource, /tab: 'console:model-providers'/)
  assert.match(routeModelSource, /tab: 'console:agents'/)
  assert.match(routeModelSource, /tab: 'console:connections'/)
  assert.doesNotMatch(routeModelSource, /tab: 'console:plugins'/)
  assert.doesNotMatch(routeModelSource, /tab: 'console:workspace'/)
  assert.match(routeModelSource, /export const agentConsoleEnvironmentLinks/)
  assert.match(routeModelSource, /export function agentConsoleSettingsRoute/)
  assert.match(routeModelSource, /export function agentConsoleTabFromLocation/)
  assert.match(navSource, /agentConsoleTabFromLocation\(location\.pathname, location\.search\)/)
  assert.match(navSource, /agentConsoleSettingsRoute\(section\.tab\)/)
  assert.match(navSource, /activeConsoleTab === section\.tab/)
})

test('agent console document pages use shared content flow primitives', () => {
  const modelProvidersSource = readModelProvidersPageSource()
  const agentsSource = [
    readFileSync(resolve('src/features/agent/components/AgentsPage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/AgentsPageParts.tsx'), 'utf8'),
  ].join('\n')
  const pluginsSource = readFileSync(resolve('src/features/plugins/components/ClientPluginsPage.tsx'), 'utf8')
  const pluginsViewSource = readFileSync(resolve('src/features/plugins/components/ClientPluginsPageViews.tsx'), 'utf8')
  const pluginsLayoutSource = [
    pluginsSource,
    pluginsViewSource,
  ].join('\n')
  const consoleSource = readFileSync(resolve('src/features/agent/components/AgentConsoleUi.tsx'), 'utf8')
  const consoleIssueSource = readFileSync(resolve('src/features/agent/components/AgentConsoleIssueUi.tsx'), 'utf8')
  const consoleLocalToolSource = readFileSync(resolve('src/features/agent/components/AgentConsoleLocalToolUi.tsx'), 'utf8')
  const consoleStyles = readFileSync(resolve('src/features/agent/components/AgentConsoleUi.css'), 'utf8')
  const realtimeLogUiSource = readFileSync(resolve('src/features/agent/components/AgentConsoleRealtimeLogUi.tsx'), 'utf8')
  const realtimeLogUiStyles = readFileSync(resolve('src/features/agent/components/AgentConsoleRealtimeLogUi.css'), 'utf8')
  const pluginStyles = readFileSync(resolve('src/features/plugins/components/PluginsPageUi.css'), 'utf8')

  for (const source of [modelProvidersSource]) {
    assert.match(source, /AgentConsoleStack/)
    assert.match(source, /AgentConsoleIntroRow/)
    assert.doesNotMatch(source, /className="space-y-/)
    assert.doesNotMatch(source, /className="flex flex-wrap/)
  }
  assert.match(agentsSource, /AgentConsoleStack/)
  assert.match(agentsSource, /AgentConsoleAgentList/)
  assert.match(agentsSource, /AgentConsoleCallout/)
  assert.doesNotMatch(agentsSource, /className="space-y-/)
  assert.doesNotMatch(agentsSource, /className="flex flex-wrap/)

  assert.doesNotMatch(agentsSource, /className="gap-2"/)
  assert.match(consoleSource, /export function AgentConsoleTabList/)
  assert.match(consoleSource, /export function AgentConsoleTabButton/)
  assert.match(consoleSource, /export function AgentConsoleDocumentBody/)
  assert.match(consoleSource, /export function AgentConsolePageBody/)
  assert.match(consoleSource, /from "@\/features\/agent\/components\/AgentConsoleIssueUi"/)
  assert.match(consoleSource, /from "@\/features\/agent\/components\/AgentConsoleLocalToolUi"/)
  assert.doesNotMatch(consoleSource, /export function AgentConsoleLocalToolCard/)
  assert.doesNotMatch(consoleSource, /export function AgentConsoleMetricCard/)
  assert.match(consoleIssueSource, /export function AgentConsoleMetricCard/)
  assert.match(consoleIssueSource, /export function AgentConsoleIssueRowSurface/)
  assert.match(consoleLocalToolSource, /export function AgentConsoleLocalToolCard/)
  assert.match(consoleLocalToolSource, /export function AgentConsoleFormField/)
  assert.doesNotMatch(consoleSource, /export function AgentConsoleLogSummary/)
  assert.doesNotMatch(consoleSource, /export const AgentConsoleLogStream/)
  assert.doesNotMatch(consoleSource, /export function AgentConsoleLogLineText/)
  assert.match(realtimeLogUiSource, /export function AgentConsoleLogSummary/)
  assert.match(realtimeLogUiSource, /export const AgentConsoleLogStream/)
  assert.match(realtimeLogUiSource, /export function AgentConsoleLogLineText/)
  assert.match(consoleSource, /layout\?: "default" \| "control-logs"/)
  assert.match(consoleSource, /pane\?: "default" \| "logs"/)
  assert.match(consoleSource, /spacing\?: "default" \| "loose"/)
  assert.match(consoleStyles, /\.agent-console-stack\[data-spacing="loose"\] \{[\s\S]*gap: var\(--ms-space-4\);/)
  assert.match(consoleStyles, /\.agent-console-tab-list \{[\s\S]*display: flex;[\s\S]*flex-wrap: wrap;/)
  assert.doesNotMatch(consoleStyles, /\.agent-console-log-stream \{/)
  assert.match(realtimeLogUiStyles, /\.agent-console-log-stream \{[\s\S]*overflow: auto;/)
  assert.match(pluginsViewSource, /<PluginCardSurface key=\{entry\.key\} spacing="compact">/)
  assert.match(pluginsSource, /PluginTabButton/)
  assert.match(pluginsSource, /PluginPageShellBody/)
  assert.match(pluginsViewSource, /PluginSearchInput/)
  assert.match(pluginsSource, /PluginBannerDismissAction/)
  assert.match(pluginsViewSource, /layout="marketplace"/)
  assert.doesNotMatch(pluginsLayoutSource, /className="gap-2"/)
  assert.doesNotMatch(pluginsLayoutSource, /className="gap-1\.5/)
  assert.doesNotMatch(pluginsLayoutSource, /className="ml-auto/)
  assert.doesNotMatch(pluginsLayoutSource, /plugin-empty-state--marketplace/)
  assert.doesNotMatch(pluginsLayoutSource, /className="plugin-page-layout"/)
  assert.doesNotMatch(pluginsLayoutSource, /animate-spin/)
  assert.match(pluginStyles, /\.plugin-card-surface\[data-spacing="compact"\] \{[\s\S]*gap: var\(--ms-space-2\);/)
  assert.match(pluginStyles, /\.plugin-empty-state\[data-layout="marketplace"\] \{[\s\S]*height: 320px;/)
  assert.match(pluginStyles, /\.plugin-tab-button \{[\s\S]*gap: 0\.375rem;/)
})

function readModelProvidersPageSource(): string {
  return [
    readFileSync(resolve('src/features/agent/components/ModelProvidersPage.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ModelProvidersPageSections.tsx'), 'utf8'),
    readFileSync(resolve('src/features/agent/components/ModelProvidersPageModel.ts'), 'utf8'),
  ].join('\n')
}
