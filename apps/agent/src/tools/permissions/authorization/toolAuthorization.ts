import type { AgentToolGrant } from '../../../catalog/manifest/agentManifest.js'
import { isValidAgentProjectId } from '../../../context/runtime/runtimeContext.js'
import type { AgentRunRole, ToolUnavailableReason } from '../../../state/shared/types.js'
import type { RegisteredTool } from '../../registry/core/toolRegistry.js'

export function getToolAuthorizationUnavailableReason(input: {
  registeredTool?: RegisteredTool
  grant?: AgentToolGrant
  hasMCPTool?: boolean
  currentProjectId?: number
  runRole?: AgentRunRole
}): ToolUnavailableReason | undefined {
  if (!input.registeredTool) return 'unregistered'
  if (input.hasMCPTool !== true && input.registeredTool.source !== 'runtime') return 'mcp_unavailable'
  if (input.grant?.mode === 'deny') return 'denied'
  if (!input.grant) return 'not_granted'
  if (
    input.runRole
    && input.registeredTool.allowedRunRoles
    && !input.registeredTool.allowedRunRoles.includes(input.runRole)
  ) return 'wrong_run_role'
  if (input.registeredTool.projectScoped && !isValidAgentProjectId(input.currentProjectId)) return 'missing_project'
  return undefined
}
