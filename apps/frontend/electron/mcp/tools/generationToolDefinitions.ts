import type { MCPTool } from '../types'
import imageGenerateTool from '../../../../agent/catalog/tools/generation/image-generate.tool.json'
import imageJobGetTool from '../../../../agent/catalog/tools/generation/image-job-get.tool.json'
import videoGenerateTool from '../../../../agent/catalog/tools/generation/video-generate.tool.json'
import videoJobGetTool from '../../../../agent/catalog/tools/generation/video-job-get.tool.json'

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
    mcpTool(videoGenerateTool as AgentCatalogTool),
    mcpTool(videoJobGetTool as AgentCatalogTool),
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
