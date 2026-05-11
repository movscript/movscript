import type { JSONValue } from '../types.js'
import type { NormalizedClientInput } from './normalizeClientInput.js'
import type { AgentCommandRuntime } from './commandRouter.js'
import type {
  AgentDebugContextPanel,
  AgentMessage,
  AgentRun,
  AgentRunPolicy,
  ResolvedAgentSkill,
  ResolvedToolCatalog,
} from '../state/types.js'
import type { AgentManifest } from '../manifest/agentManifest.js'
import type { AgentMemory } from '../memory/types.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import { renderDebugContextText, renderMemoryFilesText } from './contextText.js'
import { buildContext } from '../orchestration/contextBuilder.js'

export function isLocalDiagnosticCommand(name: string): boolean {
  return name === 'context' || name === 'memory'
}

export function buildLocalDiagnosticFallbackContextResult(clientInput: NormalizedClientInput | undefined, error: string): JSONValue {
  const ui = clientInput?.uiSnapshot
  const snapshot: Record<string, JSONValue> = {
    route: {
      pathname: ui?.route?.pathname ?? '/',
      ...(typeof ui?.route?.search === 'string' ? { search: ui.route.search } : {}),
      ...(typeof ui?.route?.hash === 'string' ? { hash: ui.route.hash } : {}),
    },
    ...(ui?.project ? {
      project: {
        ...(typeof ui.project.id === 'number' ? { id: ui.project.id } : {}),
        ...(typeof ui.project.name === 'string' ? { name: ui.project.name } : {}),
        ...(typeof ui.project.status === 'string' ? { status: ui.project.status } : {}),
        ...(typeof ui.project.description === 'string' ? { description: ui.project.description } : {}),
      },
    } : {}),
    ...(typeof ui?.productionId === 'number' ? { productionId: ui.productionId } : {}),
    selection: ui?.selection
      ? {
        ...(typeof ui.selection.entityType === 'string' ? { entityType: ui.selection.entityType } : {}),
        ...((typeof ui.selection.entityId === 'number' || typeof ui.selection.entityId === 'string') ? { entityId: ui.selection.entityId } : {}),
        ...(typeof ui.selection.label === 'string' ? { label: ui.selection.label } : {}),
      }
      : null,
    recentResources: toJSONValue(ui?.recentResources ?? []),
    projects: [],
    contextSource: 'client_input_fallback',
    contextError: error,
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ snapshot }, null, 2),
    }],
  }
}

export function renderLocalDiagnosticCommand(input: {
  command: AgentCommandRuntime
  run: AgentRun
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  memoryStorePath?: string
  contractResolver: AgentRuntimeContractResolver
}): string {
  if (input.command.name === 'context') {
    return renderModelGatewayMessagesText(buildContext({
      manifest: input.manifest,
      skills: input.skills,
      context: input.context,
      tools: input.tools,
      policy: input.policy,
      memories: input.memories,
      warnings: input.warnings,
      history: input.history,
      userMessage: input.userMessage,
      command: input.command,
      contractResolver: input.contractResolver,
    }).messages)
  }
  if (input.command.name === 'memory') {
    return renderMemoryFilesText(input.memories, input.memoryStorePath)
  }
  return ''
}

export function renderLocalFinalAssistantContent(input: {
  command: AgentCommandRuntime
  run: AgentRun
  context: Record<string, unknown> | undefined
  warnings: string[]
  memories: AgentMemory[]
  memoryStorePath?: string
  modelContent: string
}): string {
  if (input.command.name === 'context') {
    return renderLocalContextCommand({
      command: input.command.rawName ?? '/context',
      run: input.run,
      context: input.context,
      warnings: input.warnings,
    })
  }
  if (input.command.name === 'memory') {
    return renderMemoryFilesText(input.memories, input.memoryStorePath)
  }
  return input.modelContent
}

function renderLocalContextCommand(input: {
  command: string
  run: AgentRun
  context: Record<string, unknown> | undefined
  warnings: string[]
}): string {
  const lines = [
    `Command: ${input.command}`,
    `Run: ${input.run.id}`,
    `Thread: ${input.run.threadId}`,
    '',
    'Model context text:',
    isAgentDebugContextPanel(input.context)
      ? renderDebugContextText(input.context)
      : 'No runtime context was available.',
  ]
  if (input.warnings.length > 0) {
    lines.push('', 'Warnings:', ...input.warnings.map((warning) => `- ${warning}`))
  }
  return lines.join('\n')
}

function renderModelGatewayMessagesText(messages: Array<{ role: string; content?: string | null }>): string {
  const lines = ['Model gateway messages:']
  messages.forEach((message, index) => {
    lines.push('', `--- message ${index + 1}: ${message.role} ---`)
    lines.push(message.content ?? '')
  })
  return lines.join('\n')
}

function isAgentDebugContextPanel(value: unknown): value is AgentDebugContextPanel {
  return isRecord(value) && isRecord(value.route) && Array.isArray(value.projects) && Array.isArray(value.recentResources) && Array.isArray(value.attachments) && Array.isArray(value.memories) && Array.isArray(value.labels)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toJSONValue(value: unknown): JSONValue {
  if (value === undefined) return null
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value as JSONValue
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (!isRecord(value)) return String(value)
  const out: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    out[key] = toJSONValue(item)
  }
  return out
}
