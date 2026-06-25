import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import {
  assetCandidateSelectedResult,
  canvasResourceChangedResult,
  externalResourceSourcesChangedResult,
  invalidateResourceMutationResult,
  resourceBindingChangedResult,
  resourceLibraryChangedResult,
} from './resourceMutationInvalidation'

test('resource candidate changed invalidation refreshes affected project surfaces', () => {
  const queryKeys: readonly unknown[][] = []
  const result = assetCandidateSelectedResult({
    projectId: 123,
    changedIds: ['candidate-1'],
    changedPaths: ['content_units/cu-1.json'],
    snapshotVersion: 7,
  })

  invalidateResourceMutationResult({
    invalidateQueries: ({ queryKey }) => queryKeys.push(queryKey),
  }, result)

  assert.equal(result.event.type, 'AssetCandidateSelected')
  assert.deepEqual(result.changedIds, ['candidate-1'])
  assert.deepEqual(result.changedPaths, ['content_units/cu-1.json'])
  assert.equal(result.snapshotVersion, 7)

  assert.deepEqual(queryKeys, [
    ['work-targets', 123, 'asset-slots'],
    ['work-targets', 123, 'asset-slot-candidates'],
    ['work-targets', 123, 'keyframes'],
    ['semantic-asset-slot-candidates-page', 123],
    ['semantic-asset-slots-page', 123],
    ['semantic-keyframes-page', 123],
    ['semantic-candidate-decisions-page', 123],
    ['semantic-review-events-page', 123],
    ['semantic-content-positioning', 123, 'keyframes'],
    ['semantic-content-positioning', 123],
    ['semantic-scene-moment-page', 123],
    ['semantic-segment-workspace', 123],
    ['project-workspace', 123],
    ['production-frame', 123],
    ['workbench', 'assets', 123],
    ['workbench', 'production', 123],
    ['resource-candidate-targets', 123],
    ['agent-generated-candidate-targets', 123],
  ])
})

test('resource domain mutation results refresh their owned query surfaces', () => {
  const queryKeys: readonly unknown[][] = []
  const queryClient = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => queryKeys.push(queryKey),
  }

  invalidateResourceMutationResult(queryClient, resourceLibraryChangedResult({ changedIds: [10] }))
  invalidateResourceMutationResult(queryClient, resourceBindingChangedResult({ projectId: 20, changedIds: [30] }))
  invalidateResourceMutationResult(queryClient, externalResourceSourcesChangedResult({ changedIds: [40] }))
  invalidateResourceMutationResult(queryClient, canvasResourceChangedResult({ changedIds: [50] }))

  assert.deepEqual(queryKeys, [
    ['resources'],
    ['resource-bindings'],
    ['resource-bindings', 20, 'library-scope'],
    ['external-resource-sources'],
    ['canvas-resource-shelf', 'resources'],
    ['canvas-node-resources'],
  ])
})

test('candidate creation entry points use resource domain invalidation', () => {
  const agentBinding = readFileSync(resolve('src/features/agent/domain/agentGeneratedResourceBinding.ts'), 'utf8')
  const generatedResultCard = readFileSync(resolve('src/features/agent/components/GeneratedResultCard.tsx'), 'utf8')
  const attachPanel = readFileSync(resolve('../../surface/resource/src/resourceCandidateAttachPanel.tsx'), 'utf8')

  assert.doesNotMatch(agentBinding, /invalidateResourceMutationResult|assetCandidateSelectedResult/)
  assert.match(generatedResultCard, /invalidateResourceMutationResult\(queryClient, assetCandidateSelectedResult\(\{ projectId \}\)\)/)
  assert.match(attachPanel, /invalidateResourceMutationResult\(queryClient, assetCandidateSelectedResult\(\{ projectId \}\)\)/)
  assert.doesNotMatch(agentBinding + generatedResultCard + attachPanel, /invalidateAssetCandidateConsumers|invalidateResourceCandidateChangedQueries|invalidateResourceCandidateTargetQueries/)
})
