import { isJSONRecord, isJSONValue } from '../../../shared/json/jsonValue.js'
import type { MCPClient } from '../../mcp/client/mcpClient.js'
import type { WorkspaceWorkspaceSnapshotHydrationPort } from '../../../ports/workspace/hydration/workspaceSnapshotHydrationPort.js'
import type { JSONValue } from '../../../state/shared/types.js'

export function createMCPWorkspaceSnapshotHydrationPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): WorkspaceWorkspaceSnapshotHydrationPort {
  return {
    async openWorkspaceContent(input) {
      await mcpClient.initialize({ signal: input.signal })
      const contract = await readWorkspaceModelContract(mcpClient, {
        kind: input.kind,
        ...(input.target ? { target: input.target as unknown as JSONValue } : {}),
        ...(input.seedMode ? { seedMode: input.seedMode } : {}),
        ...(input.include ? { include: input.include as unknown as JSONValue } : {}),
        hydrate: input.seedMode !== 'empty',
      }, input.signal)
      const initialContent = isJSONRecord(contract) ? contract.initialContent : undefined
      const initialContentText = isJSONRecord(contract) && typeof contract.initialContentText === 'string'
        ? contract.initialContentText
        : undefined
      const seed = isJSONRecord(contract) && isJSONRecord(contract.seed) ? contract.seed : undefined
      if (initialContentText && initialContentText.trim()) {
        return {
          content: initialContentText.trim(),
          ...(seed ? { seed } : {}),
          contract,
        }
      }
      if (isJSONValue(initialContent)) {
        return {
          content: JSON.stringify(initialContent, null, 2),
          ...(seed ? { seed } : {}),
          contract,
        }
      }
      throw new Error(`get_workspace_model did not return initialContent for ${input.kind}`)
    },
    async hydrateProjectLayerSnapshotBase(input) {
      try {
        await mcpClient.initialize({ signal: input.signal })
        const contract = await readWorkspaceModelContract(mcpClient, {
          kind: input.kind,
          ...(input.target ? { target: input.target as unknown as JSONValue } : {}),
          seedMode: 'editable_snapshot',
          hydrate: true,
        }, input.signal)
        const seed = isJSONRecord(contract) && isJSONRecord(contract.seed) ? contract.seed : undefined
        const data = isJSONRecord(seed?.data) ? seed.data : undefined
        const initialContent = isJSONRecord(contract) && isJSONRecord(contract.initialContent) ? contract.initialContent : undefined
        const workspace = isJSONRecord(initialContent?.workspace) ? initialContent.workspace : undefined
        const snapshotBase = data ?? workspace
        if (!snapshotBase) throw new Error('get_workspace_model did not return seed.data or initialContent.workspace')
        return {
          snapshotBase,
          ...(seed ? { seed } : {}),
        }
      } catch (error) {
        throw new Error(`create_workspace ${input.kind} could not hydrate workspace baseline from MCP contract: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  }
}

async function readWorkspaceModelContract(
  mcpClient: Pick<MCPClient, 'callTool'>,
  args: Record<string, JSONValue>,
  signal?: AbortSignal,
): Promise<JSONValue> {
  return unwrapMCPToolData(await mcpClient.callTool('get_workspace_model', args, { signal }))
}

function unwrapMCPToolData(value: JSONValue): JSONValue {
  if (isJSONRecord(value) && value.data !== undefined && isJSONValue(value.data)) return value.data
  return value
}
