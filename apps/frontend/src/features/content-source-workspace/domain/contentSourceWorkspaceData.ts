import type { ContentSourceWorkspaceData } from '@movscript/core/content'

import {
  audioCuesByMoment as fixtureAudioCuesByMoment,
  assetReferenceUnits as fixtureAssetReferenceUnits,
  expressionUnitsByMoment as fixtureExpressionUnitsByMoment,
  hierarchyTree as fixtureHierarchyTree,
  previewMoments as fixturePreviewMoments,
  shotWorkspaceDetails as fixtureShotWorkspaceDetails,
} from './sourceWorkspaceFixtures'

export type {
  ContentSourceWorkspaceData,
  CreatedContentSourceCandidate,
} from '@movscript/core/content'

export const fixtureContentSourceWorkspaceData: ContentSourceWorkspaceData = {
  source: 'fixture',
  hierarchyTree: fixtureHierarchyTree,
  previewMoments: fixturePreviewMoments,
  expressionUnitsByMoment: fixtureExpressionUnitsByMoment,
  audioCuesByMoment: fixtureAudioCuesByMoment,
  shotWorkspaceDetails: fixtureShotWorkspaceDetails,
  assetReferenceUnits: fixtureAssetReferenceUnits,
}
