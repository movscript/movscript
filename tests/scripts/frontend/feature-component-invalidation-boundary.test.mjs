import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const generatedResultCardSource = [
  readSource('apps/frontend/src/features/agent/components/GeneratedResultCard.tsx'),
  readSource('apps/frontend/src/features/agent/components/GeneratedCandidateAttachDialog.tsx'),
].join('\n')
const appSettingsSource = [
  readSource('apps/frontend/src/features/settings/components/AppSettingsPage.tsx'),
  readSource('apps/frontend/src/features/settings/components/ExternalResourceSourceSettingsSection.tsx'),
].join('\n')
const agentSessionOutputSource = readSource('apps/frontend/src/features/agent/components/AgentSessionOutputPane.tsx')
const agentSessionOutputServiceSource = readSource('apps/frontend/src/features/agent/application/agentSessionOutputService.ts')
const resourceQueryKeysSource = readSource('apps/frontend/src/features/resources/application/resourceQueryKeys.ts')
const agentSessionOutputQueryKeysSource = readSource('apps/frontend/src/features/agent/application/agentSessionOutputQueryKeys.ts')
const agentSessionOutputMutationSource = readSource('apps/frontend/src/features/agent/application/agentSessionOutputMutationInvalidation.ts')

test('remaining feature components delegate query invalidation to application helpers', () => {
  assert.match(generatedResultCardSource, /invalidateResourceMutationResult\(queryClient, assetCandidateSelectedResult\(\{ projectId \}\)\)/)
  assert.match(appSettingsSource, /queryKey: externalResourceKeys\.sources/)
  assert.match(agentSessionOutputSource, /invalidateAgentSessionOutputMutationResult\(queryClient, agentSessionOutputContentWorkspaceChangedResult\(\{ projectId, changedIds: \[contentUnit\.id, candidate\.id\] \}\)\)/)

  for (const source of [generatedResultCardSource, appSettingsSource, agentSessionOutputSource]) {
    assert.doesNotMatch(source, /invalidateQueries\(\{ queryKey:/)
  }

  assert.doesNotMatch(resourceQueryKeysSource, /export function invalidateExternalResourceSources/)
  assert.match(agentSessionOutputQueryKeysSource, /export const agentSessionOutputKeys/)
  assert.doesNotMatch(agentSessionOutputQueryKeysSource, /export function invalidateAgentSessionOutputContentWorkspace/)
  assert.match(agentSessionOutputMutationSource, /export interface AgentSessionOutputMutationResult/)
  assert.match(agentSessionOutputMutationSource, /AgentSessionOutputContentWorkspaceChanged/)
  assert.match(agentSessionOutputMutationSource, /export function invalidateAgentSessionOutputMutationResult/)
  assert.match(agentSessionOutputSource, /agentSessionOutputKeys\.threadRuns/)
  assert.match(agentSessionOutputSource, /agentSessionOutputKeys\.contentWorkspace\(projectId\)/)
  assert.match(agentSessionOutputSource, /listAgentSessionThreadRuns\(/)
  assert.doesNotMatch(agentSessionOutputSource, /providerSessionClient/)
  assert.doesNotMatch(agentSessionOutputSource, /baseURL/)
  assert.match(agentSessionOutputServiceSource, /providerSessionClient/)
  assert.doesNotMatch(agentSessionOutputQueryKeysSource, /baseURL/)
  assert.doesNotMatch(agentSessionOutputSource, /queryKey: \['agent-session-output-/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
