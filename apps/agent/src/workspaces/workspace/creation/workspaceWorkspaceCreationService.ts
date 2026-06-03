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

interface PreparedWorkspaceWorkspaceContent {
  content: string
  seed?: JSONValue
  contract?: JSONValue
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
  const target = normalizeWorkspaceWorkspaceTarget(args.target)
    ?? inferWorkspaceWorkspaceTarget(kind, projectId, context, pageContext, args)
  const title = stringField(args.title) ?? defaultWorkspaceWorkspaceTitle(kind, projectId, target)
  const rawContent = normalizeWorkspaceWorkspaceContent(args.content)
  const prepared: PreparedWorkspaceWorkspaceContent = rawContent === undefined
    ? await workspaceSnapshotHydrationPort.openWorkspaceContent({ kind, target, signal })
    : await prepareWorkspaceWorkspaceContent({
      content: rawContent,
    })
  const content = prepared.content
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
      ...(prepared.contract ? { workspaceContract: prepared.contract } : {}),
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
  content: string
}): Promise<PreparedWorkspaceWorkspaceContent> {
  return { content: input.content }
}

function normalizeWorkspaceWorkspaceKind(value: JSONValue | undefined): AgentWorkspaceKind | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return normalized || undefined
}

export function isStructuredWorkspaceWorkspaceKind(value: JSONValue | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeWorkspaceWorkspaceContent(value: JSONValue | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (value === null) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value) || isJSONRecord(value)) return JSON.stringify(value, null, 2)
  return undefined
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
  _kind: AgentWorkspaceKind,
  projectId: number | undefined,
  context: Record<string, JSONValue> | undefined,
  pageContext: Record<string, JSONValue>,
  _args: Record<string, JSONValue>,
): AgentWorkspaceTarget | undefined {
  void context
  const pageEntityType = typeof pageContext.pageEntityType === 'string' ? pageContext.pageEntityType : undefined
  const pageEntityId = entityIdField(pageContext.pageEntityId)
  return {
    ...(projectId !== undefined ? { projectId } : {}),
    ...(pageEntityType ? { entityType: pageEntityType } : {}),
    ...(pageEntityId !== undefined ? { entityId: pageEntityId } : {}),
    field: 'workspace',
  }
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
  const targetLabel = target?.entityId !== undefined ? `#${String(target.entityId)}` : projectLabel
  return `Workspace - ${kind} - ${targetLabel}`
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

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function projectIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}

function entityIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentEntityId(value) ? value : undefined
}
