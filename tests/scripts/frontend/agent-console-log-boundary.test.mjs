import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const agentConsoleUiSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleUi.tsx')
const agentConsoleUiCss = readSource('apps/frontend/src/features/agent/components/AgentConsoleUi.css')
const realtimeLogPanelSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleRealtimeLogPanel.tsx')
const realtimeLogUiSource = readSource('apps/frontend/src/features/agent/components/AgentConsoleRealtimeLogUi.tsx')
const realtimeLogUiCss = readSource('apps/frontend/src/features/agent/components/AgentConsoleRealtimeLogUi.css')

test('agent console realtime log UI is feature-owned, not package console API', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/console')), false)
  for (const exportName of [
    'AgentConsoleLogSummary',
    'AgentConsoleLogSummaryItem',
    'AgentConsoleLogSummaryLabel',
    'AgentConsoleLogSummaryValue',
    'AgentConsoleLogStream',
    'AgentConsoleLogEmpty',
    'AgentConsoleLogLine',
    'AgentConsoleLogLineTime',
    'AgentConsoleLogLineStream',
    'AgentConsoleLogLineText',
  ]) {
    assert.doesNotMatch(agentConsoleUiSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should stay out of the general console UI`)
    assert.match(realtimeLogUiSource, new RegExp(`export (function|const) ${exportName}\\b`), `${exportName} should be owned by the agent feature`)
  }

  assert.doesNotMatch(realtimeLogUiSource, /AgentConsoleRealtimeLogUi\.css/)
  assert.match(realtimeLogPanelSource, /from '@\/features\/agent\/components\/AgentConsoleRealtimeLogUi'/)
  assert.match(realtimeLogPanelSource, /from '@\/features\/agent\/components\/AgentConsoleUi'/)

  for (const selector of [
    '.agent-console-log-summary',
    '.agent-console-log-stream',
    '.agent-console-log-empty',
    '.agent-console-log-line',
    '.agent-console-log-line__text',
  ]) {
    assert.doesNotMatch(agentConsoleUiCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should stay out of the general console CSS`)
    assert.match(realtimeLogUiCss, new RegExp(`${escapeRegExp(selector)}\\s*\\{`), `${selector} should live in feature CSS`)
  }

  assert.match(agentConsoleUiSource, /export function AgentConsolePanel/)
  assert.match(agentConsoleUiSource, /export function AgentConsolePageBody/)
  assert.match(agentConsoleUiCss, /\.agent-console-panel\s*\{/)
  assert.match(agentConsoleUiCss, /\.agent-console-page-body\s*\{/)
  assert.match(readSource('apps/frontend/src/index.css'), /@import "@\/features\/agent\/components\/AgentConsoleRealtimeLogUi\.css";/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
