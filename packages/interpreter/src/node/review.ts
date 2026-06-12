import {
  deriveMovScriptWorkspaceArtifacts,
} from '../artifacts/index.js'
import {
  buildSourceDomainGraph,
  changedEntitiesFromFiles,
} from '../entityChanges/index.js'
import {
  diffMovScriptFileSnapshots,
} from '../fileChanges/index.js'
import {
  productionImpactsFromSemanticChanges,
} from '../impact/index.js'
import {
  businessChangesFromChangedEntities,
  summarizeReview,
} from '../reviewSummary/index.js'
import {
  semanticChangesFromEntityChanges,
} from '../semanticChanges/index.js'
import {
  validateEditableFiles,
  validateSourceDomainGraph,
} from '../sourceValidation/index.js'
import {
  deriveMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '@movscript/workspace/indexer'
import {
  overlayMovScriptDecisionDocuments,
} from '@movscript/workspace/repository'
import {
  MOVSCRIPT_INTERPRET_CURRENT_DIR,
  normalizeWorkspacePath,
} from '@movscript/workspace/layout'
import {
  loadCheckpointSourceSnapshots,
  resolveWorkspaceSource,
  workspaceSnapshotId,
  type WorkspaceFileSnapshot,
} from './sourceStore.js'
import {
  validateGitFileChangeCoverage,
} from './fileCoverage.js'
import type {
  MovScriptWorkspaceInterpretInput,
  MovScriptWorkspaceChangedFile,
  MovScriptWorkspaceInspectionResult,
  MovScriptWorkspaceReviewResult,
} from './types.js'

export async function reviewMovScriptWorkspace(input: MovScriptWorkspaceInterpretInput): Promise<MovScriptWorkspaceReviewResult> {
  const now = input.now ?? new Date()
  const sourceOptions = workspaceSourceOptions(input)
  const source = await resolveWorkspaceSource(input.fileRepository, sourceOptions)
  const editFiles = source.files
  const baseline = await loadCheckpointSourceSnapshots(input.fileRepository, input.commit ?? input.checkpointHash, sourceOptions)
  const currentFiles = baseline.files
  const changedFiles = diffWorkspaceFiles(editFiles, currentFiles, baseline.basePath)
  const sourceGraph = buildSourceDomainGraph(editFiles)
  const currentGraph = buildSourceDomainGraph(currentFiles)
  const changedEntities = changedEntitiesFromFiles(changedFiles, sourceGraph, currentGraph)
  const issues = [
    ...validateEditableFiles(editFiles),
    ...validateSourceDomainGraph(sourceGraph),
    ...await validateGitFileChangeCoverage(input.fileRepository, baseline, changedFiles, sourceOptions),
  ]
  const semanticChanges = semanticChangesFromEntityChanges(changedEntities)
  const sourceDocuments = editFiles.map((file): MovScriptWorkspaceDocument => ({
    path: file.relativePath,
    data: parseWorkspaceDocument(file.path, file.content),
  }))
  const documents = await overlayMovScriptDecisionDocuments(sourceDocuments, input.decisionStore)
  const index = deriveMovScriptWorkspaceDomainIndex(documents)
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities,
    semanticChanges,
    interpretationId: `review_${now.toISOString().replace(/[-:.TZ]/g, '')}`,
    createdAt: now.toISOString(),
    sourceIssues: issues,
  })
  const selectionValidity = artifacts.contentUnitArtifacts.map((artifact) => ({
    contentUnitId: artifact.contentUnitId,
    contentUnitPath: entityDir(artifact.contentUnitPath),
    selected: artifact.selectionValidity.selected,
    stale: artifact.selectionValidity.stale,
    candidateId: artifact.selectionValidity.candidate_id,
    resourceId: artifact.selectionValidity.resource_id,
    staleReasons: artifact.selectionValidity.stale_reasons,
  }))
  const staleSelections = selectionValidity.filter((selection) => selection.stale)
  const productionImpacts = productionImpactsFromSemanticChanges(semanticChanges, artifacts, staleSelections)
  const businessChanges = businessChangesFromChangedEntities(changedEntities, sourceGraph, currentGraph, semanticChanges)
  const summary = summarizeReview(changedFiles, businessChanges, issues)
  return {
    schema: 'movscript.workspace-review.v1',
    operation: 'review',
    basePath: baseline.basePath,
    comparisonBase: {
      ...(baseline.checkpointHash ? { from: baseline.checkpointHash } : {}),
      source: baseline.source,
      workspace: {
        id: workspaceSnapshotId(source.files),
        kind: 'working_tree',
      },
    },
    sourcePath: source.rootPath,
    sourceMode: source.mode,
    createdAt: now.toISOString(),
    changedFiles,
    changedEntities,
    entityChanges: changedEntities,
    semanticChanges,
    productionImpacts,
    selectionValidity,
    staleSelections,
    productionWorkPlan: artifacts.productionWorkPlan,
    reshootTargets: [],
    businessChanges,
    issues,
    readyToInterpret: summary.errors === 0,
    summary,
  }
}

export async function inspectMovScriptWorkspace(input: MovScriptWorkspaceInterpretInput): Promise<MovScriptWorkspaceInspectionResult> {
  const review = await reviewMovScriptWorkspace(input)
  return {
    ...review,
    schema: 'movscript.workspace-inspection.v1',
    operation: 'inspect',
  }
}

function entityDir(path: string): string {
  return normalizeWorkspacePath(path).replace(/\/[^/]+$/, '')
}

function workspaceSourceOptions(input: MovScriptWorkspaceInterpretInput): { includeContentUnitDecisionDocuments?: boolean } {
  return {
    includeContentUnitDecisionDocuments: input.decisionStore ? false : true,
  }
}

function diffWorkspaceFiles(
  editFiles: WorkspaceFileSnapshot[],
  currentFiles: WorkspaceFileSnapshot[],
  basePath = MOVSCRIPT_INTERPRET_CURRENT_DIR,
): MovScriptWorkspaceChangedFile[] {
  return diffMovScriptFileSnapshots(editFiles, currentFiles, { basePath })
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}
