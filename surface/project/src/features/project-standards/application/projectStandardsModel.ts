import {
  getSurfaceProject as getProject,
  listSurfaceSemanticEntities as listSemanticEntities,
  semanticEntityConfig,
  type SurfaceSemanticEntityKind,
  type SemanticEntityRecord,
} from '@movscript/shared/semantic-entities'
import type { WorkspaceArtifact } from '@movscript/shared'
import {
  CORE_STANDARD_DEFS,
  coreStandardText,
  normalizeProjectPromptRule,
  parseProjectStyleRecord,
  projectPromptRules,
  workspaceEntryFieldText,
} from './projectStandardsPromptRules'

export * from './projectStandardsPromptRules'

export type WorkspaceRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  content?: string
  aspect_ratio?: string
  visual_style?: string
  project_style?: string
  total_episodes?: number
  priority?: string
  production_id?: number | null
  setting_id?: number | null
  owner_type?: string
  owner_id?: number | null
  source_type?: string
  kind?: string
  role?: string
}

export interface WorkspaceData {
  project: WorkspaceRecord | null
  productions: WorkspaceRecord[]
  settings: WorkspaceRecord[]
  creativeRelationships: WorkspaceRecord[]
  settingUsages: WorkspaceRecord[]
  assetSlots: WorkspaceRecord[]
  assetSlotCandidates: WorkspaceRecord[]
  segments: WorkspaceRecord[]
  sceneMoments: WorkspaceRecord[]
  contentUnits: WorkspaceRecord[]
}

export interface ProjectStandardsWorkspaceArtifactView {
  summary: string
  impactNotes: string[]
  debug: {
    scope?: string
    pageKey?: string
    workspaceId?: string
    workspaceUpdatedAt?: string
    workspaceStatus?: string
    sourceRunId?: string
    sourceThreadId?: string
  }
}

export interface ProjectStyleWorkspaceRow {
  key: string
  label: string
  before: string
  after: string
  changed: boolean
  kind?: 'core' | 'custom'
}

export interface ProjectStandardsReviewWorkspace {
  workspace: WorkspaceArtifact
  workspaceView: ProjectStandardsWorkspaceArtifactView | null
  styleRows: ProjectStyleWorkspaceRow[]
}

export const emptyData: WorkspaceData = {
  project: null,
  productions: [],
  settings: [],
  creativeRelationships: [],
  settingUsages: [],
  assetSlots: [],
  assetSlotCandidates: [],
  segments: [],
  sceneMoments: [],
  contentUnits: [],
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function isProjectStandardsWorkspaceHelperWorkspace(workspace: WorkspaceArtifact) {
  if (workspace.kind !== 'project_standards_workspace') return false
  const metadata = isRecord(workspace.metadata) ? workspace.metadata : {}
  return typeof metadata.sourceWorkspaceId === 'string' && metadata.sourceWorkspaceId.trim().length > 0
}

export function parseProjectStandardsWorkspaceArtifact(workspace: WorkspaceArtifact, pageKey?: string): ProjectStandardsWorkspaceArtifactView | null {
  try {
    const content = JSON.parse(workspace.content) as Record<string, unknown>
    const impactNotes = [
      ...asRecordArray(content.impact_notes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...asRecordArray(content.impactNotes).map((item) => asString(item.note ?? item.text ?? item.content ?? item.summary)),
      ...(Array.isArray(content.impact_notes) ? content.impact_notes.map((item) => asString(item)).filter(Boolean) : []),
      ...(Array.isArray(content.impactNotes) ? content.impactNotes.map((item) => asString(item)).filter(Boolean) : []),
    ].filter(Boolean)

    return {
      summary: asString(content.summary, '暂无摘要'),
      impactNotes,
      debug: {
        scope: asString(content.scope, ''),
        pageKey,
        workspaceId: workspace.id,
        workspaceUpdatedAt: workspace.updatedAt,
        workspaceStatus: workspace.status,
        sourceRunId: asString(workspace.createdByRunId, asString(content.sourceRunId, '')),
        sourceThreadId: asString(workspace.createdByThreadId, asString(content.sourceThreadId, '')),
      },
    }
  } catch {
    return null
  }
}

export function buildProjectStyleApplyPayload(workspace: WorkspaceArtifact) {
  const content = JSON.parse(workspace.content) as Record<string, unknown>
  const workspacePayload = isRecord(content.workspace) ? content.workspace : {}
  return JSON.stringify({
    ...content,
    mode: 'snapshot',
    workspace: {
      project_style: isRecord(workspacePayload.project_style) ? workspacePayload.project_style : {},
    },
  }, null, 2)
}

export function parseProjectStyleWorkspaceRows(workspace: WorkspaceArtifact, project?: WorkspaceRecord | null): ProjectStyleWorkspaceRow[] {
  try {
    const content = JSON.parse(workspace.content) as Record<string, unknown>
    const workspacePayload = isRecord(content.workspace) ? content.workspace : {}
    const projectStyle = isRecord(workspacePayload.project_style) ? workspacePayload.project_style : {}
    const currentStyle = parseProjectStyleRecord(project)
    const coreRows = CORE_STANDARD_DEFS.flatMap(({ key, label }) => {
      const value = projectStyle[key]
      const text = workspaceEntryFieldText(value)
      if (!text) return []
      const before = workspaceEntryFieldText(key === 'aspect_ratio'
        ? project?.aspect_ratio ?? currentStyle[key]
        : key === 'visual_style'
          ? project?.visual_style ?? currentStyle[key]
          : currentStyle[key])
      return [{ key, label, before, after: text, changed: before !== text, kind: 'core' as const }]
    })
    const currentRules = new Map(projectPromptRules(project).map((rule) => [rule.id || rule.key, rule]))
    const customRows = asRecordArray(projectStyle.custom_rules).flatMap((item, index) => {
      const rule = normalizeProjectPromptRule(item, index)
      if (!rule) return []
      const current = currentRules.get(rule.id) ?? currentRules.get(rule.key)
      const before = current?.value ?? ''
      return [{
        key: `custom:${rule.id}`,
        label: `扩展：${rule.label}`,
        before,
        after: rule.value,
        changed: before !== rule.value || current?.enabled !== rule.enabled || current?.prompt_role !== rule.prompt_role,
        kind: 'custom' as const,
      }]
    })
    return [...coreRows, ...customRows]
  } catch {
    return []
  }
}

export function projectStandardRows(project?: WorkspaceRecord | null): ProjectStyleWorkspaceRow[] {
  return CORE_STANDARD_DEFS.map((item) => ({
    key: item.key,
    label: item.label,
    before: '',
    after: coreStandardText(project, item.key),
    changed: false,
    kind: 'core' as const,
  }))
}

export function projectStandardMissingLabels(project?: WorkspaceRecord | null) {
  return projectStandardRows(project)
    .filter((row) => !row.after)
    .map((row) => row.label)
}

export function projectStandardFilledCount(project?: WorkspaceRecord | null) {
  return projectStandardRows(project).filter((row) => row.after).length
}

async function safeList(projectId: number, kind: SurfaceSemanticEntityKind): Promise<WorkspaceRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as WorkspaceRecord[]
  } catch (error) {
    console.warn(`Failed to load project workspace entity: ${kind}`, error)
    return []
  }
}

export async function loadProjectStandardsWorkspaceData(projectId: number): Promise<WorkspaceData> {
  const [
    project,
    productions,
    settings,
    creativeRelationships,
    settingUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
  ] = await Promise.all([
    getProject(projectId).catch((error) => {
      if (!isWorkspaceProjectNotFoundError(projectId, error)) {
        console.warn('Failed to load project globals', error)
      }
      return null
    }),
    safeList(projectId, 'productions'),
    safeList(projectId, 'settings'),
    safeList(projectId, 'creativeRelationships'),
    safeList(projectId, 'settingUsages'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'assetSlotCandidates'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'contentUnits'),
  ])

  return {
    project: project as WorkspaceRecord | null,
    productions,
    settings,
    creativeRelationships,
    settingUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
  }
}

function isWorkspaceProjectNotFoundError(projectId: number, error: unknown): boolean {
  return error instanceof Error && error.message === `MovScript workspace project ${projectId} not found`
}
