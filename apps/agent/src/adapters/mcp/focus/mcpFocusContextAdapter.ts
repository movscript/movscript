import type { RuntimeFocusContextPort } from '../../../ports/context/focusContextPort.js'
import type { ExternalToolGatewayPort } from '../../../ports/tools/externalToolGatewayPort.js'

export const FOCUS_CONTEXT_TOOL_NAME = 'get_focus_context'

export function createExternalToolFocusContextPort(
  externalToolGatewayPort: ExternalToolGatewayPort,
): RuntimeFocusContextPort {
  return {
    getFocusContext: (options) => externalToolGatewayPort.executeTool(FOCUS_CONTEXT_TOOL_NAME, {}, options),
  }
}
