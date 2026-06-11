import type { MCPTool } from '../../protocol/types'
import imageGenerateTool from './image-generate.tool.json'
import imageJobGetTool from './image-job-get.tool.json'
import videoGenerateTool from './video-generate.tool.json'
import videoJobGetTool from './video-job-get.tool.json'
import { objectSchema } from '../schema'

type AgentCatalogTool = {
  name: string
  description: string
  inputSchema: MCPTool['inputSchema']
  outputSchema?: MCPTool['outputSchema']
}

export function generationTools(): MCPTool[] {
  return [
    mcpTool(imageGenerateTool as AgentCatalogTool),
    mcpTool(imageJobGetTool as AgentCatalogTool),
    generationJobGetBatchTool('generation_image_job_get_batch', 'Synchronously fetch the latest state of multiple image generation jobs submitted by generation_image_generate. Results are returned in input order with per-job errors.'),
    mcpTool(videoGenerateTool as AgentCatalogTool),
    mcpTool(videoJobGetTool as AgentCatalogTool),
    generationJobGetBatchTool('generation_video_job_get_batch', 'Synchronously fetch the latest state of multiple video generation jobs submitted by generation_video_generate. Results are returned in input order with per-job errors.'),
  ]
}

function mcpTool(tool: AgentCatalogTool): MCPTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
  }
}

function generationJobGetBatchTool(name: string, description: string): MCPTool {
  return {
    name,
    description,
    inputSchema: objectSchema(
      {
        jobIds: { type: 'array', items: { type: 'number' }, description: 'Generation job IDs.' },
        job_ids: { type: 'array', items: { type: 'number' }, description: 'Alias for jobIds.' },
        items: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Optional item array. Each item may include jobId or job_id.' },
      },
    ),
    outputSchema: objectSchema(
      {
        status: { type: 'string' },
        total: { type: 'number' },
        success_count: { type: 'number' },
        failed_count: { type: 'number' },
        terminal_count: { type: 'number' },
        all_terminal: { type: 'boolean' },
        output_resource_ids: { type: 'array', items: { type: 'number' } },
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
        message: { type: 'string' },
      },
      ['status', 'total', 'success_count', 'failed_count', 'terminal_count', 'all_terminal', 'items', 'message']
    ),
  }
}
