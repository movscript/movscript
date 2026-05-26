import assert from 'node:assert/strict'
import test from 'node:test'

import { refreshPreProductionWorkbenchContext } from './preProductionRefreshController'

test('pre-production refresh covers references, asset slots, candidates, and opened drafts', async () => {
  const invalidated: unknown[][] = []
  let settingRefetches = 0
  let assetRefetches = 0

  await refreshPreProductionWorkbenchContext({
    projectId: 42,
    queryClient: {
      invalidateQueries: async ({ queryKey }) => {
        invalidated.push(queryKey)
      },
    },
    refetchSettingDrafts: async () => {
      settingRefetches += 1
    },
    refetchAssetProposalDrafts: async () => {
      assetRefetches += 1
    },
  })

  assert.deepEqual(invalidated, [
    ['pre-production-creative-references', 42],
    ['semantic-asset-slots-page', 42],
    ['semantic-asset-slot-candidates-page', 42],
  ])
  assert.equal(settingRefetches, 1)
  assert.equal(assetRefetches, 1)
})
