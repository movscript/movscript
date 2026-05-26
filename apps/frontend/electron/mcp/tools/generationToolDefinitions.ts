import type { MCPTool } from '../types'
import { candidateAttachmentTools } from './candidateToolDefinitions'
import { generationConnectorTools } from './generationConnectorToolDefinitions'
import { generationJobTools } from './generationJobToolDefinitions'
import { generationModelTools } from './generationModelToolDefinitions'

export function generationTools(): MCPTool[] {
  return [
    ...generationModelTools(),
    ...generationConnectorTools(),
    ...generationJobTools(),
    ...candidateAttachmentTools(),
  ]
}
