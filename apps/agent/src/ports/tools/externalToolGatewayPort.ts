import type { JSONValue } from '../../state/types.js'

export interface ExternalToolGatewayPort {
  executeTool(
    toolName: string,
    args: Record<string, JSONValue>,
    options?: { signal?: AbortSignal },
  ): Promise<JSONValue>
}
