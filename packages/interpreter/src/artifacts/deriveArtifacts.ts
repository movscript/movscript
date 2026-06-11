import {
  deriveContentUnitArtifacts,
} from './contentProduction.js'
import { deriveAssetIndex } from './assetIndex.js'
import { deriveDomainTree } from './domainTree.js'
import { deriveImpactReport } from './impactReport.js'
import { derivePreviewTimelines } from './previewTimelines.js'
import { deriveRelationGraph } from './relationGraph.js'
import type {
  MovScriptWorkspaceArtifactsInput,
  MovScriptWorkspaceDerivedArtifacts,
} from './derivedArtifactTypes.js'

export {
  deriveAssetIndex,
  deriveDomainTree,
  deriveImpactReport,
  derivePreviewTimelines,
  deriveRelationGraph,
}

export type {
  MovScriptAssetIndexArtifact,
  MovScriptAssetIndexEntry,
  MovScriptDomainEntityRef,
  MovScriptDomainRelation,
  MovScriptDomainRelationType,
  MovScriptDomainTreeArtifact,
  MovScriptDomainTreeNode,
  MovScriptImpactReportArtifact,
  MovScriptImpactReportChangedEntity,
  MovScriptPreviewTimelineArtifact,
  MovScriptPreviewTimelineItem,
  MovScriptRelationGraphArtifact,
  MovScriptWorkspaceArtifactsInput,
  MovScriptWorkspaceDerivedArtifacts,
} from './derivedArtifactTypes.js'

export function deriveMovScriptWorkspaceArtifacts(input: MovScriptWorkspaceArtifactsInput): MovScriptWorkspaceDerivedArtifacts {
  const relationGraph = deriveRelationGraph(input.index)
  return {
    domainTree: deriveDomainTree(input.index),
    relationGraph,
    assetIndex: deriveAssetIndex(input.index),
    impactReport: deriveImpactReport(input.changedEntities, input.interpretationId, input.createdAt, input.index, relationGraph, input.semanticChanges),
    previewTimelines: derivePreviewTimelines(input.index),
    contentUnitArtifacts: deriveContentUnitArtifacts(input.index, { createdAt: input.createdAt }),
  }
}
