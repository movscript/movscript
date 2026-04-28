import type { ToolCall } from './types.js'
import {
  DEFAULT_AGENT_MANIFEST,
  findToolGrant,
  manifestAllowsPermission,
  type AgentManifest,
} from './agentManifest.js'
import { DEFAULT_TOOL_REGISTRY, type RegisteredTool, type ToolRegistry } from './toolRegistry.js'

export interface ToolPolicyResult {
  toolCalls: ToolCall[]
  warnings: string[]
  blockedToolCalls: BlockedToolCall[]
}

export interface BlockedToolCall {
  call: ToolCall
  reason: 'unknown_tool' | 'not_granted' | 'missing_project' | 'approval_required'
  message: string
  tool?: RegisteredTool
}

export function applyToolPolicy(
  requestedToolCalls: ToolCall[],
  options: {
    currentProjectId?: number
    manifest?: AgentManifest
    registry?: ToolRegistry
    approvedToolNames?: string[]
  },
): ToolPolicyResult {
  const warnings: string[] = []
  const toolCalls: ToolCall[] = []
  const blockedToolCalls: BlockedToolCall[] = []
  const manifest = options.manifest ?? DEFAULT_AGENT_MANIFEST
  const registry = options.registry ?? DEFAULT_TOOL_REGISTRY
  const approvedToolNames = new Set(options.approvedToolNames ?? [])

  for (const call of requestedToolCalls) {
    const tool = registry.get(call.name)
    if (!tool) {
      block(call, 'unknown_tool', `${call.name} 未注册到当前 agent 工具表中`)
      continue
    }

    const grant = findToolGrant(manifest, call.name)
    if (grant?.mode === 'deny' || !grant || !manifestAllowsPermission(manifest, tool.permission)) {
      block(call, 'not_granted', `${call.name} 未被当前 agent manifest 授权`)
      continue
    }

    if (requiresApproval(tool, grant.approval) && !approvedToolNames.has(call.name)) {
      block(call, 'approval_required', `${call.name} 需要用户确认后才能执行`)
      continue
    }

    if (tool.projectScoped) {
      if (options.currentProjectId === undefined) {
        block(call, 'missing_project', '当前没有选中项目')
        continue
      }
      toolCalls.push(withProjectId(call, options.currentProjectId))
      continue
    }

    toolCalls.push(call)
  }

  return { toolCalls, warnings, blockedToolCalls }

  function block(
    call: ToolCall,
    reason: BlockedToolCall['reason'],
    message: string,
  ): void {
    if (!warnings.includes(message)) warnings.push(message)
    const blockedTool = registry.get(call.name)
    blockedToolCalls.push({ call, reason, message, ...(blockedTool ? { tool: blockedTool } : {}) })
  }
}

function withProjectId(call: ToolCall, projectId: number): ToolCall {
  return {
    ...call,
    args: {
      ...(call.args ?? {}),
      projectId,
    },
  }
}

function requiresApproval(tool: RegisteredTool, grantApproval: 'never' | 'always' | 'on_write' | undefined): boolean {
  if (grantApproval === 'never') return false
  if (grantApproval === 'always') return true
  if (grantApproval === 'on_write') return tool.risk === 'write' || tool.risk === 'generate' || tool.risk === 'destructive'
  return tool.requiresApprovalByDefault
}
