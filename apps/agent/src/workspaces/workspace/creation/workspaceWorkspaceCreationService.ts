import { WORKSPACE_CONTENT_SCHEMA_IDS } from '@movscript/workspaces'
import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { AgentRun, JSONValue } from '../../../state/shared/types.js'
import {
  type AgentWorkspaceKind,
  type AgentWorkspaceSource,
  type AgentWorkspaceStore,
  type AgentWorkspaceTarget,
} from '../../store/workspaceStore.js'
import {
  isValidAgentEntityId,
  isValidAgentProjectId,
  isValidAgentReferenceId,
} from '../../../context/runtime/runtimeContext.js'
import {
  normalizeAssetWorkspaceSnapshotSlot,
  normalizeAssetWorkspaceSnapshotSlots,
  normalizeSettingWorkspaceSnapshotReferences,
  normalizedNumber,
} from '../snapshot/workspaceSnapshotNormalization.js'

interface PreparedWorkspaceWorkspaceContent {
  content: string
  seed?: JSONValue
  hydratedWorkspaceBase?: boolean
  seededWorkspaceSnapshot?: boolean
}

export async function createWorkspaceWorkspace(
  workspaceStore: AgentWorkspaceStore,
  run: AgentRun,
  workspaceSnapshotHydrationPort: WorkspaceWorkspaceSnapshotHydrationPort,
  args: Record<string, JSONValue>,
  signal?: AbortSignal,
): Promise<JSONValue> {
  const kind = normalizeWorkspaceWorkspaceKind(args.kind)
  if (!kind) throw new Error('create_workspace requires kind')
  const context = isJSONRecord(run.metadata?.context) ? run.metadata.context : undefined
  const pageContext = extractPageContext(run)
  const contextProject = isJSONRecord(context?.project) ? context.project : undefined
  const projectId = projectIdField(args.projectId)
    ?? projectIdField(args.project_id)
    ?? projectIdField(contextProject?.id)
    ?? projectIdField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_standards_workspace' && projectId === undefined) {
    throw new Error('create_workspace requires projectId for project_standards_workspace')
  }
  const target = normalizeWorkspaceWorkspaceTarget(args.target)
    ?? inferWorkspaceWorkspaceTarget(kind, projectId, context, pageContext, args)
  const title = stringField(args.title) ?? defaultWorkspaceWorkspaceTitle(kind, projectId, target)
  const rawContent = normalizeWorkspaceWorkspaceContent(args.content)
  if (rawContent === undefined) throw new Error('create_workspace requires content')
  const prepared = await prepareWorkspaceWorkspaceContent({
    kind,
    content: rawContent,
    target,
    workspaceSnapshotHydrationPort,
    signal,
  })
  const content = prepared.content
  validateStructuredWorkspaceWorkspaceContent(kind, content)
  const source = normalizeWorkspaceWorkspaceSource(args.source, run, context, pageContext)
  const seed = args.seed ?? prepared.seed
  const workspace = workspaceStore.createWorkspace({
    projectId,
    kind,
    title,
    content,
    source,
    target,
    seed,
    createdByRunId: run.id,
    createdByThreadId: run.threadId,
    metadata: {
      ...(isJSONRecord(args.metadata) ? args.metadata : {}),
      workspace: true,
      workspaceKind: kind,
      producer: 'conversation',
      ...(projectId !== undefined ? { projectId } : {}),
      ...(isJSONRecord(target) ? { target } : {}),
      ...(typeof source.pageKey === 'string' ? { pageKey: source.pageKey } : {}),
      ...(prepared.hydratedWorkspaceBase ? { workspaceBaseHydrated: true } : {}),
      ...(prepared.seededWorkspaceSnapshot ? { workspaceSnapshotSeeded: true } : {}),
    },
  })
  return {
    workspaceRef: workspace.id,
    workspaceId: workspace.id,
    workspace: workspace as unknown as JSONValue,
    status: 'created',
    message: 'Created a local workspace review workspace from the conversation.',
  } as unknown as JSONValue
}

async function prepareWorkspaceWorkspaceContent(input: {
  kind: AgentWorkspaceKind
  content: string
  target?: AgentWorkspaceTarget
  workspaceSnapshotHydrationPort: WorkspaceWorkspaceSnapshotHydrationPort
  signal?: AbortSignal
}): Promise<PreparedWorkspaceWorkspaceContent> {
  const kind = input.kind
  if (kind !== 'setting_workspace' && kind !== 'asset_workspace') {
    return { content: input.content }
  }
  const originalParsed = parseWorkspaceWorkspaceContent(kind, input.content)
  const parsed = normalizeProjectLayerWorkspaceSnapshotContent(kind, originalParsed)
  const normalizedSnapshotContent = JSON.stringify(parsed) !== JSON.stringify(originalParsed)
  if (!hasProjectLayerTarget(input.target)) {
    const contentWithoutBase = removeProjectLayerSnapshotBase(parsed)
    if (!normalizedSnapshotContent && JSON.stringify(contentWithoutBase) === JSON.stringify(originalParsed)) return { content: input.content }
    return { content: JSON.stringify(contentWithoutBase, null, 2) }
  }

  const hydrated = await input.workspaceSnapshotHydrationPort.hydrateProjectLayerSnapshotBase({
    kind,
    ...(input.target ? { target: input.target } : {}),
    signal: input.signal,
  })
  const seeded = seedProjectLayerWorkspaceSnapshot(kind, removeProjectLayerSnapshotBase(parsed), hydrated.snapshotBase)
  return {
    content: JSON.stringify(seeded.content, null, 2),
    seed: hydrated.seed,
    hydratedWorkspaceBase: true,
    ...(seeded.changed ? { seededWorkspaceSnapshot: true } : {}),
  }
}

function normalizeWorkspaceWorkspaceKind(value: JSONValue | undefined): AgentWorkspaceKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'setting_workspace') return 'setting_workspace'
  if (normalized === 'project_standards_workspace') return 'project_standards_workspace'
  if (normalized === 'production_workspace') return 'production_workspace'
  if (normalized === 'content_unit_workspace') return 'content_unit_workspace'
  if (normalized === 'asset_workspace') return 'asset_workspace'
  return undefined
}

export function isStructuredWorkspaceWorkspaceKind(value: JSONValue | undefined): boolean {
  return value === 'setting_workspace'
    || value === 'asset_workspace'
    || value === 'project_standards_workspace'
    || value === 'production_workspace'
    || value === 'content_unit_workspace'
}

function normalizeWorkspaceWorkspaceContent(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value) || isJSONRecord(value)) return JSON.stringify(value, null, 2)
  return undefined
}

function validateStructuredWorkspaceWorkspaceContent(kind: AgentWorkspaceKind, content: string): Record<string, JSONValue> | undefined {
  const requiredSchema = kind === 'setting_workspace'
    ? WORKSPACE_CONTENT_SCHEMA_IDS.settingWorkspace
    : kind === 'project_standards_workspace'
      ? WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace
      : kind === 'production_workspace'
        ? WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace
        : kind === 'asset_workspace'
          ? WORKSPACE_CONTENT_SCHEMA_IDS.assetWorkspace
          : kind === 'content_unit_workspace'
            ? WORKSPACE_CONTENT_SCHEMA_IDS.contentUnitWorkspace
            : undefined
  if (!requiredSchema) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_workspace ${kind} content must be canonical JSON with schema ${requiredSchema}`)
  }
  if (!isJSONRecord(parsed) || parsed.schema !== requiredSchema) {
    throw new Error(`create_workspace ${kind} content must include schema ${requiredSchema}`)
  }
  return parsed
}

function normalizeWorkspaceWorkspaceTarget(value: unknown): AgentWorkspaceTarget | undefined {
  if (!isJSONRecord(value)) return undefined
  const target: AgentWorkspaceTarget = {
    ...(typeof value.entityType === 'string' && value.entityType.trim() ? { entityType: value.entityType.trim() } : {}),
    ...(isValidAgentReferenceId(value.entityId) ? { entityId: value.entityId } : {}),
    ...(isValidAgentProjectId(value.projectId) ? { projectId: value.projectId } : {}),
    ...(typeof value.field === 'string' && value.field.trim() ? { field: value.field.trim() } : {}),
  }
  return Object.keys(target).length > 0 ? target : undefined
}

function inferWorkspaceWorkspaceTarget(
  kind: AgentWorkspaceKind,
  projectId: number | undefined,
  context: Record<string, JSONValue> | undefined,
  pageContext: Record<string, JSONValue>,
  args: Record<string, JSONValue>,
): AgentWorkspaceTarget | undefined {
  const productionId = entityIdField(args.productionId)
    ?? entityIdField(args.production_id)
    ?? entityIdField(context?.productionId)
    ?? entityIdField(pageContext.pageEntityType === 'production' ? pageContext.pageEntityId : undefined)
  if (kind === 'project_standards_workspace') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      entityType: 'project',
      ...(projectId !== undefined ? { entityId: projectId } : {}),
      field: 'workspace',
    }
  }
  if (kind === 'production_workspace') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      entityType: 'production',
      ...(productionId !== undefined ? { entityId: productionId } : {}),
      field: 'workspace',
    }
  }
  if (kind === 'content_unit_workspace') {
    return {
      ...(projectId !== undefined ? { projectId } : {}),
      ...(productionId !== undefined ? { entityType: 'production', entityId: productionId } : {}),
      field: 'workspace',
    }
  }
  return projectId !== undefined ? { projectId } : undefined
}

function normalizeWorkspaceWorkspaceSource(
  value: unknown,
  run: AgentRun,
  context: Record<string, JSONValue> | undefined,
  pageContext: Record<string, JSONValue>,
): AgentWorkspaceSource {
  const source = isJSONRecord(value) ? { ...value } : {}
  const contextProject = isJSONRecord(context?.project) ? context.project : undefined
  const projectId = projectIdField(contextProject?.id)
    ?? projectIdField(pageContext.pageEntityType === 'project' ? pageContext.pageEntityId : undefined)
  return {
    ...source,
    runId: run.id,
    threadId: run.threadId,
    ...(projectId !== undefined ? { projectId } : {}),
    ...extractPageContext(run),
    producer: 'conversation',
  }
}

function defaultWorkspaceWorkspaceTitle(
  kind: AgentWorkspaceKind,
  projectId: number | undefined,
  target: AgentWorkspaceTarget | undefined,
): string {
  const projectLabel = projectId !== undefined ? `#${projectId}` : 'conversation'
  if (kind === 'project_standards_workspace') return `项目规范工作区 - ${projectLabel}`
  if (kind === 'production_workspace') {
    const targetLabel = target?.entityId !== undefined ? `#${String(target.entityId)}` : projectLabel
    return `制作工作区 - ${targetLabel}`
  }
  if (kind === 'content_unit_workspace') return `内容单元工作区 - ${projectLabel}`
  return `工作区工作区 - ${kind}`
}

export function extractPageContext(run: AgentRun): Record<string, JSONValue> {
  const clientInput = isJSONRecord(run.metadata?.clientInput) ? run.metadata.clientInput : undefined
  const uiSnapshot = isJSONRecord(clientInput?.uiSnapshot) ? clientInput.uiSnapshot : undefined
  const pageContext = isJSONRecord(uiSnapshot?.pageContext) ? uiSnapshot.pageContext : undefined
  const route = isJSONRecord(uiSnapshot?.route) ? uiSnapshot.route : undefined
  const selection = isJSONRecord(uiSnapshot?.selection) ? uiSnapshot.selection : undefined
  return {
    ...(typeof pageContext?.pageKey === 'string' ? { pageKey: pageContext.pageKey } : {}),
    ...(typeof pageContext?.pageType === 'string' ? { pageType: pageContext.pageType } : {}),
    ...(typeof pageContext?.pageRoute === 'string' ? { pageRoute: pageContext.pageRoute } : typeof route?.pathname === 'string' ? { pageRoute: route.pathname } : {}),
    ...(typeof pageContext?.pageEntityType === 'string' ? { pageEntityType: pageContext.pageEntityType } : typeof selection?.entityType === 'string' ? { pageEntityType: selection.entityType } : {}),
    ...(isValidAgentReferenceId(pageContext?.pageEntityId)
      ? { pageEntityId: pageContext.pageEntityId }
      : isValidAgentReferenceId(selection?.entityId)
        ? { pageEntityId: selection.entityId }
        : {}),
    ...(typeof pageContext?.workspaceId === 'string' ? { workspaceId: pageContext.workspaceId } : {}),
  }
}

function parseWorkspaceWorkspaceContent(kind: AgentWorkspaceKind, content: string): Record<string, JSONValue> {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`create_workspace ${kind} content must be canonical JSON`)
  }
  if (!isJSONRecord(parsed)) throw new Error(`create_workspace ${kind} content must be a JSON object`)
  return parsed
}

function hasProjectLayerTarget(target: AgentWorkspaceTarget | undefined): boolean {
  if (!isJSONRecord(target)) return false
  return projectIdField(target.projectId) !== undefined || projectIdField(target.entityId) !== undefined
}

function removeProjectLayerSnapshotBase(parsed: Record<string, JSONValue>): Record<string, JSONValue> {
  const rest = { ...parsed }
  delete rest.snapshot_base
  return rest
}

function mergeHydratedProjectLayerBaseIntoWorkspace(
  kind: Extract<AgentWorkspaceKind, 'setting_workspace' | 'asset_workspace'>,
  parsed: Record<string, JSONValue>,
  hydratedSnapshotBase: Record<string, JSONValue>,
): { content: Record<string, JSONValue>; changed: boolean } {
  const field = kind === 'setting_workspace' ? 'creative_references' : 'asset_slots'
  const hydratedItems = Array.isArray(hydratedSnapshotBase[field]) ? hydratedSnapshotBase[field] : []
  const workspace = isJSONRecord(parsed.workspace) ? parsed.workspace : {}
  const proposedItems = Array.isArray(workspace[field]) ? workspace[field] : undefined
  const shouldSeedWithHydratedItems = proposedItems === undefined
    || proposedItems.length === 0
    || (hydratedItems.length > 0 && proposedItems.every(isNewSnapshotNode))
  if (!shouldSeedWithHydratedItems) return { content: parsed, changed: false }
  const nextItems = proposedItems !== undefined && proposedItems.length > 0
    ? [...cloneJSONValue(hydratedItems), ...proposedItems]
    : cloneJSONValue(hydratedItems)
  return {
    content: {
      ...parsed,
      workspace: {
        ...workspace,
        [field]: nextItems,
      },
    },
    changed: true,
  }
}

function isNewSnapshotNode(value: JSONValue): boolean {
  if (!isJSONRecord(value)) return true
  return normalizedNumber(value.id) === undefined && normalizedNumber(value.ID) === undefined
}

function normalizeProjectLayerWorkspaceSnapshotContent(
  kind: Extract<AgentWorkspaceKind, 'setting_workspace' | 'asset_workspace'>,
  parsed: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const workspace = isJSONRecord(parsed.workspace) ? parsed.workspace : undefined
  const nextWorkspace = workspace && kind === 'setting_workspace' && Array.isArray(workspace.creative_references)
    ? { ...workspace, creative_references: normalizeSettingWorkspaceSnapshotReferences(workspace.creative_references) }
    : workspace && kind === 'asset_workspace' && Array.isArray(workspace.asset_slots)
      ? { ...workspace, asset_slots: normalizeAssetWorkspaceSnapshotSlots(workspace.asset_slots) }
      : workspace
  const nextSlot = kind === 'asset_workspace' && isJSONRecord(parsed.slot)
    ? normalizeAssetWorkspaceSnapshotSlot(parsed.slot)
    : undefined
  return {
    ...parsed,
    ...(nextWorkspace ? { workspace: nextWorkspace } : {}),
    ...(nextSlot ? { slot: nextSlot } : {}),
  }
}

function seedProjectLayerWorkspaceSnapshot(
  kind: Extract<AgentWorkspaceKind, 'setting_workspace' | 'asset_workspace'>,
  parsed: Record<string, JSONValue>,
  snapshotBase: Record<string, JSONValue>,
): { content: Record<string, JSONValue>; changed: boolean } {
  return mergeHydratedProjectLayerBaseIntoWorkspace(kind, parsed, snapshotBase)
}

function cloneJSONValue<T extends JSONValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function projectIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}

function entityIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentEntityId(value) ? value : undefined
}
