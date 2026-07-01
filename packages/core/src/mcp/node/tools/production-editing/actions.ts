import { createProjectServiceClientFromRuntime } from '@movscript/project'
import { isRecord, stringValue } from '../../../tools/shared/record.js'
import { resolveMCPProjectWorkspaceLocator } from '../workspace/locator.js'

type Args = Record<string, unknown>
type WorkspaceKind = 'system_editing' | 'remotion'

const LOCATOR_KEYS = new Set([
  'homeDir',
  'home_dir',
  'workspaceDir',
  'workspace_dir',
  'projectDir',
  'project_dir',
  'projectPath',
  'project_path',
  'cwd',
  'token',
])

export async function productionEditingResourcesRefresh(args: Args = {}): Promise<Record<string, unknown>> {
  return createProjectServiceClientFromRuntime().refreshProductionEditingResources(projectOperationRequest(args))
}

export async function productionEditingWorkspaceList(args: Args = {}): Promise<Record<string, unknown>> {
  return createProjectServiceClientFromRuntime().listProductionEditingWorkspaces(projectOperationRequest(args))
}

export async function productionEditingWorkspaceCreate(args: Args = {}): Promise<Record<string, unknown>> {
  const kind = workspaceKind(args.kind ?? args.workspaceKind ?? args.workspace_kind)
  const response = await createProjectServiceClientFromRuntime().createProductionEditingWorkspace(projectOperationRequest({
    ...args,
    kind,
  }))
  return withProductionEditingHandoff(response, kind)
}

export async function productionEditingWorkspaceGet(args: Args = {}): Promise<Record<string, unknown>> {
  const workspaceId = requiredWorkspaceId(args)
  const response = await createProjectServiceClientFromRuntime().listProductionEditingWorkspaces(projectOperationRequest(args))
  const workspaces = Array.isArray(response.workspaces) ? response.workspaces : []
  const workspace = workspaces.find((item) => {
    if (!isRecord(item)) return false
    return stringValue(item.workspaceId ?? item.workspace_id ?? item.id) === workspaceId
  })
  return {
    ...response,
    schema: 'movscript.production_editing_workspace_get.v1',
    status: workspace ? 'ok' : 'not_found',
    workspaceId,
    workspace_id: workspaceId,
    ...(workspace ? { workspace } : {}),
  }
}

export async function productionEditingWorkspaceOpen(args: Args = {}): Promise<Record<string, unknown>> {
  const response = await createProjectServiceClientFromRuntime().openProductionEditingWorkspace(projectOperationRequest(args))
  return withProductionEditingHandoff(response)
}

export async function productionEditingWorkspaceDelete(args: Args = {}): Promise<Record<string, unknown>> {
  requiredWorkspaceId(args)
  return createProjectServiceClientFromRuntime().deleteProductionEditingWorkspace(projectOperationRequest(args))
}

function projectOperationRequest(args: Args) {
  const locator = resolveMCPProjectWorkspaceLocator(args)
  return {
    projectDir: locator.projectDir,
    input: operationInput(args),
  }
}

function operationInput(args: Args): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (LOCATOR_KEYS.has(key) || value === undefined) continue
    input[key] = value
  }
  const mediaProjectId = args.mediaProjectId ?? args.media_project_id ?? args.projectId ?? args.project_id
  if (mediaProjectId !== undefined) {
    input.mediaProjectId = mediaProjectId
    input.media_project_id = mediaProjectId
  }
  const productionId = args.productionId ?? args.production_id
  if (productionId !== undefined) {
    input.productionId = productionId
    input.production_id = productionId
  }
  const workspaceId = args.workspaceId ?? args.workspace_id
  if (workspaceId !== undefined) {
    input.workspaceId = workspaceId
    input.workspace_id = workspaceId
  }
  return input
}

function withProductionEditingHandoff(response: Record<string, unknown>, fallbackKind?: WorkspaceKind): Record<string, unknown> {
  const workspace = isRecord(response.workspace) ? response.workspace : undefined
  const kind = workspaceKindValue(workspace?.kind ?? fallbackKind)
  if (!kind) return response
  const workspaceId = stringValue(workspace?.workspaceId ?? workspace?.workspace_id ?? response.workspaceId ?? response.workspace_id)
  const productionId = response.productionId ?? response.production_id ?? workspace?.productionId ?? workspace?.production_id
  const mediaProjectId = workspace?.mediaEditingProjectProjectId
    ?? workspace?.media_editing_project_project_id
    ?? response.mediaProjectId
    ?? response.media_project_id
    ?? response.projectId
    ?? response.project_id
  const responseHandoff = isRecord(response.handoff) ? response.handoff : undefined
  const responseHandoffPreflight = isRecord(response.handoffPreflight)
    ? response.handoffPreflight
    : isRecord(response.handoff_preflight)
      ? response.handoff_preflight
      : undefined
  const handoff = responseHandoff ?? {
    fromSkill: 'production-editing',
    from_skill: 'production-editing',
    toSkill: kind === 'remotion' ? 'remotion' : 'system_edit',
    to_skill: kind === 'remotion' ? 'remotion' : 'system_edit',
    reason: 'workspace_opened',
    workspaceKind: kind,
    workspace_kind: kind,
    workspaceId,
    workspace_id: workspaceId,
    requiredContext: {
      mediaProjectId,
      media_project_id: mediaProjectId,
      projectId: mediaProjectId,
      project_id: mediaProjectId,
      productionId,
      production_id: productionId,
      workspaceId,
      workspace_id: workspaceId,
      projectDirectory: workspace?.projectDirectory ?? workspace?.project_directory,
      project_directory: workspace?.projectDirectory ?? workspace?.project_directory,
      mediaEditingProjectId: workspace?.editingProjectId ?? workspace?.editing_project_id,
      media_editing_project_id: workspace?.editingProjectId ?? workspace?.editing_project_id,
      manifestPath: workspace?.manifestPath ?? workspace?.manifest_path,
      manifest_path: workspace?.manifestPath ?? workspace?.manifest_path,
    },
  }
  const handoffPreflight = responseHandoffPreflight ?? {
    schema: 'movscript.production_editing_handoff_preflight.v1',
    workspaceKind: kind,
    workspace_kind: kind,
    ready: true,
    blockers: [],
    warnings: [],
    agentSkill: kind === 'remotion'
      ? {
          status: 'available',
          skillName: 'remotion',
          skill_name: 'remotion',
        }
      : {
          status: 'available',
          skillName: 'system_edit',
          skill_name: 'system_edit',
        },
    projectRuntime: {
      status: 'not_checked',
      note: 'Workspace runtime checks belong to the handoff skill after the workspace is opened.',
    },
  }
  return {
    ...response,
    handoff,
    handoff_preflight: handoffPreflight,
    handoffPreflight,
  }
}

function workspaceKind(value: unknown): WorkspaceKind {
  const kind = workspaceKindValue(value)
  if (!kind) throw new Error('workspace kind must be system_editing or remotion')
  return kind
}

function workspaceKindValue(value: unknown): WorkspaceKind | undefined {
  const raw = stringValue(value)
  if (raw === 'system_editing' || raw === 'remotion') return raw
  return undefined
}

function requiredWorkspaceId(args: Args): string {
  const workspaceId = stringValue(args.workspaceId ?? args.workspace_id)
  if (!workspaceId) throw new Error('workspaceId is required')
  return workspaceId
}
