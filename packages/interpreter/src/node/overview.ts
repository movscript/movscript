import {
  sourceEntityKindFromRelativePath,
} from '../entityChanges/index.js'
import type {
  WorkspaceSourceSnapshot,
} from './sourceStore.js'
import type {
  LatestInterpretManifest,
  MovScriptRegenerationPlanResult,
} from './regeneration.js'

export interface MovScriptOverviewInspectionInput {
  changedEntities: Array<{
    entityKind: string
  }>
  issues: readonly unknown[]
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

export interface MovScriptWorkspaceOverviewResult {
  schema: 'movscript.workspace-overview.v1'
  operation: 'overview'
  createdAt: string
  workspace: {
    projectId?: string | number
    title?: string
    sourcePath: string
  }
  source: {
    mode: 'source'
    documentCount: number
    entityCount: number
    issueCount: number
    hasPendingEdits: boolean
    readyToInterpret: boolean
  }
  interpret: {
    status: 'missing' | 'current' | 'stale'
    lastInterpretationId?: string
    lastInterpretedAt?: string
    currentIsStale: boolean
  }
  changes: MovScriptOverviewInspectionInput['summary'] & {
    affectedEntityKinds: string[]
  }
  regeneration: MovScriptRegenerationPlanResult['summary']
  nextActions: string[]
}

export function interpretWorkspaceOverview(input: {
  createdAt: string
  inspection: MovScriptOverviewInspectionInput
  source: WorkspaceSourceSnapshot
  latestInterpretation?: LatestInterpretManifest
  regeneration: MovScriptRegenerationPlanResult
}): MovScriptWorkspaceOverviewResult {
  const project = projectInfoFromSource(input.source)
  const affectedEntityKinds = [...new Set(input.inspection.changedEntities.map((entity) => entity.entityKind))].sort()
  const interpretationStatus = !input.latestInterpretation
    ? 'missing'
    : input.inspection.summary.total > 0
      ? 'stale'
      : 'current'

  return {
    schema: 'movscript.workspace-overview.v1',
    operation: 'overview',
    createdAt: input.createdAt,
    workspace: {
      ...(project.projectId !== undefined ? { projectId: project.projectId } : {}),
      ...(project.title !== undefined ? { title: project.title } : {}),
      sourcePath: input.source.rootPath,
    },
    source: {
      mode: input.source.mode,
      documentCount: input.source.files.length,
      entityCount: input.source.files.filter((file) => sourceEntityKindFromRelativePath(file.relativePath) !== undefined).length,
      issueCount: input.inspection.issues.length,
      hasPendingEdits: input.inspection.summary.total > 0,
      readyToInterpret: input.inspection.readyToInterpret,
    },
    interpret: {
      status: interpretationStatus,
      ...(input.latestInterpretation ? { lastInterpretationId: input.latestInterpretation.manifest.interpretationId, lastInterpretedAt: input.latestInterpretation.manifest.interpretedAt } : {}),
      currentIsStale: interpretationStatus !== 'current',
    },
    changes: {
      ...input.inspection.summary,
      affectedEntityKinds,
    },
    regeneration: input.regeneration.summary,
    nextActions: nextActionsForOverview(input.inspection, input.regeneration, interpretationStatus),
  }
}

function projectInfoFromSource(source: WorkspaceSourceSnapshot): { projectId?: string | number; title?: string } {
  const projectFile = source.files.find((file) => file.relativePath === 'project.json')
  const project = projectFile ? parseWorkspaceDocument(projectFile.path, projectFile.content) : undefined
  if (!isRecord(project)) return {}
  const projectId = idField(project.project_id ?? project.ID ?? project.id)
  return {
    ...(projectId !== undefined ? { projectId } : {}),
    ...(typeof project.title === 'string' ? { title: project.title } : {}),
  }
}

function nextActionsForOverview(
  inspection: MovScriptOverviewInspectionInput,
  regeneration: MovScriptRegenerationPlanResult,
  interpretationStatus: MovScriptWorkspaceOverviewResult['interpret']['status'],
): string[] {
  if (!inspection.readyToInterpret) return ['inspect']
  if (interpretationStatus !== 'current') return ['inspect', 'interpret']
  if (regeneration.summary.staleContentUnits > 0 || regeneration.summary.affectedContentUnits > 0) return ['regen plan']
  return []
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
