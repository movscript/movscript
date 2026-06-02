import type { JSONValue, ToolCall } from '../../../state/shared/types.js'
import type { AgentRunRole } from '../../../state/shared/types.js'
import type { AgentRuntimeLimits } from '../../../state/shared/types.js'
import {
  DEFAULT_AGENT_MANIFEST,
  findToolGrant,
  type AgentManifest,
} from '../../../catalog/manifest/agentManifest.js'
import { DEFAULT_TOOL_REGISTRY, type RegisteredTool, type ToolRegistry } from '../../registry/core/toolRegistry.js'
import type { ResolvedToolCatalog } from '../../../state/shared/types.js'
import { isSandboxAutoAllowedTool, requiresToolApproval } from '../approval/toolApprovalRules.js'
import { isValidAgentProjectId } from '../../../context/runtime/runtimeContext.js'

export interface ToolPermissionResult {
  toolCalls: ToolCall[]
  warnings: string[]
  blockedToolCalls: BlockedToolCall[]
}

export interface BlockedToolCall {
  call: ToolCall
  reason: 'unknown_tool' | 'not_granted' | 'missing_project' | 'approval_required' | 'skill_scope'
  message: string
  tool?: RegisteredTool
}

export function applyToolPermissions(
  requestedToolCalls: ToolCall[],
  options: {
    currentProjectId?: number
    manifest?: AgentManifest
    registry?: ToolRegistry
    catalog?: ResolvedToolCatalog
    approvedToolNames?: string[]
    approvalMode?: AgentRuntimeLimits['approvalMode']
    sandboxMode?: boolean
    runRole?: AgentRunRole
  },
): ToolPermissionResult {
  const warnings: string[] = []
  const toolCalls: ToolCall[] = []
  const blockedToolCalls: BlockedToolCall[] = []
  const manifest = options.manifest ?? DEFAULT_AGENT_MANIFEST
  const registry = options.registry ?? DEFAULT_TOOL_REGISTRY
  const approvedToolNames = new Set(options.approvedToolNames ?? [])

  for (const call of requestedToolCalls) {
    const tool = registry.get(call.name)
    const catalogTool = options.catalog?.byName[call.name]
    if (catalogTool && !catalogTool.available && catalogTool.unavailableReason !== 'mcp_unavailable') {
      const reason = mapCatalogReason(catalogTool.unavailableReason)
      block(call, reason, catalogWarningMessage(call.name, catalogTool.unavailableReason))
      continue
    }
    if (!tool) {
      block(call, 'unknown_tool', `${call.name} 未注册到当前 agent 工具表中`)
      continue
    }

    const grant = findToolGrant(manifest, call.name)
    if (grant?.mode === 'deny' || !grant) {
      block(call, 'not_granted', `${call.name} 未被当前 agent manifest 授权`)
      continue
    }

    if (options.runRole && tool.allowedRunRoles && !tool.allowedRunRoles.includes(options.runRole)) {
      block(call, 'unknown_tool', `${call.name} 当前 run 角色不可用`)
      continue
    }

    if (
      !isSandboxAutoAllowedTool(tool, options.sandboxMode)
      && requiresToolApproval(tool, grant.approval)
      && !approvedToolNames.has(call.name)
      && !isAutoApprovedByRuntimeLimits(tool.risk, options.approvalMode)
    ) {
      block(call, 'approval_required', `${call.name} 需要用户确认后才能执行`)
      continue
    }

    if (tool.projectScoped) {
      const projectId = isValidAgentProjectId(options.currentProjectId)
        ? options.currentProjectId
        : explicitReadProjectId(tool, call)
      if (!isValidAgentProjectId(projectId)) {
        block(call, 'missing_project', '当前没有选中项目')
        continue
      }
      toolCalls.push(withProjectId(call, projectId))
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

function explicitReadProjectId(tool: RegisteredTool, call: ToolCall): number | undefined {
  if (tool.risk !== 'read') return undefined
  const projectId = call.args?.projectId
  return isValidAgentProjectId(projectId) ? projectId : undefined
}

function isAutoApprovedByRuntimeLimits(risk: RegisteredTool['risk'], approvalMode?: AgentRuntimeLimits['approvalMode']): boolean {
  if (approvalMode === 'auto') return risk !== 'destructive'
  if (approvalMode === 'auto_readonly') return risk === 'read' || risk === 'workspace' || risk === 'ui'
  return false
}

function mapCatalogReason(reason: ResolvedToolCatalog['blocked'][number]['unavailableReason']): BlockedToolCall['reason'] {
  if (reason === 'missing_project') return 'missing_project'
  if (reason === 'skill_scope') return 'skill_scope'
  if (reason === 'not_granted' || reason === 'denied' || reason === 'missing_permission') return 'not_granted'
  if (reason === 'inactive' || reason === 'wrong_run_role') return 'unknown_tool'
  return 'unknown_tool'
}

function catalogWarningMessage(toolName: string, reason: ResolvedToolCatalog['blocked'][number]['unavailableReason']): string {
  if (reason === 'missing_project') return '当前没有选中项目'
  if (reason === 'not_granted' || reason === 'denied' || reason === 'missing_permission') return `${toolName} 未被当前 agent manifest 授权`
  if (reason === 'inactive') return `${toolName} 未被当前请求激活`
  if (reason === 'wrong_run_role') return `${toolName} 当前 run 角色不可用`
  if (reason === 'unregistered') return `${toolName} 未注册到当前 agent 工具表中`
  if (reason === 'mcp_unavailable') return `${toolName} 当前 MCP tools/list 不可用`
  return `${toolName} 当前不可执行：${reason ?? 'unknown'}`
}

function withProjectId(call: ToolCall, projectId: number): ToolCall {
  if (call.name === 'core_work_start' && call.args?.kind === 'generation_job' && isPlainArgs(call.args.request)) {
    return {
      ...call,
      args: {
        ...call.args,
        request: {
          ...call.args.request,
          projectId,
        },
      },
    }
  }
  return {
    ...call,
    args: {
      ...(call.args ?? {}),
      projectId,
    },
  }
}

function isPlainArgs(value: unknown): value is Record<string, JSONValue> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
