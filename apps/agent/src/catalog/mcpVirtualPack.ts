import type { MCPTool } from '../types.js'
import type { CapabilityPack, ToolDefinition } from './types.js'
import type { JSONSchema7 } from '@movscript/draft-schemas'

export interface MCPVirtualPack {
  pack: CapabilityPack
  tools: ToolDefinition[]
}

export function buildMCPVirtualPack(input: {
  serverId: string
  serverName?: string
  tools: MCPTool[]
}): MCPVirtualPack {
  const serverId = normalizeServerId(input.serverId)
  const tools = input.tools.map((tool) => mcpToolDefinition(serverId, tool))
  return {
    pack: {
      id: `mcp.${serverId}`,
      version: '1.0.0',
      name: input.serverName ?? `MCP ${serverId}`,
      description: `Virtual capability pack for MCP server ${serverId}.`,
      source: 'mcp',
      schemas: [],
      tools: tools.map((tool) => tool.name),
      skills: [],
      mcpServerId: serverId,
    },
    tools,
  }
}

export function mcpPublicToolName(serverId: string, toolName: string): string {
  return `mcp__${normalizeServerId(serverId)}__${normalizeToolName(toolName)}`
}

function mcpToolDefinition(serverId: string, tool: MCPTool): ToolDefinition {
  return {
    name: mcpPublicToolName(serverId, tool.name),
    description: tool.description,
    inputSchema: normalizeSchema(tool.inputSchema),
    permission: `mcp.${serverId}.${normalizeToolName(tool.name)}`,
    risk: 'write',
    projectScoped: false,
    defaults: {
      grant: 'deny',
      approval: 'always',
    },
    source: 'mcp',
    mcpServerId: serverId,
    capability: tool.description,
  }
}

function normalizeServerId(value: string): string {
  return normalizeToolName(value) || 'default'
}

function normalizeToolName(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeSchema(value: unknown): JSONSchema7 {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JSONSchema7
    : { type: 'object', additionalProperties: true, properties: {} }
}
