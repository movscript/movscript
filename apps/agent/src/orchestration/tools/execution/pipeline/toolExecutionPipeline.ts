import { AgentFileSystem } from '../../../../files/core/system/agentFileSystem.js'
import { WorkspaceFileProvider } from '../../../../files/providers/workspaceFileProvider.js'
import { isRecord } from '../../../../shared/json/jsonValue.js'
import type { RuntimeModelChatMessage } from '../../../../model/config/modelConfig.js'
import type { ToolSource } from '../../../../ports/tools/toolExecutionSource.js'
import type { JSONValue, ResolvedAgentSkill, ResolvedToolCatalog, ToolCall } from '../../../../state/shared/types.js'
import type { BlockedToolCall, ToolPermissionResult } from '../../../../tools/permissions/evaluation/toolPermissions.js'
import { normalizeToolExecutionMetadata, type RegisteredTool, type ToolExecutionMetadata, type ToolRiskLevel } from '../../../../tools/registry/core/toolRegistry.js'
import type { ToolExecutionResult, ToolExecutorOptions } from '../executor/toolExecutor.js'
import { buildSkillActivationRepairCalls } from '../../../model/permissions/repair/agentGraphSkillActivationRepair.js'
import {
  buildToolExecutionGatePendingActions,
  evaluateToolExecutionGate,
  type ToolExecutionGateDecision,
  type ToolExecutionGateOptions,
  type ToolExecutionGatePendingActions,
} from '../../gate/toolExecutionGate.js'
import type { AgentGraphMakeId } from '../../../graph/input/agentGraphInputRequests.js'

export type ToolExecutionPipelineStageName =
  | 'resolve'
  | 'schema_validation'
  | 'permission_gate'
  | 'sandbox'
  | 'runtime_handler'
  | 'external_gateway'
  | 'result_shaping'

export interface ToolExecutionPipelineStage {
  name: ToolExecutionPipelineStageName
  status: 'completed' | 'skipped' | 'failed'
  message?: string
}

export interface ToolExecutionPipelineSnapshot {
  toolName: string
  registered: boolean
  source: ToolSource
  execution: ToolExecutionMetadata
  stages: ToolExecutionPipelineStage[]
}

export interface ToolExecutionPipelinePreflightPermissionsView {
  decision: ToolExecutionGateDecision['decision']
  permissionResult: ToolPermissionResult
  allowedCalls: ToolCall[]
  blockedToolCalls: BlockedToolCall[]
  approvalBlockedToolCalls: BlockedToolCall[]
  warnings: string[]
}

export type ToolExecutionPipelinePreflightResult =
  | {
    kind: 'input_required' | 'approval_required'
    gate: ToolExecutionGateDecision
    permissions: ToolExecutionPipelinePreflightPermissionsView
    pendingActions: ToolExecutionGatePendingActions
  }
  | {
    kind: 'repair'
    gate: ToolExecutionGateDecision
    permissions: ToolExecutionPipelinePreflightPermissionsView
    repairGate: ToolExecutionGateDecision
    repairCalls: ToolCall[]
    pendingActions: ToolExecutionGatePendingActions
    warnings: string[]
  }
  | {
    kind: 'allow' | 'deny'
    gate: ToolExecutionGateDecision
    permissions: ToolExecutionPipelinePreflightPermissionsView
    pendingActions: ToolExecutionGatePendingActions
  }

export function preflightToolExecutionPipeline(input: {
  requestedCalls: ToolCall[]
  options: ToolExecutionGateOptions
  runId: string
  makeId: AgentGraphMakeId
  skillRepair?: {
    capabilities: ResolvedToolCatalog
    skills: ResolvedAgentSkill[]
  }
}): ToolExecutionPipelinePreflightResult {
  const gate = evaluateToolExecutionGate(input.requestedCalls, input.options)
  const permissions = toolExecutionPipelinePreflightPermissionsView(gate)
  const pendingActions = buildToolExecutionGatePendingActions({
    decision: gate,
    runId: input.runId,
    makeId: input.makeId,
  })
  if (gate.decision === 'deny' && gate.allowedCalls.length === 0 && input.skillRepair) {
    const repairCalls = buildSkillActivationRepairCalls(gate.blockedToolCalls, {
      capabilities: input.skillRepair.capabilities,
      skills: input.skillRepair.skills,
      registry: input.options.registry,
      makeId: input.makeId,
    })
    if (repairCalls.length > 0) {
      const repairGate = evaluateToolExecutionGate(repairCalls, input.options)
      if (repairGate.allowedCalls.length > 0) {
        return {
          kind: 'repair',
          gate,
          permissions,
          repairGate,
          repairCalls: repairGate.allowedCalls,
          pendingActions,
          warnings: [
            ...repairGate.warnings,
            'A required skill was loaded automatically before retrying the blocked tool call.',
          ],
        }
      }
    }
  }
  return {
    kind: gate.decision,
    gate,
    permissions,
    pendingActions,
  }
}

function toolExecutionPipelinePreflightPermissionsView(gate: ToolExecutionGateDecision): ToolExecutionPipelinePreflightPermissionsView {
  return {
    decision: gate.decision,
    permissionResult: gate.permissionResult,
    allowedCalls: gate.allowedCalls,
    blockedToolCalls: gate.blockedToolCalls,
    approvalBlockedToolCalls: gate.approvalBlockedToolCalls,
    warnings: gate.warnings,
  }
}

export async function runToolExecutionPipeline(call: ToolCall, options: ToolExecutorOptions): Promise<ToolExecutionResult> {
  let effectiveCall = call
  let args = normalizeToolArgs(effectiveCall)
  const tool = options.registry.get(call.name)
  const source = initialToolSource(tool)
  const execution = tool ? tool.execution ?? normalizeToolExecutionMetadata(undefined, tool.risk) : normalizeToolExecutionMetadata(undefined, 'write')
  const stages: ToolExecutionPipelineStage[] = []

  stages.push({
    name: 'resolve',
    status: tool ? 'completed' : 'skipped',
    message: tool ? `registered:${tool.source ?? 'runtime'}` : 'tool is not registered; external gateway may still handle it',
  })

  const validation = validateToolInput(tool, args)
  stages.push({
    name: 'schema_validation',
    status: validation.ok ? 'completed' : 'failed',
    ...(validation.message ? { message: validation.message } : {}),
  })
  if (!validation.ok) {
    return {
      call: effectiveCall,
      error: validation.message,
      errorData: validation.errorData,
      source,
      pipeline: pipelineSnapshot(call.name, tool, source, execution, stages),
    }
  }

  const permissionGate = applyPipelinePermissionGate(effectiveCall, options)
  if (permissionGate.status === 'blocked') {
    stages.push({
      name: 'permission_gate',
      status: 'failed',
      message: permissionGate.message,
    })
    return {
      call: effectiveCall,
      error: `Tool execution blocked by permissions: ${permissionGate.message}`,
      errorData: {
        code: 'tool_permission_blocked',
        reason: permissionGate.reason,
      },
      source,
      pipeline: pipelineSnapshot(call.name, tool, source, execution, stages),
    }
  }
  if (permissionGate.status === 'allowed') {
    stages.push({
      name: 'permission_gate',
      status: 'completed',
      message: permissionGate.message,
    })
    effectiveCall = permissionGate.call
    args = normalizeToolArgs(effectiveCall)
  } else {
    stages.push({
      name: 'permission_gate',
      status: 'skipped',
      message: 'no permission gate context',
    })
  }

  throwIfAborted(options.signal)
  if (options.sandboxMode && tool && isSandboxIntercepted(tool.risk)) {
    stages.push({ name: 'sandbox', status: 'completed', message: 'intercepted by sandbox mode' })
    stages.push({ name: 'runtime_handler', status: 'skipped', message: 'sandbox already produced result' })
    stages.push({ name: 'external_gateway', status: 'skipped', message: 'sandbox already produced result' })
    stages.push({ name: 'result_shaping', status: 'completed', message: execution.resultRefStrategy ?? 'auto' })
    return {
      call: effectiveCall,
      result: buildSandboxResult(call.name, args),
      sandboxed: true,
      source: 'sandbox',
      pipeline: pipelineSnapshot(call.name, tool, 'sandbox', execution, stages),
    }
  }
  stages.push({ name: 'sandbox', status: 'skipped' })

  const runtimeResult = await executeRuntimeHandler(effectiveCall, args, options)
  if (runtimeResult.handled) {
    stages.push({ name: 'runtime_handler', status: 'completed' })
    stages.push({ name: 'external_gateway', status: 'skipped', message: 'runtime handler produced result' })
    stages.push({ name: 'result_shaping', status: 'completed', message: execution.resultRefStrategy ?? 'auto' })
    return {
      call: effectiveCall,
      result: runtimeResult.result,
      supplementalMessages: runtimeResult.supplementalMessages,
      source: 'runtime',
      pipeline: pipelineSnapshot(call.name, tool, 'runtime', execution, stages),
    }
  }
  stages.push({ name: 'runtime_handler', status: 'skipped', message: 'no runtime handler matched' })

  throwIfAborted(options.signal)
  const result = await options.externalToolGatewayPort.executeTool(call.name, args, { signal: options.signal })
  throwIfAborted(options.signal)
  stages.push({ name: 'external_gateway', status: 'completed' })
  stages.push({ name: 'result_shaping', status: 'completed', message: execution.resultRefStrategy ?? 'auto' })
  return {
    call: effectiveCall,
    result,
    source: 'mcp',
    pipeline: pipelineSnapshot(call.name, tool, 'mcp', execution, stages),
  }
}

function applyPipelinePermissionGate(call: ToolCall, options: ToolExecutorOptions): {
  status: 'skipped'
} | {
  status: 'allowed'
  call: ToolCall
  message: string
} | {
  status: 'blocked'
  reason: string
  message: string
} {
  if (!options.permissionGate) return { status: 'skipped' }
  const gate = evaluateToolExecutionGate([call], {
    currentProjectId: options.permissionGate.currentProjectId,
    manifest: options.permissionGate.manifest,
    catalog: options.permissionGate.catalog,
    registry: options.registry,
    approvedToolNames: options.permissionGate.approvedToolNames,
    approvalMode: options.permissionGate.approvalMode,
    sandboxMode: options.sandboxMode,
    runRole: options.permissionGate.runRole,
  })
  const allowedCall = gate.allowedCalls[0]
  if (allowedCall) {
    return {
      status: 'allowed',
      call: allowedCall,
      message: 'tool call satisfies runtime permissions',
    }
  }
  if (gate.decision === 'input_required') {
    return {
      status: 'blocked',
      reason: 'input_required',
      message: `${call.name} must pause through the runtime input gate before execution`,
    }
  }
  const blocked = gate.blockedToolCalls[0]
  return {
    status: 'blocked',
    reason: blocked?.reason ?? 'unknown_tool',
    message: blocked?.message ?? gate.warnings[0] ?? `${call.name} blocked by runtime permissions`,
  }
}

function normalizeToolArgs(call: ToolCall): Record<string, JSONValue> {
  return call.args ?? call.arguments ?? {}
}

function initialToolSource(tool: RegisteredTool | undefined): ToolSource {
  if (!tool) return 'mcp'
  if (tool.source === 'mcp') return 'mcp'
  return 'runtime'
}

function validateToolInput(tool: RegisteredTool | undefined, args: Record<string, JSONValue>): {
  ok: boolean
  message?: string
  errorData?: JSONValue
} {
  if (!tool || !isRecord(tool.inputSchema)) return { ok: true }
  const errors = validateJSONSchemaValue(args, tool.inputSchema, 'args')
  if (errors.length === 0) return { ok: true }
  return {
    ok: false,
    message: `Tool input schema validation failed: ${errors.slice(0, 3).join('; ')}`,
    errorData: {
      code: 'schema_invalid',
      errors,
    },
  }
}

function validateJSONSchemaValue(value: JSONValue, schema: Record<string, unknown>, path: string): string[] {
  const errors: string[] = []
  const anyOf = schemaList(schema.anyOf)
  if (anyOf.length > 0 && !anyOf.some((child) => validateJSONSchemaValue(value, child, path).length === 0)) {
    errors.push(`${path} must match at least one allowed schema`)
  }
  const oneOf = schemaList(schema.oneOf)
  if (oneOf.length > 0 && oneOf.filter((child) => validateJSONSchemaValue(value, child, path).length === 0).length !== 1) {
    errors.push(`${path} must match exactly one allowed schema`)
  }
  for (const child of schemaList(schema.allOf)) {
    errors.push(...validateJSONSchemaValue(value, child, path))
  }
  const expectedTypes = schemaTypes(schema.type)
  if (expectedTypes.length > 0 && !expectedTypes.some((type) => matchesSchemaType(value, type))) {
    errors.push(`${path} expected ${expectedTypes.join(' or ')}`)
    return errors
  }
  if ('const' in schema && !jsonValueEquals(value, schema.const)) {
    errors.push(`${path} must equal ${formatSchemaValue(schema.const)}`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonValueEquals(value, item))) {
    errors.push(`${path} must be one of ${schema.enum.map(formatSchemaValue).join(', ')}`)
  }
  if (typeof value === 'number') {
    const minimum = numberSchemaValue(schema.minimum)
    const maximum = numberSchemaValue(schema.maximum)
    if (minimum !== undefined && value < minimum) errors.push(`${path} must be >= ${minimum}`)
    if (maximum !== undefined && value > maximum) errors.push(`${path} must be <= ${maximum}`)
  }
  if (typeof value === 'string') {
    const minLength = numberSchemaValue(schema.minLength)
    const maxLength = numberSchemaValue(schema.maxLength)
    if (minLength !== undefined && value.length < minLength) errors.push(`${path} length must be >= ${minLength}`)
    if (maxLength !== undefined && value.length > maxLength) errors.push(`${path} length must be <= ${maxLength}`)
  }
  if (Array.isArray(value)) {
    const minItems = numberSchemaValue(schema.minItems)
    const maxItems = numberSchemaValue(schema.maxItems)
    if (minItems !== undefined && value.length < minItems) errors.push(`${path} must contain at least ${minItems} item(s)`)
    if (maxItems !== undefined && value.length > maxItems) errors.push(`${path} must contain at most ${maxItems} item(s)`)
    const itemSchema = recordValue(schema.items)
    if (itemSchema) {
      value.forEach((item, index) => {
        errors.push(...validateJSONSchemaValue(item, itemSchema, `${path}[${index}]`))
      })
    }
  }
  if (isRecord(value)) {
    const required = stringArray(schema.required)
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key} is required`)
    }
    const properties = isRecord(schema.properties) ? schema.properties : {}
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!(key in value) || !isRecord(childSchema)) continue
      errors.push(...validateJSONSchemaValue(value[key] as JSONValue, childSchema, `${path}.${key}`))
    }
    const extraKeys = Object.keys(value).filter((key) => !(key in properties))
    if (schema.additionalProperties === false && extraKeys.length > 0) {
      for (const key of extraKeys) errors.push(`${path}.${key} is not allowed`)
    } else if (isRecord(schema.additionalProperties)) {
      for (const key of extraKeys) {
        errors.push(...validateJSONSchemaValue(value[key] as JSONValue, schema.additionalProperties, `${path}.${key}`))
      }
    }
  }
  return errors
}

function schemaTypes(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return []
}

function matchesSchemaType(value: JSONValue, type: string): boolean {
  if (type === 'object') return isRecord(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'string') return typeof value === 'string'
  if (type === 'number') return typeof value === 'number'
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'null') return value === null
  return true
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function schemaList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => isRecord(item))
}

function numberSchemaValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => jsonValueEquals(item, right[index]))
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && jsonValueEquals(left[key], right[key]))
  }
  return false
}

function formatSchemaValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

async function executeRuntimeHandler(
  call: ToolCall,
  args: Record<string, JSONValue>,
  options: ToolExecutorOptions,
): Promise<{ handled: true; result: JSONValue; supplementalMessages?: RuntimeModelChatMessage[] } | { handled: false }> {
  const runtimeToolHandler = options.runtimeToolHandlers.get(call.name)
  if (!runtimeToolHandler) return { handled: false }
  const fileSystem = options.fileSystem ?? new AgentFileSystem([
    new WorkspaceFileProvider(options.workspaceStore),
  ])
  const handlerResult = await runtimeToolHandler.execute({
    call,
    args,
    run: options.run,
    workspaceStore: options.workspaceStore,
    workspaceApplyPort: options.workspaceApplyPort,
    workspaceApplyPreviewPort: options.workspaceApplyPreviewPort,
    workspaceSnapshotHydrationPort: options.workspaceSnapshotHydrationPort,
    resourceFilePort: options.resourceFilePort,
    imageProcessingPort: options.imageProcessingPort,
    videoFrameExtractionPort: options.videoFrameExtractionPort,
    fileSystem,
    registry: options.registry,
    memoryManager: options.memoryManager,
    referenceManager: options.referenceManager,
    catalogManager: options.catalogManager,
    sandboxMode: options.sandboxMode,
    signal: options.signal,
  })
  throwIfAborted(options.signal)
  if (handlerResult === undefined) return { handled: false }
  return {
    handled: true,
    result: handlerResult.result,
    ...(handlerResult.supplementalMessages ? { supplementalMessages: handlerResult.supplementalMessages } : {}),
  }
}

function pipelineSnapshot(
  toolName: string,
  tool: RegisteredTool | undefined,
  source: ToolSource,
  execution: ToolExecutionMetadata,
  stages: ToolExecutionPipelineStage[],
): ToolExecutionPipelineSnapshot {
  return {
    toolName,
    registered: Boolean(tool),
    source,
    execution,
    stages,
  }
}

function isSandboxIntercepted(risk: ToolRiskLevel): boolean {
  return risk === 'write' || risk === 'generate' || risk === 'destructive'
}

function buildSandboxResult(toolName: string, args: Record<string, JSONValue>): JSONValue {
  return {
    sandboxed: true,
    wouldHaveExecuted: { name: toolName, args },
    simulatedResult: `${toolName} intercepted by sandbox mode (not actually executed)`,
    interceptedAt: new Date().toISOString(),
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const reason = signal.reason
  if (reason instanceof Error) throw reason
  const error = new Error(typeof reason === 'string' ? reason : 'Run was cancelled.')
  error.name = 'AbortError'
  throw error
}
