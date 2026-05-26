import { importAdminComfyUIHistoryOutputs, importComfyUIHistoryOutputs } from '../generationConnectorOutputs'
import { getOptionalGenerationToolServerScope, getOptionalString, getRequiredOperation } from './params'
import {
  callAdminGenerationToolProxy,
  callGenerationToolServer,
  generationToolServersWithAdmin,
  sanitizeGenerationToolServerForMCP,
  selectGenerationToolServer,
} from '../generationConnectorServers'
import { isRecord } from '../valueUtils'

export async function callComfyUITool(args: Record<string, unknown>): Promise<unknown> {
  const operation = getRequiredOperation(args, ['list_servers', 'status', 'object_info', 'queue_prompt', 'queue', 'history', 'import_history_outputs'])
  if (operation === 'list_servers') {
    return {
      status: 'ok',
      servers: (await generationToolServersWithAdmin('comfyui')).map(sanitizeGenerationToolServerForMCP),
    }
  }

  const selected = await selectGenerationToolServer(
    'comfyui',
    getOptionalString(args, 'server_id') ?? getOptionalString(args, 'serverId'),
    getOptionalGenerationToolServerScope(args),
  )
  if (selected.scope !== 'local') {
    if (operation === 'import_history_outputs') return importAdminComfyUIHistoryOutputs(selected, args)
    return callAdminGenerationToolProxy(selected, args)
  }
  switch (operation) {
    case 'status':
      return callGenerationToolServer(selected, '/system_stats', { method: 'GET' })
    case 'object_info':
      return callGenerationToolServer(selected, '/object_info', { method: 'GET' })
    case 'queue':
      return callGenerationToolServer(selected, '/queue', { method: 'GET' })
    case 'history': {
      const promptID = getOptionalString(args, 'prompt_id') ?? getOptionalString(args, 'promptId')
      return callGenerationToolServer(selected, promptID ? `/history/${encodeURIComponent(promptID)}` : '/history', { method: 'GET' })
    }
    case 'import_history_outputs':
      return importComfyUIHistoryOutputs(selected, args)
    case 'queue_prompt': {
      const workflow = isRecord(args.workflow) ? args.workflow : undefined
      if (!workflow) throw new Error('tool_comfyui queue_prompt requires workflow object')
      const clientID = getOptionalString(args, 'client_id') ?? getOptionalString(args, 'clientId')
      return callGenerationToolServer(selected, '/prompt', {
        method: 'POST',
        body: {
          prompt: workflow,
          ...(clientID ? { client_id: clientID } : {}),
        },
      })
    }
    default:
      throw new Error(`Unsupported ComfyUI operation: ${operation}`)
  }
}
