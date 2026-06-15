import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const agentPackageSource = readSource('packages/ui/src/components/business/agent/index.tsx')
const agentPackageCss = readSource('packages/ui/src/components/business/agent/styles.css')
const agentConsoleNavSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleNav.tsx')
const agentConsoleNavUiSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleNavUi.tsx')
const agentConsoleNavUiCss = readSource('apps/frontend/src/features/agent/components/AgentConsoleNavUi.css')
const appCss = readSource('apps/frontend/src/index.css')

test('agent console nav UI is feature-owned instead of a package business domain', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/console-nav')), false)
  assert.doesNotMatch(agentPackageSource, /export \* from "\.\/console-nav"/)
  assert.doesNotMatch(agentPackageCss, /@import "\.\/console-nav\/styles\.css"/)

  for (const exportName of [
    'AgentConsoleNavShell',
    'AgentConsoleNavList',
    'AgentConsoleNavLinkWrapper',
    'AgentConsoleNavItem',
    'AgentConsoleNavMetaRow',
    'AgentConsoleNavMeta',
  ]) {
    assert.match(agentConsoleNavUiSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must be feature-owned`)
    assert.doesNotMatch(agentPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} must not be package-owned`)
    assert.match(agentConsoleNavSource, new RegExp(`\\b${exportName}\\b`), `${exportName} must be consumed by AgentConsoleNav`)
  }

  assert.match(agentConsoleNavSource, /from ['"]@\/features\/agent\/components\/AgentConsoleNavUi['"]/)
  assert.doesNotMatch(agentConsoleNavSource, /from ['"]@movscript\/ui\/business\/agent['"]/)
  assert.match(agentConsoleNavUiSource, /function AgentConsoleNavItem[\s\S]*?<AgentSurfaceBlock/)
  assert.match(agentConsoleNavUiSource, /function AgentConsoleNavMeta[\s\S]*?<AppInlineMeta/)
  assert.match(agentConsoleNavUiCss, /\.agent-console-nav-shell\s*\{/)
  assert.match(agentConsoleNavUiCss, /\.agent-console-nav-item\s*\{/)
  assert.doesNotMatch(agentPackageCss, /\.agent-console-nav-shell\s*\{/)
  assert.doesNotMatch(agentPackageCss, /\.agent-console-nav-item\s*\{/)
  assert.match(appCss, /@import "@\/features\/agent\/components\/AgentConsoleNavUi\.css";/)
})
