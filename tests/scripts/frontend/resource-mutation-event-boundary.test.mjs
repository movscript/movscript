import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const invalidationSource = readSource('apps/frontend/src/features/resources/application/resourceMutationInvalidation.ts')
const queryKeysSource = readSource('apps/frontend/src/features/resources/application/resourceQueryKeys.ts')
const generatedResultCardSource = [
  readSource('apps/frontend/src/features/agent/components/GeneratedResultCard.tsx'),
  readSource('apps/frontend/src/features/agent/components/GeneratedCandidateAttachDialog.tsx'),
].join('\n')
const attachPanelSource = readSource('apps/frontend/src/shared/ui/ResourceCandidateAttachPanel.tsx')
const resourcesPageSource = readSource('apps/frontend/src/features/resources/components/ResourcesPage.tsx')
const appSettingsSource = [
  readSource('apps/frontend/src/features/settings/components/AppSettingsPage.tsx'),
  readSource('apps/frontend/src/features/settings/components/ExternalResourceSourceSettingsSection.tsx'),
].join('\n')
const canvasIntegrationSource = readSource('apps/frontend/src/features/canvas/integrations/resources.ts')
const canvasRuntimeSource = readSource('apps/frontend/src/features/canvas/runtime/useCanvasRuntimeExecutor.ts')

test('resource candidate mutations publish standard domain invalidation results', () => {
  assert.match(invalidationSource, /export type ResourceMutationEvent/)
  assert.match(invalidationSource, /export interface ResourceMutationResult/)
  assert.match(invalidationSource, /type: 'AssetCandidateSelected'/)
  assert.match(invalidationSource, /type: 'ResourceLibraryChanged'/)
  assert.match(invalidationSource, /type: 'ResourceBindingChanged'/)
  assert.match(invalidationSource, /type: 'ExternalResourceSourcesChanged'/)
  assert.match(invalidationSource, /type: 'CanvasResourceChanged'/)
  assert.match(invalidationSource, /export function assetCandidateSelectedResult/)
  assert.match(invalidationSource, /export function resourceLibraryChangedResult/)
  assert.match(invalidationSource, /export function resourceBindingChangedResult/)
  assert.match(invalidationSource, /export function externalResourceSourcesChangedResult/)
  assert.match(invalidationSource, /export function canvasResourceChangedResult/)
  assert.match(invalidationSource, /export function invalidateResourceMutationResult/)
  assert.match(invalidationSource, /export function invalidateResourceMutationEvent/)
  assert.match(invalidationSource, /resourceMutationConsumerKeys/)
  assert.doesNotMatch(invalidationSource, /invalidateResourceCandidateChangedQueries/)
  assert.doesNotMatch(queryKeysSource, /export function invalidateResource(?:Library|Binding|CandidateTarget|Canvas|External)/)

  assert.match(generatedResultCardSource, /invalidateResourceMutationResult\(queryClient, assetCandidateSelectedResult\(\{ projectId \}\)\)/)
  assert.match(attachPanelSource, /invalidateResourceMutationResult\(queryClient, assetCandidateSelectedResult\(\{ projectId \}\)\)/)
  assert.match(resourcesPageSource, /resourceLibraryChangedResult/)
  assert.match(resourcesPageSource, /resourceBindingChangedResult/)
  assert.match(appSettingsSource, /queryKey: externalResourceKeys\.sources/)
  assert.match(canvasIntegrationSource, /canvasResourceChangedResult/)
  assert.match(canvasRuntimeSource, /canvasResourceChangedResult/)
  assert.doesNotMatch(
    generatedResultCardSource + attachPanelSource + resourcesPageSource + appSettingsSource + canvasIntegrationSource + canvasRuntimeSource,
    /invalidateResourceCandidateChangedQueries|invalidateAssetCandidateConsumers|invalidateResourceLibraryQueries|invalidateResourceBindingQueries|invalidateExternalResourceSources|invalidateCanvasResourceQueries|invalidateResourceCandidateTargetQueries/,
  )
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
