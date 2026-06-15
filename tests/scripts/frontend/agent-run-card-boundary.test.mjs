import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const agentRunSource = readSource('packages/ui/src/components/business/agent/run/index.tsx')
const agentRunCss = readSource('packages/ui/src/components/business/agent/run/styles.css')
const providerSessionCss = readSource('apps/frontend/src/features/agent/components/AgentPanelProviderSessionUi.css')

test('unused agent run cards are not shipped from packages/ui', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/run/card')), false)
  assert.doesNotMatch(agentRunSource, /export \* from "\.\/card"/)
  assert.doesNotMatch(agentRunCss, /@import "\.\/card\/styles\.css"/)
  assert.doesNotMatch(providerSessionCss, /ms-agent-run-card/)
})
