import { isJSONRecord } from '../../../../shared/json/jsonValue.js'
import type { RuntimeToolHandler } from '../../../../ports/runtime/runtimeToolHandlerPort.js'
import type { JSONValue } from '../../../../state/shared/types.js'
import { isValidAgentProjectId } from '../../../../context/runtime/runtimeContext.js'
import {
  createWorkspaceWorkspace,
  extractPageContext,
  isStructuredWorkspaceWorkspaceKind,
} from '../../../../workspaces/workspace/creation/workspaceWorkspaceCreationService.js'
import { workspaceContentFileRef } from '../../../../files/providers/workspaceFileProvider.js'

const workspaceKindToLegacyWorkspaceKind: Record<string, string> = {
  project_standards_edit: 'project_standards_workspace',
  setting_edit: 'setting_workspace',
  asset_edit: 'asset_workspace',
  production_edit: 'production_workspace',
  content_unit_edit: 'content_unit_workspace',
}

export function createWorkspaceOpenToolHandler(): RuntimeToolHandler {
  return {
    toolNames: ['workspace_open'],
    async execute({ call, args, run, workspaceStore, workspaceSnapshotHydrationPort, signal }) {
      const normalizedArgs = normalizeWorkspaceOpenArgs(args)
      if (normalizedArgs.workspace === true || normalizedArgs.workspaceKind !== undefined || isStructuredWorkspaceWorkspaceKind(normalizedArgs.kind)) {
        const result = await createWorkspaceWorkspace(workspaceStore, run, workspaceSnapshotHydrationPort, normalizedArgs, signal)
        return {
          result: workspaceOpenResult(result),
        }
      }
      const workspace = workspaceStore.createWorkspace({
        projectId: isValidAgentProjectId(normalizedArgs.projectId) ? normalizedArgs.projectId : undefined,
        kind: normalizedArgs.kind,
        title: normalizedArgs.title,
        content: normalizedArgs.content,
        source: {
          ...(isJSONRecord(normalizedArgs.source) ? normalizedArgs.source : {}),
          runId: run.id,
          threadId: run.threadId,
          ...extractPageContext(run),
        },
        target: normalizedArgs.target,
        seed: normalizedArgs.seed,
        createdByRunId: run.id,
        createdByThreadId: run.threadId,
        metadata: isJSONRecord(normalizedArgs.metadata) ? normalizedArgs.metadata : undefined,
      })
      return {
        result: workspaceOpenResult(workspace as unknown as JSONValue),
      }
    },
  }
}

function normalizeWorkspaceOpenArgs(args: Record<string, JSONValue>): Record<string, JSONValue> {
  const kind = typeof args.workspaceKind === 'string'
    ? workspaceKindToLegacyWorkspaceKind[args.workspaceKind] ?? args.workspaceKind
    : typeof args.workspace_kind === 'string'
      ? workspaceKindToLegacyWorkspaceKind[args.workspace_kind] ?? args.workspace_kind
      : typeof args.kind === 'string'
        ? workspaceKindToLegacyWorkspaceKind[args.kind] ?? args.kind
        : args.kind
  return {
    ...args,
    kind,
    workspace: args.workspace ?? true,
  }
}

function workspaceOpenResult(value: JSONValue): JSONValue {
  if (!isJSONRecord(value)) return value
  const workspaceId = stringField(value.workspaceId)
    ?? stringField(value.workspaceRef)
    ?? stringField(value.workspaceRef)
    ?? stringField(value.id)
  if (!workspaceId) return value
  const workspace = isJSONRecord(value.workspace) ? value.workspace : value
  return {
    status: value.status ?? 'opened',
    workspaceId,
    workspaceRef: workspaceId,
    workspaceContentRef: workspaceContentFileRef(workspaceId),
    workspace: {
      id: workspaceId,
      kind: workspaceKindForLegacyKind(stringField(workspace.kind)),
      title: stringField(workspace.title),
      updatedAt: stringField(workspace.updatedAt),
    },
    message: 'Workspace is ready for editing.',
  } as unknown as JSONValue
}

function workspaceKindForLegacyKind(kind: string | undefined): string | undefined {
  if (!kind) return undefined
  for (const [workspaceKind, legacyKind] of Object.entries(workspaceKindToLegacyWorkspaceKind)) {
    if (legacyKind === kind) return workspaceKind
  }
  return kind
}

function stringField(value: JSONValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
