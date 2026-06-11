import {
  deriveMovScriptWorkspaceArtifacts,
} from '../artifacts/index.js'
import {
  deriveMovScriptWorkspaceDomainIndex,
  type MovScriptWorkspaceDocument,
} from '@movscript/workspace/indexer'
import {
  MOVSCRIPT_INTERPRET_CURRENT_DIR,
  MOVSCRIPT_INTERPRET_REVIEWS_DIR,
  MOVSCRIPT_ASSET_INDEX_PATH,
  MOVSCRIPT_DOMAIN_TREE_PATH,
  MOVSCRIPT_DOMAIN_INDEX_PATH,
  MOVSCRIPT_EDITOR_STATE_PATH,
  MOVSCRIPT_RELATION_GRAPH_PATH,
} from '@movscript/workspace/layout'
import {
  commitCheckpoint,
  resolveWorkspaceSource,
} from './sourceStore.js'
import {
  writeDebugArtifacts,
} from './debugArtifacts.js'
import {
  deriveV1RegenerationPlan,
  loadLatestInterpretManifest,
} from './regeneration.js'
import {
  interpretWorkspaceOverview,
  type MovScriptWorkspaceOverviewResult,
} from './overview.js'
import {
  inspectMovScriptWorkspace,
  reviewMovScriptWorkspace,
} from './review.js'
import type {
  MovScriptWorkspaceInterpretInput,
  MovScriptWorkspaceInterpretManifest,
  MovScriptWorkspaceInterpretResult,
  MovScriptWorkspaceRegenerationPlanResult,
} from './types.js'

export {
  inspectMovScriptWorkspace,
  reviewMovScriptWorkspace,
}

export type {
  ContentUnitSelectionValiditySnapshot,
  MovScriptBusinessSemanticKind,
  MovScriptEntityRef,
  MovScriptFieldChange,
  MovScriptProductionImpact,
  MovScriptSemanticChange,
  MovScriptSemanticChangeKind,
  MovScriptSemanticPropagation,
  MovScriptWorkspaceInterpretInput,
  MovScriptWorkspaceInterpretManifest,
  MovScriptWorkspaceInterpretResult,
  MovScriptWorkspaceBusinessChange,
  MovScriptWorkspaceChangedEntity,
  MovScriptWorkspaceChangedFile,
  MovScriptWorkspaceChangeState,
  MovScriptWorkspaceInspectionResult,
  MovScriptWorkspaceIssueSeverity,
  MovScriptWorkspaceRegenerationPlanResult,
  MovScriptWorkspaceRegenerationTarget,
  MovScriptWorkspaceReviewIssue,
  MovScriptWorkspaceReviewResult,
} from './types.js'

export async function overviewMovScriptWorkspace(input: MovScriptWorkspaceInterpretInput): Promise<MovScriptWorkspaceOverviewResult> {
  const now = input.now ?? new Date()
  const inspection = await inspectMovScriptWorkspace({ ...input, now })
  const source = await resolveWorkspaceSource(input.fileRepository)
  const latestInterpretation = await loadLatestInterpretManifest(input.fileRepository)
  const regeneration = await planMovScriptWorkspaceRegeneration({ ...input, now })
  return interpretWorkspaceOverview({
    createdAt: now.toISOString(),
    inspection,
    source,
    latestInterpretation,
    regeneration,
  })
}

export async function interpretMovScriptWorkspace(input: MovScriptWorkspaceInterpretInput): Promise<MovScriptWorkspaceInterpretResult> {
  const now = input.now ?? new Date()
  const review = await reviewMovScriptWorkspace({ ...input, now })
  if (!review.readyToInterpret) {
    return {
      schema: 'movscript.workspace-interpret-result.v1',
      operation: 'interpret',
      status: 'failed',
      review,
    }
  }

  const source = await resolveWorkspaceSource(input.fileRepository)
  const editFiles = source.files
  const documents = editFiles.map((file): MovScriptWorkspaceDocument => ({
    path: file.relativePath,
    data: parseWorkspaceDocument(file.path, file.content),
  }))
  const index = deriveMovScriptWorkspaceDomainIndex(documents)
  const interpretationId = interpretationIdFor(now)
  const checkpoint = await commitCheckpoint(input.fileRepository, editFiles, {
    now,
    message: input.commitMessage ?? `MovScript checkpoint ${interpretationId}`,
    initGitIfMissing: input.initGitIfMissing,
  })
  const artifacts = deriveMovScriptWorkspaceArtifacts({
    index,
    changedEntities: review.changedEntities,
    semanticChanges: review.semanticChanges,
    interpretationId,
    createdAt: now.toISOString(),
  })
  const impactReportPath = `${MOVSCRIPT_INTERPRET_REVIEWS_DIR}/impact-report_${interpretationId}.json`
  const manifest: MovScriptWorkspaceInterpretManifest = {
    schema: 'movscript.workspace-interpret.v1',
    interpretationId,
    interpretedAt: now.toISOString(),
    source: {
      sourcePath: source.rootPath,
      sourceMode: source.mode,
      sourceFileHashes: Object.fromEntries(editFiles.map((file) => [file.relativePath, file.hash])),
    },
    output: {
      currentPath: MOVSCRIPT_INTERPRET_CURRENT_DIR,
      domainIndexPath: MOVSCRIPT_DOMAIN_INDEX_PATH,
      domainTreePath: MOVSCRIPT_DOMAIN_TREE_PATH,
      editorStatePath: MOVSCRIPT_EDITOR_STATE_PATH,
      assetIndexPath: MOVSCRIPT_ASSET_INDEX_PATH,
      relationGraphPath: MOVSCRIPT_RELATION_GRAPH_PATH,
      impactReportPath,
    },
    review,
  }

  if (input.debugArtifacts !== false) {
    await writeDebugArtifacts(input.fileRepository, artifacts, index, manifest, impactReportPath)
  }

  return {
    schema: 'movscript.workspace-interpret-result.v1',
    operation: 'commitCheckpoint',
    status: 'interpreted',
    review,
    checkpoint,
    index,
    ...(input.debugArtifacts !== false ? { manifest } : {}),
  }
}

export async function planMovScriptWorkspaceRegeneration(input: MovScriptWorkspaceInterpretInput): Promise<MovScriptWorkspaceRegenerationPlanResult> {
  const now = input.now ?? new Date()
  const review = await reviewMovScriptWorkspace({ ...input, now })
  const latestInterpretation = await loadLatestInterpretManifest(input.fileRepository)
  return deriveV1RegenerationPlan({
    review,
    latestInterpretation,
    createdAt: now.toISOString(),
  })
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function interpretationIdFor(date: Date): string {
  return `interpret_${date.toISOString().replace(/[^0-9]/g, '')}`
}
