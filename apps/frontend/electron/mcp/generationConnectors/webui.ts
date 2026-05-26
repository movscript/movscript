import { maybeImportWebUIOutputs } from '../generationConnectorOutputs'
import { getOptionalGenerationToolServerScope, getOptionalString, getRequiredOperation } from './params'
import {
  callAdminGenerationToolProxy,
  callGenerationToolServer,
  generationToolServersWithAdmin,
  sanitizeGenerationToolServerForMCP,
  selectGenerationToolServer,
} from '../generationConnectorServers'
import { isRecord } from '../valueUtils'

export async function callWebUITool(args: Record<string, unknown>): Promise<unknown> {
  const operation = getRequiredOperation(args, ['list_servers', 'status', 'models', 'txt2img', 'img2img', 'progress', 'get'])
  if (operation === 'list_servers') {
    return {
      status: 'ok',
      servers: (await generationToolServersWithAdmin('webui')).map(sanitizeGenerationToolServerForMCP),
    }
  }

  const selected = await selectGenerationToolServer(
    'webui',
    getOptionalString(args, 'server_id') ?? getOptionalString(args, 'serverId'),
    getOptionalGenerationToolServerScope(args),
  )
  if (selected.scope !== 'local') {
    const result = await callAdminGenerationToolProxy(selected, args)
    return maybeImportWebUIOutputs(result, args)
  }
  switch (operation) {
    case 'status':
    case 'progress':
      return callGenerationToolServer(selected, '/sdapi/v1/progress?skip_current_image=true', { method: 'GET' })
    case 'models':
      return callGenerationToolServer(selected, '/sdapi/v1/sd-models', { method: 'GET' })
    case 'txt2img':
      return maybeImportWebUIOutputs(await callGenerationToolServer(selected, '/sdapi/v1/txt2img', {
        method: 'POST',
        body: getPayloadObject(args),
      }), args)
    case 'img2img':
      return maybeImportWebUIOutputs(await callGenerationToolServer(selected, '/sdapi/v1/img2img', {
        method: 'POST',
        body: getPayloadObject(args),
      }), args)
    case 'get': {
      const path = getOptionalString(args, 'path') ?? ''
      if (!path.startsWith('/sdapi/v1/') || path.includes('://')) {
        throw new Error('tool_webui get requires a safe /sdapi/v1/... path')
      }
      return callGenerationToolServer(selected, path, { method: 'GET' })
    }
    default:
      throw new Error(`Unsupported WebUI operation: ${operation}`)
  }
}

function getPayloadObject(args: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(args.payload)) throw new Error('tool_webui operation requires payload object')
  return args.payload
}
