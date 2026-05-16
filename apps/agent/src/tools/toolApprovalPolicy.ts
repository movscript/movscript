import type { AgentToolApprovalMode } from '../catalog/agentManifest.js'
import type { RegisteredTool } from './toolRegistry.js'

export function defaultToolApproval(tool?: RegisteredTool): AgentToolApprovalMode {
  if (!tool) return 'always'
  return tool.requiresApprovalByDefault ? 'always' : 'never'
}

export function requiresToolApproval(
  tool: RegisteredTool | undefined,
  grantApproval: AgentToolApprovalMode | undefined,
): boolean {
  if (!tool) return true
  if (grantApproval === 'never') return false
  if (grantApproval === 'always') return true
  if (grantApproval === 'on_write') return isWriteLikeToolRisk(tool.risk)
  return tool.requiresApprovalByDefault
}

export function isSandboxAutoAllowedTool(tool: RegisteredTool, sandboxMode?: boolean): boolean {
  return sandboxMode === true && isWriteLikeToolRisk(tool.risk)
}

function isWriteLikeToolRisk(risk: RegisteredTool['risk']): boolean {
  return risk === 'write' || risk === 'generate' || risk === 'destructive'
}
