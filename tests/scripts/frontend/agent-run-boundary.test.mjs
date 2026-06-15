import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const agentRunSource = readSource('packages/ui/src/components/business/agent/run/index.tsx')
const agentRunCss = readSource('packages/ui/src/components/business/agent/run/styles.css')
const agentShellSource = readSource('packages/ui/src/components/business/agent/shell/styles.css')
const agentCss = readSource('packages/ui/src/components/business/agent/styles.css')
const appCss = readSource('apps/frontend/src/index.css')
const messageContentSource = readSource('apps/frontend/src/features/agent/components/AgentMessageContent.tsx')
const attachmentPreviewUiSource = readSource('apps/frontend/src/features/agent/components/AgentAttachmentPreviewUi.tsx')
const attachmentPreviewUiCss = readSource('apps/frontend/src/features/agent/components/AgentAttachmentPreviewUi.css')

test('unused agent run subdomains are not shipped from packages/ui', () => {
  for (const relativePath of [
    'packages/ui/src/components/business/agent/run/field',
    'packages/ui/src/components/business/agent/run/tool-step',
    'packages/ui/src/components/business/agent/run/feedback',
  ]) {
    assert.equal(existsSync(resolve(relativePath)), false, `${relativePath} should not be package-owned`)
  }

  assert.doesNotMatch(agentRunSource, /export \* from "\.\/(?:field|tool-step|feedback)"/)
  assert.doesNotMatch(agentRunCss, /@import "\.\/(?:field|tool-step|feedback)\/styles\.css"/)
  assert.doesNotMatch(agentCss, /ms-agent-run-field|ms-agent-tool-step|agent-run-tone/)
})

test('agent attachment preview is feature-owned', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/run/attachment-preview')), false)
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/shell/attachment')), false)
  assert.doesNotMatch(agentRunSource, /export \* from "\.\/attachment-preview"/)
  assert.doesNotMatch(agentShellSource, /@import "\.\/attachment\/styles\.css"/)
  assert.doesNotMatch(agentCss, /ms-agent-attachment-preview/)

  assert.match(appCss, /@import "@\/features\/agent\/components\/AgentAttachmentPreviewUi\.css";/)
  assert.match(messageContentSource, /from '@\/features\/agent\/components\/AgentAttachmentPreviewUi'/)
  assert.match(attachmentPreviewUiSource, /export const AgentAttachmentPreviewCard/)
  assert.match(attachmentPreviewUiCss, /\.agent-attachment-preview\s*\{/)
})
