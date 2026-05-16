import type { AgentToolGrant } from '../catalog/agentManifest.js'
import type { AgentRunRole, ToolUnavailableReason } from '../state/types.js'
import type { RegisteredTool } from './toolRegistry.js'

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
  if (input.registeredTool.projectScoped && input.currentProjectId === undefined) return 'missing_project'
  return undefined
}
