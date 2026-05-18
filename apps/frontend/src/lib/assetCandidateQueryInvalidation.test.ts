import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

import { invalidateAssetCandidateConsumers } from './assetCandidateQueryInvalidation.ts'

test('invalidateAssetCandidateConsumers refreshes candidate state across project surfaces', () => {
  const queryKeys: unknown[][] = []
  invalidateAssetCandidateConsumers({
    invalidateQueries: ({ queryKey }) => queryKeys.push(queryKey),
  }, 123)

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
    ['project-overview', 123],
    ['project-workspace', 123],
    ['production-frame', 123],
    ['workbench', 'assets', 123],
    ['workbench', 'production', 123],
  ])
})

test('invalidateAssetCandidateConsumers skips missing projects', () => {
  const queryKeys: unknown[][] = []
  invalidateAssetCandidateConsumers({
    invalidateQueries: ({ queryKey }) => queryKeys.push(queryKey),
  })

  assert.deepEqual(queryKeys, [])
})

test('candidate creation entry points share candidate consumer invalidation', () => {
  const preProduction = readFileSync(resolve('src/pages/pre-production/PreProductionPage.tsx'), 'utf8')
  const workbench = readFileSync(resolve('src/pages/workbench/WorkbenchPage.tsx'), 'utf8')
  const agentBinding = readFileSync(resolve('src/lib/agentGeneratedResourceBinding.ts'), 'utf8')
  const tasks = readFileSync(resolve('src/pages/project/tasks/TasksPage.tsx'), 'utf8')

  assert.match(preProduction, /invalidateAssetCandidateConsumers\(queryClient,\s*projectId\)/)
  assert.match(preProduction, /invalidateAssetCandidateConsumers\(options\.queryClient,\s*options\.projectId\)/)
  assert.match(workbench, /invalidateAssetCandidateConsumers\(queryClient,\s*projectId\)/)
  assert.match(agentBinding, /invalidateAssetCandidateConsumers\(queryClient,\s*projectId\)/)
  assert.match(tasks, /invalidateAssetCandidateConsumers\(qc,\s*projectId\)/)
})
