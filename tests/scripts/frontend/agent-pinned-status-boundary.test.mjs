import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pinnedStatusUiSource = readSource('apps/frontend/src/features/agent/components/AgentPinnedStatusUi.tsx')
const pinnedStatusUiCss = readSource('apps/frontend/src/features/agent/components/AgentPinnedStatusUi.css')
const pinnedStatusShelfSource = readSource('apps/frontend/src/features/agent/components/AgentPinnedStatusShelf.tsx')
const agentPackageSource = readSource('packages/ui/src/components/business/agent/index.tsx')
const agentPackageCss = readSource('packages/ui/src/components/business/agent/styles.css')

test('agent pinned status UI is feature-owned, not shipped from packages/ui', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/pinned-status')), false)
  assert.doesNotMatch(agentPackageSource, /export \* from "\.\/pinned-status"/)
  assert.doesNotMatch(agentPackageCss, /@import "\.\/pinned-status\/styles\.css"/)

  for (const exportName of [
    'AgentPinnedStatusRoot',
    'AgentPinnedStatusSurface',
    'AgentPinnedStatusHeader',
    'AgentPinnedStatusTabGroup',
    'AgentPinnedStatusTabButton',
    'AgentPinnedStatusBody',
    'AgentPinnedStatusList',
    'AgentPinnedStatusEmpty',
    'AgentPinnedStatusWorkerRow',
    'AgentPinnedStatusGenerationLine',
    'AgentPinnedStatusPlanHeader',
    'AgentPinnedStatusPlanStep',
    'AgentPinnedStatusInlineAction',
    'AgentPinnedStatusTruncatedText',
  ]) {
    assert.match(pinnedStatusUiSource, new RegExp(`export function ${exportName}\\b`), `${exportName} should be feature-owned`)
    assert.match(pinnedStatusShelfSource, new RegExp(`\\b${exportName}\\b`), `${exportName} should be consumed by the shelf`)
    assert.doesNotMatch(agentPackageSource, new RegExp(`export function ${exportName}\\b`), `${exportName} should not remain package-owned`)
  }

  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusTabGroup[\s\S]*?<AppControlGroup/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusProgress[\s\S]*?<AppProgressBar/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusBadge[\s\S]*?<Badge/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusTabButton[\s\S]*?<Button/)
  assert.match(pinnedStatusUiSource, /function AgentPinnedStatusEmpty[\s\S]*?<AgentInlineEmpty/)
  assert.match(pinnedStatusUiCss, /\.agent-pinned-status-root\s*\{/)
  assert.match(pinnedStatusUiCss, /\.agent-pinned-status-tab\s*\{/)
  assert.doesNotMatch(agentPackageCss, /\.agent-pinned-status-root\s*\{/)
  assert.doesNotMatch(agentPackageCss, /\.agent-pinned-status-tab\s*\{/)
  assert.doesNotMatch(pinnedStatusShelfSource, /\b(?:AgentInlineEmpty|AgentSurfaceBlock|AppControlGroup|AppProgressBar|Badge|Button)\b/)
  assert.doesNotMatch(pinnedStatusShelfSource, /className=/)
  assert.doesNotMatch(pinnedStatusShelfSource, /<button\b/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
