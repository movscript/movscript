import type { MCPClient } from '../../mcpClient.js'
import type { ExternalToolGatewayPort } from '../../ports/tools/externalToolGatewayPort.js'
import type { JSONValue } from '../../state/types.js'
import { runtimeToolName } from '../../tools/toolNames.js'

export function createMCPExternalToolGatewayPort(
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>,
): ExternalToolGatewayPort {
  return {
    async executeTool(toolName, args, options) {
      await mcpClient.initialize({ signal: options?.signal })
      const runtimeName = runtimeToolName(toolName)
      const runtimeArgs = translateToolArgsForRuntime(toolName, args)
      return mcpClient.callTool(runtimeName, runtimeArgs, { signal: options?.signal })
    },
  }
}

function translateToolArgsForRuntime(_toolName: string, args: Record<string, JSONValue>): Record<string, JSONValue> {
  return args
}
