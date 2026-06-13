import type {
  MovScriptEntityChange,
  MovScriptEntityFieldChange,
} from '../entityChanges/index.js'
import type {
  MovScriptFileChange,
  MovScriptFileChangeState,
} from '../fileChanges/index.js'
import type {
  MovScriptBusinessChange,
} from '../reviewSummary/index.js'
import type {
  MovScriptBusinessSemanticKind,
  MovScriptEntityRef,
  MovScriptSemanticChange,
  MovScriptSemanticChangeKind,
  MovScriptSemanticPropagation,
} from '../semanticChanges/index.js'
import type {
  MovScriptSourceValidationIssue,
} from '../sourceValidation/index.js'
import type {
  MovScriptWorkspaceDomainIndex,
} from '@movscript/workspace/indexer'
import type {
  MovScriptDecisionStore,
  MovScriptWorkspaceFileRepository,
} from '@movscript/workspace/repository'
import type {
  MOVSCRIPT_ASSET_INDEX_PATH,
  MOVSCRIPT_INTERPRET_CURRENT_DIR,
  MOVSCRIPT_DOMAIN_INDEX_PATH,
  MOVSCRIPT_DOMAIN_TREE_PATH,
  MOVSCRIPT_EDITOR_STATE_PATH,
  MOVSCRIPT_RELATION_GRAPH_PATH,
} from '@movscript/workspace/layout'
import type {
  MovScriptProductionWorkPlan,
} from '../artifacts/index.js'
import type {
  MovScriptRegenerationPlanResult,
  MovScriptRegenerationPlanTarget,
} from './regeneration.js'

export type MovScriptWorkspaceChangeState = MovScriptFileChangeState
export type MovScriptWorkspaceIssueSeverity = 'error' | 'warning'

export type {
  MovScriptBusinessSemanticKind,
  MovScriptEntityRef,
  MovScriptSemanticChange,
  MovScriptSemanticChangeKind,
  MovScriptSemanticPropagation,
}

export interface MovScriptFieldChange extends MovScriptEntityFieldChange {}

export interface MovScriptProductionImpact {
  contentUnit?: {
    id?: string | number
    path?: string
  }
  kind: 'self_selection_stale' | 'downstream_reference_changed' | 'diagnostic_only'
  businessKinds: MovScriptBusinessSemanticKind[]
  businessImpacts: string[]
  sourceChanges: MovScriptSemanticChange[]
  reshootRequired: false
}

export interface MovScriptWorkspaceChangedFile extends MovScriptFileChange {}

export interface MovScriptWorkspaceReviewIssue extends MovScriptSourceValidationIssue {}

export interface MovScriptWorkspaceChangedEntity extends MovScriptEntityChange {}

export interface MovScriptWorkspaceBusinessChange extends MovScriptBusinessChange {}

export interface ContentUnitSelectionValiditySnapshot {
  contentUnitId?: string | number
  contentUnitPath?: string
  selected: boolean
  stale: boolean
  candidateId?: string | number
  resourceId?: number
  staleReasons?: string[]
}

export interface MovScriptWorkspaceReviewResult {
  schema: 'movscript.workspace-review.v1'
  operation: 'review'
  basePath: string
  comparisonBase: {
    from?: string
    source: 'git' | 'snapshot' | 'empty'
    workspace: {
      id: string
      kind: 'working_tree'
    }
  }
  sourcePath: string
  sourceMode: 'source'
  createdAt: string
  changedFiles: MovScriptWorkspaceChangedFile[]
  changedEntities: MovScriptWorkspaceChangedEntity[]
  entityChanges: MovScriptWorkspaceChangedEntity[]
  semanticChanges: MovScriptSemanticChange[]
  productionImpacts: MovScriptProductionImpact[]
  selectionValidity: ContentUnitSelectionValiditySnapshot[]
  staleSelections: ContentUnitSelectionValiditySnapshot[]
  productionWorkPlan?: MovScriptProductionWorkPlan
  reshootTargets: []
  businessChanges: MovScriptWorkspaceBusinessChange[]
  issues: MovScriptWorkspaceReviewIssue[]
  readyToInterpret: boolean
  summary: {
    total: number
    added: number
    modified: number
    deleted: number
    businessChanges: number
    errors: number
    warnings: number
  }
}

export interface MovScriptWorkspaceInspectionResult extends Omit<MovScriptWorkspaceReviewResult, 'schema' | 'operation'> {
  schema: 'movscript.workspace-inspection.v1'
  operation: 'inspect'
}

export interface MovScriptWorkspaceInterpretManifest {
  schema: 'movscript.workspace-interpret.v1'
  interpretationId: string
  interpretedAt: string
  source: {
    sourcePath: string
    sourceMode: 'source'
    sourceFileHashes: Record<string, string>
  }
  output: {
    currentPath: typeof MOVSCRIPT_INTERPRET_CURRENT_DIR
    domainIndexPath: typeof MOVSCRIPT_DOMAIN_INDEX_PATH
    domainTreePath: typeof MOVSCRIPT_DOMAIN_TREE_PATH
    editorStatePath: typeof MOVSCRIPT_EDITOR_STATE_PATH
    assetIndexPath: typeof MOVSCRIPT_ASSET_INDEX_PATH
    relationGraphPath: typeof MOVSCRIPT_RELATION_GRAPH_PATH
    impactReportPath: string
  }
  review: MovScriptWorkspaceReviewResult
}

export interface MovScriptWorkspaceRegenerationTarget extends MovScriptRegenerationPlanTarget {}

export interface MovScriptWorkspaceRegenerationPlanResult extends MovScriptRegenerationPlanResult {}

export interface MovScriptWorkspaceInterpretResult {
  schema: 'movscript.workspace-interpret-result.v1'
  operation: 'interpret'
  status: 'refreshed' | 'failed'
  review: MovScriptWorkspaceReviewResult
  index?: MovScriptWorkspaceDomainIndex
  productionWorkPlan?: MovScriptProductionWorkPlan
  manifest?: MovScriptWorkspaceInterpretManifest
}

export interface MovScriptWorkspaceInterpretInput {
  fileRepository: MovScriptWorkspaceFileRepository
  decisionStore?: Pick<MovScriptDecisionStore, 'getContentUnitDecision'>
  now?: Date
  commit?: string
  checkpointHash?: string
  debugArtifacts?: boolean
}
