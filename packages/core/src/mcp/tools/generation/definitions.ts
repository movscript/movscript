import type { MCPTool } from '../../protocol/types'
import imageGenerateTool from './image-generate.tool.json'
import imageJobGetTool from './image-job-get.tool.json'
import videoGenerateTool from './video-generate.tool.json'
import videoJobGetTool from './video-job-get.tool.json'

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
