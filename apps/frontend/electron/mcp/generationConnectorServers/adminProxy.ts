import { backendPost } from '../backendClient'
import { getRequiredOperation } from '../generationConnectors/params'
import type { GenerationToolServer } from '../../../src/shared/contracts/generationTools'

export async function callAdminGenerationToolProxy(server: GenerationToolServer, args: Record<string, unknown>): Promise<unknown> {
  const operation = getRequiredOperation(args, server.type === 'comfyui'
    ? ['status', 'object_info', 'queue_prompt', 'queue', 'history', 'view']
    : ['status', 'models', 'txt2img', 'img2img', 'progress', 'get'])
  const body: Record<string, unknown> = {
    tool_type: server.type,
    server_id: server.id,
    server_scope: server.scope,
    operation,
  }
  for (const key of ['path', 'workflow', 'payload', 'client_id', 'clientId', 'prompt_id', 'promptId', 'filename', 'subfolder', 'file_type', 'fileType']) {
    if (args[key] !== undefined) body[key] = args[key]
  }
  if (body.clientId !== undefined && body.client_id === undefined) body.client_id = body.clientId
  if (body.promptId !== undefined && body.prompt_id === undefined) body.prompt_id = body.promptId
  if (body.fileType !== undefined && body.file_type === undefined) body.file_type = body.fileType
  delete body.clientId
  delete body.promptId
  delete body.fileType
  return backendPost('/generation-tools/call', body)
}
