import {
  normalizeAssetWorkspaceSnapshotSlots,
  normalizeSettingWorkspaceSnapshotReferences,
} from '../../../workspaces/workspace/snapshot/workspaceSnapshotNormalization.js'
import { isValidAgentProjectId } from '../../../context/runtime/runtimeContext.js'
import { isJSONRecord, isJSONValue } from '../../../shared/json/jsonValue.js'
import type { MCPClient } from '../../mcp/client/mcpClient.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { AgentWorkspaceTarget } from '../../../workspaces/store/workspaceStore.js'
import type { JSONValue } from '../../../state/shared/types.js'

export function createMCPWorkspaceSnapshotHydrationPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): WorkspaceWorkspaceSnapshotHydrationPort {
  return {
    async hydrateProjectLayerSnapshotBase(input) {
      try {
        await mcpClient.initialize({ signal: input.signal })
        const modelArgs = {
          kind: input.kind,
          ...(input.target ? { target: input.target as unknown as JSONValue } : {}),
          seedMode: 'editable_snapshot',
          hydrate: true,
        }
        const contract = unwrapMCPToolData(await mcpClient.callTool('get_workspace_model', modelArgs, { signal: input.signal }))
        const seed = isJSONRecord(contract) && isJSONRecord(contract.seed) ? contract.seed : undefined
        const data = isJSONRecord(seed?.data) ? seed.data : undefined
        if (input.kind === 'setting_workspace') {
          const fallback = Array.isArray(data?.creative_references)
            ? undefined
            : await hydrateProjectLayerSeedFallback(mcpClient, input.target, 'creative_references', input.signal)
          const creativeReferences = Array.isArray(data?.creative_references)
            ? data.creative_references
            : fallback?.value
          if (!Array.isArray(creativeReferences)) throw new Error(missingHydratedSeedMessage('creative_references', seed, fallback))
          const snapshotBase: Record<string, JSONValue> = {
            creative_references: normalizeSettingWorkspaceSnapshotReferences(creativeReferences as JSONValue[]) as JSONValue,
          }
          return {
            snapshotBase,
            ...(seed ? { seed } : {}),
          }
        }
        const fallback = Array.isArray(data?.asset_slots)
          ? undefined
          : await hydrateProjectLayerSeedFallback(mcpClient, input.target, 'asset_slots', input.signal)
        const assetSlots = Array.isArray(data?.asset_slots)
          ? data.asset_slots
          : fallback?.value
        if (!Array.isArray(assetSlots)) throw new Error(missingHydratedSeedMessage('asset_slots', seed, fallback))
        const snapshotBase: Record<string, JSONValue> = {
          asset_slots: normalizeAssetWorkspaceSnapshotSlots(assetSlots as JSONValue[]) as JSONValue,
        }
        return {
          snapshotBase,
          ...(seed ? { seed } : {}),
        }
      } catch (error) {
        const field = input.kind === 'setting_workspace' ? 'creative_references' : 'asset_slots'
        throw new Error(`create_workspace ${input.kind} could not hydrate workspace.${field} automatically: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}

interface ProjectLayerSeedFallbackResult {
  value?: unknown
  diagnostic: string
}

async function hydrateProjectLayerSeedFallback(
  mcpClient: Pick<MCPClient, 'callTool'>,
  target: AgentWorkspaceTarget | undefined,
  field: 'creative_references' | 'asset_slots',
  signal?: AbortSignal,
): Promise<ProjectLayerSeedFallbackResult> {
  const projectId = projectIdField(isJSONRecord(target) ? target.projectId : undefined)
    ?? projectIdField(isJSONRecord(target) ? target.entityId : undefined)
  if (projectId === undefined) return { diagnostic: 'fallback skipped: projectId unavailable from target' }
  try {
    if (field === 'creative_references') {
      const result = unwrapMCPToolData(await mcpClient.callTool('movscript_creative_reference_query', {
        project_id: projectId,
        limit: 500,
      }, { signal }))
      const value = isJSONRecord(result) && Array.isArray(result.creative_references)
        ? result.creative_references
        : undefined
      return {
        ...(value ? { value } : {}),
        diagnostic: value
          ? `fallback movscript_creative_reference_query returned ${value.length} item(s)`
          : `fallback movscript_creative_reference_query missing creative_references; result keys: ${jsonRecordKeys(result)}`,
      }
    }
    const result = unwrapMCPToolData(await mcpClient.callTool('movscript_asset_slot_query', {
      project_id: projectId,
      include_internal: true,
      limit: 500,
    }, { signal }))
    const value = isJSONRecord(result) && Array.isArray(result.asset_slots)
      ? result.asset_slots
      : undefined
    return {
      ...(value ? { value } : {}),
      diagnostic: value
        ? `fallback movscript_asset_slot_query returned ${value.length} item(s)`
        : `fallback movscript_asset_slot_query missing asset_slots; result keys: ${jsonRecordKeys(result)}`,
    }
  } catch (error) {
    return { diagnostic: `fallback query failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function missingHydratedSeedMessage(
  field: 'creative_references' | 'asset_slots',
  seed: Record<string, JSONValue> | undefined,
  fallback: ProjectLayerSeedFallbackResult | undefined,
): string {
  const warnings = Array.isArray(seed?.warnings)
    ? seed.warnings.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const data = isJSONRecord(seed?.data) ? seed.data : undefined
  const details = [
    `seed data keys: ${data ? Object.keys(data).join(', ') || '(none)' : '(missing)'}`,
    ...(warnings.length > 0 ? [`seed warnings: ${warnings.join('; ')}`] : []),
    ...(fallback ? [fallback.diagnostic] : []),
  ]
  return `hydrated seed did not include ${field}; ${details.join('; ')}`
}

function jsonRecordKeys(value: unknown): string {
  return isJSONRecord(value) ? Object.keys(value).join(', ') || '(none)' : '(non-object)'
}

function unwrapMCPToolData(value: JSONValue): JSONValue {
  if (isJSONRecord(value) && value.data !== undefined && isJSONValue(value.data)) return value.data
  return value
}

function projectIdField(value: JSONValue | undefined): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}
