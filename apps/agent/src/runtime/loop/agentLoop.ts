import type { MCPClient } from '../../mcpClient.js'
import type { JSONValue } from '../types.js'
import type { AgentManifest } from '../manifest/agentManifest.js'
import type {
  AgentApprovalRequest,
  AgentDebugContextPanel,
  AgentRun,
  AgentRunPolicy,
  AgentThread,
  AgentTraceEventKind,
  AgentTraceEvent,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
  ToolCall,
  ToolCallOutcome,
  AgentInputRequest,
} from '../types.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentDraftStore } from '../store/draftStore.js'
import type { BackendApplyClient } from '../store/backendApplyClient.js'
import type { ToolRegistry } from '../tools/toolRegistry.js'
import type { ConfiguredRuntimeModelConfig, RuntimeModelChatMessage, RuntimeModelChatToolCall } from '../model/modelConfig.js'
import type { RuntimeModelAuthContext } from '../model/modelConfig.js'
import { buildContext, buildOpenAIChatTools } from './contextBuilder.js'
import { callModel } from './modelClient.js'
import { executeTool } from './toolExecutor.js'
import { applyToolPolicy } from '../tools/toolPolicy.js'
import { buildApplyDraftPreview } from '../store/draftApply.js'

export interface AgentLoopTraceInput {
  kind: AgentTraceEventKind
  title: string
  summary?: string
  status: AgentTraceEvent['status']
  roundIndex: number
  roundLabel: string
  roundSource: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  stepId?: string
  toolName?: string
  data?: unknown
}

export interface AgentLoopInput {
  run: AgentRun
  thread: AgentThread
  manifest: AgentManifest
  capabilities: ResolvedToolCatalog
  skills: ResolvedAgentSkill[]
  context: AgentDebugContextPanel
  memories: AgentMemory[]
  warnings: string[]
  config: ConfiguredRuntimeModelConfig
  auth: RuntimeModelAuthContext
  policy: AgentRunPolicy
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  draftStore: AgentDraftStore
  backendApplyClient: BackendApplyClient
  registry: ToolRegistry
  forcedToolCalls?: ToolCall[]
  onTrace: (input: AgentLoopTraceInput) => void
  onStepCreate: (type: 'tool_call' | 'message', roundIndex: number, roundLabel: string, roundSource: AgentLoopTraceInput['roundSource'], toolName?: string) => string
  onStepComplete: (stepId: string, result?: JSONValue, error?: string, sandboxed?: boolean) => void
}

export type AgentLoopResult =
  | { status: 'completed'; finalContent: string; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'requires_action'; pendingApprovals: AgentApprovalRequest[]; pendingInputRequests?: AgentInputRequest[]; messages: RuntimeModelChatMessage[]; toolOutcomes: ToolCallOutcome[]; warnings: string[] }
  | { status: 'failed'; error: string }

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentLoopResult> {
  const {
    run, thread, manifest, capabilities, skills, context, memories, config, auth, policy,
    mcpClient, draftStore, backendApplyClient, registry, onTrace, onStepCreate, onStepComplete,
  } = input

  const warnings = [...input.warnings]
  const toolOutcomes: ToolCallOutcome[] = []
  let toolCallCount = 0
  let roundIndex = 1

  // Get last user message
  const lastUser = [...thread.messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) return { status: 'failed', error: 'run requires at least one user message' }

  // Build initial messages
  const { messages, debugParts } = buildContext({
    manifest,
    skills,
    context,
    tools: capabilities,
    policy,
    memories,
    warnings,
    history: thread.messages.filter((m) => m.id !== lastUser.id && m.role !== 'system'),
    userMessage: lastUser.content,
  })

  onTrace({
    kind: 'prompt',
    title: 'Prompt compiled',
    summary: `${messages.length} message(s), ${debugParts.length} debug part(s).`,
    status: 'completed',
    roundIndex: 0,
    roundLabel: 'Setup',
    roundSource: 'setup',
    data: {
      promptPartIds: debugParts.map((p) => p.id),
      messageCount: messages.length,
      systemPromptChars: messages[0]?.content?.length ?? 0,
    },
  })

  // Build tool definitions
  const tools = buildOpenAIChatTools(capabilities)

  // Mutable message history — grows with each turn
  const history: RuntimeModelChatMessage[] = [...messages]

  // Agentic loop
  for (let iteration = 0; iteration < policy.maxIterations; iteration++) {
    const currentRoundIndex = roundIndex++
    const roundLabel = `Model turn ${iteration + 1}`

    // Forced tool calls (from createToolRun) bypass the model on the first iteration
    let requestedCalls: ToolCall[]
    let modelContent: string | null = null
    let modelToolCalls: RuntimeModelChatToolCall[] = []

    if (iteration === 0 && input.forcedToolCalls && input.forcedToolCalls.length > 0) {
      requestedCalls = input.forcedToolCalls
      // Synthesize an assistant message with the forced tool calls
      modelToolCalls = requestedCalls.map((c) => ({
        id: c.id ?? makeId('call'),
        type: 'function' as const,
        function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
      }))
      history.push({ role: 'assistant', content: null, tool_calls: modelToolCalls })
      onTrace({
        kind: 'policy',
        title: 'Forced tool calls injected',
        summary: `${requestedCalls.length} forced call(s) from createToolRun`,
        status: 'info',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: 'model',
        data: { forcedCalls: requestedCalls.map((c) => c.name) },
      })
    } else {
      onTrace({
        kind: 'model_call',
        title: 'Model call started',
        summary: `POST model gateway using ${config.model}`,
        status: 'started',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: 'model',
        data: { model: config.model, messageCount: history.length, toolCount: tools.length },
      })

      let modelResult
      try {
        modelResult = await callModel({
          messages: history,
          tools,
          toolChoice: tools.length > 0 ? 'auto' : undefined,
          config,
          auth,
          onTrace: (event) => {
            onTrace({
              kind: 'model_call',
              title: event.phase === 'request' ? 'Model HTTP request sent' : event.phase === 'response' ? 'Model HTTP response received' : 'Model HTTP call failed',
              summary: event.error ?? (event.trace.response ? `HTTP ${event.trace.response.status} in ${event.trace.latencyMs}ms` : undefined),
              status: event.phase === 'request' ? 'started' : event.phase === 'error' ? 'failed' : event.trace.response?.ok === false ? 'failed' : 'completed',
              roundIndex: currentRoundIndex,
              roundLabel,
              roundSource: 'model',
              data: { phase: event.phase, ...event.trace, ...(event.error ? { error: event.error } : {}) },
            })
          },
        })
      } catch (error) {
        return { status: 'failed', error: error instanceof Error ? error.message : String(error) }
      }

      // Append assistant turn to history
      history.push(modelResult.rawAssistantMessage)
      modelContent = modelResult.content
      modelToolCalls = modelResult.tool_calls

      onTrace({
        kind: 'model_call',
        title: 'Model HTTP response received',
        summary: modelResult.finish_reason === 'tool_calls'
          ? `${modelResult.tool_calls.length} tool call(s) requested`
          : `finish_reason=${modelResult.finish_reason}`,
        status: 'completed',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: 'model',
        data: {
          finish_reason: modelResult.finish_reason,
          tool_calls: modelResult.tool_calls.map((tc) => ({ id: tc.id, name: tc.function.name })),
          content_chars: modelResult.content?.length ?? 0,
          usage: modelResult.usage,
        },
      })

      // Done — model has no more tool calls
      if (modelResult.finish_reason === 'stop' || modelResult.tool_calls.length === 0) {
        return {
          status: 'completed',
          finalContent: modelResult.content ?? '',
          toolOutcomes,
          warnings,
        }
      }

      // Check tool call budget
      const remaining = policy.maxToolCalls - toolCallCount
      if (remaining <= 0) {
        warnings.push(`已达到工具调用上限 ${policy.maxToolCalls}`)
        return {
          status: 'completed',
          finalContent: modelResult.content ?? '',
          toolOutcomes,
          warnings,
        }
      }

      requestedCalls = modelResult.tool_calls.slice(0, remaining).map(toToolCall)
    }

    onTrace({
      kind: 'policy',
      title: `Turn ${iteration + 1}: tool policy evaluated`,
      summary: `${requestedCalls.length} tool call(s) requested`,
      status: 'info',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource: 'model',
      data: { requestedCalls: requestedCalls.map((c) => ({ id: c.id, name: c.name })) },
    })

    // Apply tool policy
    const roundSource = (iteration === 0 && input.forcedToolCalls?.length) ? 'model' as const : 'model' as const
    const policyResult = applyToolPolicy(requestedCalls, {
      currentProjectId: context.project?.id,
      manifest,
      catalog: capabilities,
      registry,
      approvedToolNames: getApprovedToolNames(run),
      sandboxMode: policy.sandboxMode === true,
    })
    warnings.push(...policyResult.warnings.filter((w) => !warnings.includes(w)))

    onTrace({
      kind: 'policy',
      title: `Turn ${iteration + 1}: policy result`,
      summary: `${policyResult.toolCalls.length} allowed, ${policyResult.blockedToolCalls.length} blocked`,
      status: policyResult.blockedToolCalls.some((b) => b.reason === 'approval_required') ? 'blocked' : 'completed',
      roundIndex: currentRoundIndex,
      roundLabel,
      roundSource,
      data: {
        allowed: policyResult.toolCalls.map((c) => c.name),
        blocked: policyResult.blockedToolCalls.map((b) => ({ name: b.call.name, reason: b.reason })),
      },
    })

    // Approval required — pause run
    const approvalBlocked = policyResult.blockedToolCalls.filter((b) => b.reason === 'approval_required')
    if (approvalBlocked.length > 0) {
      const pendingApprovals: AgentApprovalRequest[] = approvalBlocked.map((blocked) => {
        const now = new Date().toISOString()
        let preview: JSONValue | undefined
        if (blocked.call.name === 'movscript_apply_draft') {
          try {
            preview = buildApplyDraftPreview(draftStore, blocked.call.args ?? {}) as unknown as JSONValue
          } catch {
            // preview unavailable
          }
        }
        return {
          id: makeId('approval'),
          runId: run.id,
          toolName: blocked.call.name,
          ...(blocked.call.args ? { args: blocked.call.args } : {}),
          reason: blocked.message,
          ...(blocked.tool?.risk ? { risk: blocked.tool.risk } : {}),
          ...(blocked.tool?.permission ? { permission: blocked.tool.permission } : {}),
          ...(preview !== undefined ? { preview } : {}),
          status: 'pending' as const,
          createdAt: now,
          updatedAt: now,
        }
      })
      return { status: 'requires_action', pendingApprovals, messages: history, toolOutcomes, warnings }
    }

    if (policyResult.toolCalls.length === 0) {
      // All calls blocked for non-approval reasons — stop
      return {
        status: 'completed',
        finalContent: modelContent ?? (warnings.length > 0 ? warnings.join('\n') : ''),
        toolOutcomes,
        warnings,
      }
    }

    // Execute allowed tools
    const turnResults: Array<{ toolCall: RuntimeModelChatToolCall; content: string }> = []
    const effectiveRoundSource = (iteration === 0 && input.forcedToolCalls?.length) ? 'runtime_rule' as const : 'model' as const

    for (const call of policyResult.toolCalls) {
      toolCallCount++
      const stepId = onStepCreate('tool_call', currentRoundIndex, roundLabel, effectiveRoundSource, call.name)

      onTrace({
        kind: 'tool_call',
        title: `Tool call started: ${call.name}`,
        summary: Object.keys(call.args ?? {}).length > 0 ? `${Object.keys(call.args ?? {}).length} arg(s)` : 'No arguments',
        status: 'started',
        roundIndex: currentRoundIndex,
        roundLabel,
        roundSource: effectiveRoundSource,
        stepId,
        toolName: call.name,
        data: { args: call.args ?? {} },
      })

      try {
        const execResult = await executeTool(call, {
          run,
          mcpClient,
          draftStore,
          backendApplyClient,
          registry,
          sandboxMode: policy.sandboxMode === true,
        })

        toolOutcomes.push({ call, result: execResult.result })
        onStepComplete(stepId, execResult.result, undefined, execResult.sandboxed)

        onTrace({
          kind: 'tool_call',
          title: execResult.sandboxed ? `Tool sandboxed: ${call.name}` : `Tool completed: ${call.name}`,
          summary: summarizeResult(execResult.result),
          status: 'completed',
          roundIndex: currentRoundIndex,
          roundLabel,
          roundSource: effectiveRoundSource,
          stepId,
          toolName: call.name,
          data: { source: execResult.source, result: execResult.result, sandboxed: execResult.sandboxed },
        })

        // Find the matching tool_call from the model response to get the id
        const matchedModelCall = modelToolCalls.find((tc) => tc.function.name === call.name && !turnResults.some((r) => r.toolCall.id === tc.id))
        const toolCallId = matchedModelCall?.id ?? call.id ?? `call_${toolCallCount}`
        turnResults.push({
          toolCall: matchedModelCall ?? { id: toolCallId, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) } },
          content: formatToolMessageContent(call, execResult.result),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        warnings.push(`${call.name} 未完成：${message}`)
        toolOutcomes.push({ call, error: message })
        onStepComplete(stepId, undefined, message)

        onTrace({
          kind: 'tool_call',
          title: `Tool call failed: ${call.name}`,
          summary: message,
          status: 'failed',
          roundIndex: currentRoundIndex,
          roundLabel,
          roundSource: effectiveRoundSource,
          stepId,
          toolName: call.name,
          data: { error: message },
        })

        const matchedModelCall = modelToolCalls.find((tc) => tc.function.name === call.name && !turnResults.some((r) => r.toolCall.id === tc.id))
        const toolCallId = matchedModelCall?.id ?? call.id ?? `call_${toolCallCount}`
        turnResults.push({
          toolCall: matchedModelCall ?? { id: toolCallId, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) } },
          content: `## Tool Error\n- Tool: ${call.name}\n- Error: ${message}`,
        })
      }
    }

    // Append tool results to history
    for (const { toolCall, content } of turnResults) {
      history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content,
      })
    }

    // For forced tool calls, we're done after one execution round — return completed
    if (iteration === 0 && input.forcedToolCalls?.length) {
      return {
        status: 'completed',
        finalContent: '',
        toolOutcomes,
        warnings,
      }
    }
  }

  // Max iterations reached
  warnings.push(`已达到最大迭代次数 ${policy.maxIterations}`)
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')
  return {
    status: 'completed',
    finalContent: lastAssistant?.content ?? '',
    toolOutcomes,
    warnings,
  }
}

function formatToolMessageContent(call: ToolCall, result: JSONValue | undefined): string {
  const contentText = extractMCPText(result)
  if (contentText) return `## Tool Result\n- Tool: ${call.name}\n\n${contentText}`
  return `## Tool Result\n- Tool: ${call.name}\n\n${renderMarkdownValue(result ?? null)}`
}

function extractMCPText(value: JSONValue | undefined): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const content = value.content
  if (!Array.isArray(content)) return undefined
  const text = content
    .flatMap((item) => item && typeof item === 'object' && !Array.isArray(item) && typeof item.text === 'string' ? [item.text] : [])
    .join('\n\n')
    .trim()
  return text || undefined
}

function renderMarkdownValue(value: JSONValue): string {
  if (value === null) return 'null'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '- none'
    return value.map((item, index) => `${index + 1}. ${renderInlineMarkdownValue(item)}`).join('\n')
  }
  const lines: string[] = []
  for (const [key, item] of Object.entries(value)) {
    lines.push(`- ${key}: ${renderInlineMarkdownValue(item)}`)
  }
  return lines.length > 0 ? lines.join('\n') : '- none'
}

function renderInlineMarkdownValue(value: JSONValue): string {
  if (value === null) return 'null'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.length === 0 ? 'none' : value.map(renderInlineMarkdownValue).join('; ')
  return Object.entries(value).map(([key, item]) => `${key}=${renderInlineMarkdownValue(item)}`).join(', ')
}

function toToolCall(tc: RuntimeModelChatToolCall): ToolCall {
  let args: Record<string, JSONValue> = {}
  try {
    const parsed = JSON.parse(tc.function.arguments)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      args = parsed as Record<string, JSONValue>
    }
  } catch {
    // leave empty
  }
  return { id: tc.id, name: tc.function.name, args }
}

function getApprovedToolNames(run: AgentRun): string[] {
  const value = run.metadata?.approvedToolNames
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function summarizeResult(value: JSONValue | undefined): string {
  if (value === undefined || value === null) return 'null'
  if (typeof value !== 'object') return String(value).slice(0, 180)
  if (Array.isArray(value)) return `${value.length} item(s)`
  const keys = Object.keys(value)
  const status = typeof value.status === 'string' ? `${value.status}; ` : ''
  return `${status}${keys.length} key(s): ${keys.slice(0, 6).join(', ')}`
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
