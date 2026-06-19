import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const packageAgentSource = readSource('packages/ui/src/components/business/agent/index.tsx')
const packageAgentCss = readSource('packages/ui/src/components/business/agent/styles.css')
const debugPreviewWorkspaceDiffSource = readSource('apps/frontend/src/features/agent/components/AgentDebugPreviewWorkspaceDiff.tsx')
const debugPreviewUiSource = readSource('apps/frontend/src/features/agent/components/AgentDebugPreviewUi.tsx')
const debugPreviewUiCss = readSource('apps/frontend/src/features/agent/components/AgentDebugPreviewUi.css')
const runInteractionSource = readSource('apps/frontend/src/features/agent/components/AgentRunInteractionBubble.tsx')

test('agent debug preview UI is feature-owned, not package debug API', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/debug/index.tsx')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/debug/styles.css')), false)
  assert.doesNotMatch(packageAgentSource, /export \* from "\.\/debug"/)
  assert.doesNotMatch(packageAgentCss, /@import "\.\/debug\/styles\.css"/)
  assert.equal(existsSync(resolve('apps/frontend/src/features/agent/components/AgentDebugPreviewDialog.tsx')), false)

  assert.match(debugPreviewWorkspaceDiffSource, /export function WorkspaceDiff/)
  assert.match(debugPreviewWorkspaceDiffSource, /export function isWorkspaceApplyPreview/)
  assert.match(debugPreviewWorkspaceDiffSource, /export function safeJSONStringify/)
  assert.match(debugPreviewWorkspaceDiffSource, /from '@\/features\/agent\/components\/AgentDebugPreviewUi'/)
  assert.match(debugPreviewWorkspaceDiffSource, /function diffRows/)
  assert.match(debugPreviewUiSource, /import '\.\/AgentDebugPreviewUi\.css'/)
  assert.match(debugPreviewUiSource, /from '@movscript\/ui\/business\/agent'/)
  assert.match(debugPreviewUiSource, /export function AgentDebugDialogSurface/)
  assert.match(debugPreviewUiSource, /export function AgentDebugWorkspaceDiffCodeBlock/)
  assert.match(debugPreviewUiCss, /\.agent-debug-dialog-overlay\s*\{/)
  assert.match(debugPreviewUiCss, /\.agent-debug-workspace-diff-line\s*\{/)
  assert.match(runInteractionSource, /from '@\/features\/agent\/components\/AgentDebugPreviewWorkspaceDiff'/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
