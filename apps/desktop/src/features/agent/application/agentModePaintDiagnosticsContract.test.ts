import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('project agent mode paint diagnostics are owned by presentation helpers', () => {
  const projectAgentModeSource = readFileSync(resolve('src/features/agent/components/ProjectAgentModePage.tsx'), 'utf8')
  const diagnosticsSource = readFileSync(resolve('src/features/agent/presentation/agentModePaintDiagnostics.ts'), 'utf8')

  assert.match(diagnosticsSource, /export function logAgentModePaintDiagnostics/)
  assert.match(diagnosticsSource, /export function agentModePaintDiagnosticRectOutsideViewport/)
  assert.match(diagnosticsSource, /export function scheduleAgentModePaintDiagnostics/)
  assert.match(diagnosticsSource, /export function logAgentModePaintDiagnosticsForSelector/)
  assert.match(projectAgentModeSource, /scheduleAgentModePaintDiagnostics\(\)/)
  assert.match(projectAgentModeSource, /agentModeRenderDiagnosticsEnabled\(\)/)
  assert.doesNotMatch(projectAgentModeSource, /document\.querySelector/)
  assert.doesNotMatch(projectAgentModeSource, /window\.requestAnimationFrame/)
  assert.doesNotMatch(projectAgentModeSource, /getBoundingClientRect\(/)
  assert.doesNotMatch(projectAgentModeSource, /function collectPaintDiagnosticElements/)
  assert.doesNotMatch(projectAgentModeSource, /function rectOutsideViewport/)
})
