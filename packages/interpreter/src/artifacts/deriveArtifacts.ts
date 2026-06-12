import {
  deriveContentUnitArtifacts,
} from './contentProduction.js'
import { deriveAssetIndex } from './assetIndex.js'
import { deriveDomainTree } from './domainTree.js'
import { deriveImpactReport } from './impactReport.js'
import { derivePreviewTimelines } from './previewTimelines.js'
import { deriveProductionWorkPlan } from './productionWorkPlan.js'
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
  deriveProductionWorkPlan,
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
  MovScriptProductionActor,
  MovScriptProductionWorkAction,
  MovScriptProductionWorkItem,
  MovScriptProductionWorkItemBlocker,
  MovScriptProductionWorkPlan,
  MovScriptProductionWorkPlanSourceIssue,
  MovScriptRelationGraphArtifact,
  MovScriptWorkspaceArtifactsInput,
  MovScriptWorkspaceDerivedArtifacts,
} from './derivedArtifactTypes.js'

export function deriveMovScriptWorkspaceArtifacts(input: MovScriptWorkspaceArtifactsInput): MovScriptWorkspaceDerivedArtifacts {
  const relationGraph = deriveRelationGraph(input.index)
  const impactReport = deriveImpactReport(input.changedEntities, input.interpretationId, input.createdAt, input.index, relationGraph, input.semanticChanges)
  const contentUnitArtifacts = deriveContentUnitArtifacts(input.index, { createdAt: input.createdAt })
  return {
    domainTree: deriveDomainTree(input.index),
    relationGraph,
    assetIndex: deriveAssetIndex(input.index),
    impactReport,
    previewTimelines: derivePreviewTimelines(input.index),
    contentUnitArtifacts,
    productionWorkPlan: deriveProductionWorkPlan({
      index: input.index,
      contentUnitArtifacts,
      impactReport,
      sourceIssues: input.sourceIssues,
      changedEntities: input.changedEntities,
      interpretationId: input.interpretationId,
      createdAt: input.createdAt,
    }),
  }
}
