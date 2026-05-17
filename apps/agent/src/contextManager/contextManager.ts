import type { JSONValue } from '../types.js'
import { isJSONRecord } from '../jsonValue.js'
import type { AgentDebugContextPanel, AgentMessage, AgentRun, AgentRunPolicy, CompiledPromptPreview, ResolvedAgentSkill, ResolvedToolCatalog, ToolCall } from '../state/types.js'
import type { AgentManifest } from '../catalog/agentManifest.js'
import type { AgentMemory } from '../memory/types.js'
import type { ToolSource } from '../orchestration/toolExecutor.js'
import { buildContext, buildOpenAIChatTools, type BuiltContext } from './modelContextBuilder.js'
import type { SkillDiscoverySummary } from './modelContextBuilder.js'
import { buildModelToolResultContext, type ModelToolResultContext } from './toolResultContext.js'
import type { AgentRuntimeContractResolver } from '../contracts/runtimeContract.js'
import type { AgentCommandRuntime } from '../context/commandRouter.js'
import type { RuntimeModelChatMessage, RuntimeModelChatTool } from '../model/modelConfig.js'
import { compactPromptHistory, filterPromptMemories, normalizeThreadContextSummary, type CompactedPromptHistory } from '../context/promptHygiene.js'
import {
  createEmptyContextLedger,
  recordToolResultInContextLedgerWithAudit,
  type CreateEmptyContextLedgerInput,
  type RecordToolResultInContextLedgerAudit,
} from './contextLedger.js'
import type { ContextLedger } from './types.js'

export interface RecordToolResultContextInput {
  ledger?: unknown
  runId: string
  threadId: string
  catalogSnapshotId: string
  catalogSnapshotVersion?: string
  activeSkillIds?: string[]
  visibleToolNames?: string[]
  call: ToolCall
  result?: JSONValue
  source: ToolSource
  usedInPrompt?: boolean
  now?: string
}

export interface CompactThreadHistoryInput {
  messages: AgentMessage[]
  threadSummary?: unknown
  maxMessages?: number
}

export interface ComposeModelContextInput {
  manifest: AgentManifest
  skills: ResolvedAgentSkill[]
  skillDiscovery?: SkillDiscoverySummary
  context: AgentDebugContextPanel
  tools: ResolvedToolCatalog
  policy: AgentRunPolicy
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  threadSummary?: string
  command?: AgentCommandRuntime
  contractResolver?: AgentRuntimeContractResolver
}

export interface ComposeModelTurnInput extends ComposeModelContextInput {
  toolLoopHistory?: RuntimeModelChatMessage[]
}

export interface ModelTurnPromptTrace {
  title: string
  summary: string
  data: Record<string, unknown>
}

export interface ContextTracePayload {
  title: string
  summary: string
  data: Record<string, JSONValue>
}

export interface ComposedModelTurnContext {
  builtContext: BuiltContext
  messages: RuntimeModelChatMessage[]
  tools: RuntimeModelChatTool[]
  promptTrace: ModelTurnPromptTrace
}

export interface BuildToolResultContextInput {
  run: AgentRun
  call: ToolCall
  result?: JSONValue
  error?: string
}

export interface BuildKnowledgeTraceInput {
  call: ToolCall
  result?: JSONValue
  ledger: ContextLedger
}

export interface KnowledgeContextTrace {
  title: string
  summary: string
  data: Record<string, JSONValue>
}

export class ContextManager {
  createRunLedger(input: CreateEmptyContextLedgerInput): ContextLedger {
    return createEmptyContextLedger(input)
  }

  recordToolResult(input: RecordToolResultContextInput): RecordToolResultInContextLedgerAudit {
    return recordToolResultInContextLedgerWithAudit(input)
  }

  compactThreadHistory(input: CompactThreadHistoryInput): CompactedPromptHistory {
    return compactPromptHistory(
      input.messages,
      input.maxMessages,
      normalizeThreadContextSummary(input.threadSummary),
    )
  }

  buildHistoryCompactedTrace(history: CompactedPromptHistory): ContextTracePayload | undefined {
    if (history.compactedCount <= 0) return undefined
    return {
      title: 'Thread history compacted',
      summary: `${history.compactedCount} older message(s) summarized before prompt composition.`,
      data: {
        eventType: 'context.history_compacted',
        compactedCount: history.compactedCount,
        retainedCount: history.messages.length,
      },
    }
  }

  composeModelContext(input: ComposeModelContextInput): BuiltContext {
    return buildContext({
      ...input,
      memories: filterPromptMemories(input.memories),
    })
  }

  composeModelTurn(input: ComposeModelTurnInput): ComposedModelTurnContext {
    const builtContext = this.composeModelContext(input)
    const baseMessages = builtContext.messages
    const messages = [
      ...baseMessages.slice(0, -1),
      ...(input.toolLoopHistory ?? []),
      baseMessages.at(-1)!,
    ]
    const runtimeContract = input.contractResolver?.find(input.manifest)
    const tools = buildOpenAIChatTools(input.tools, runtimeContract)
    return {
      builtContext,
      messages,
      tools,
      promptTrace: {
        title: 'Prompt composed',
        summary: `${builtContext.systemPrompt.length} system prompt chars, ${input.skills.length} active skill(s).`,
        data: {
          eventType: 'prompt.composed',
          contextEventType: 'context.prompt_composed',
          charCount: builtContext.systemPrompt.length,
          messageCount: builtContext.messages.length,
          systemMessageCount: builtContext.systemMessages.length,
          promptStats: builtContext.promptStats,
          skillIds: input.skills.map((skill) => skill.id),
          availableToolNames: input.tools.available.map((tool) => tool.name),
          blockedToolCount: input.tools.blocked.length,
          debugPartIds: builtContext.debugParts.map((part) => part.id),
          ...(builtContext.degraded ? { degraded: builtContext.degraded } : {}),
          warnings: builtContext.warnings,
        },
      },
    }
  }

  buildPromptPreview(input: ComposeModelContextInput): CompiledPromptPreview {
    const builtContext = this.composeModelContext(input)
    return {
      system: builtContext.systemPrompt,
      messages: builtContext.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role, content: message.content ?? '' })),
      debugParts: builtContext.debugParts,
      promptStats: builtContext.promptStats,
    }
  }

  buildToolResultContext(input: BuildToolResultContextInput): ModelToolResultContext {
    return buildModelToolResultContext(input)
  }

  buildToolResultDroppedTrace(toolName: string, result: ModelToolResultContext): ContextTracePayload | undefined {
    if (!result.dropped) return undefined
    return {
      title: 'Tool result body summarized',
      summary: `${toolName} result reduced from ${result.originalChars} to ${result.renderedChars} chars before the next model turn.`,
      data: {
        eventType: 'context.item_dropped',
        reason: result.reason ?? null,
        originalChars: result.originalChars,
        renderedChars: result.renderedChars,
      },
    }
  }

  buildLedgerUpdatedTrace(ledger: ContextLedger): ContextTracePayload {
    return {
      title: 'Context ledger updated',
      summary: `${ledger.retrieved.length} retrieved ref(s), ${ledger.artifactRefs.length} artifact ref(s).`,
      data: {
        eventType: 'context.ledger_updated',
        retrievedCount: ledger.retrieved.length,
        artifactRefCount: ledger.artifactRefs.length,
        refs: ledger.retrieved.map((record) => ({
          type: record.ref.type,
          id: record.ref.id,
          title: record.ref.title ?? null,
          source: record.source,
          evidence: record.evidence,
        })),
      },
    }
  }

  buildLedgerDedupedTrace(toolName: string, audit: RecordToolResultInContextLedgerAudit): ContextTracePayload | undefined {
    if (audit.dedupedRecords.length === 0) return undefined
    return {
      title: 'Context item deduped',
      summary: `${audit.dedupedRecords.length} duplicate context item(s) merged for ${toolName}.`,
      data: {
        eventType: 'context.item_deduped',
        incomingCount: audit.incomingCount,
        dedupedCount: audit.dedupedRecords.length,
        records: audit.dedupedRecords.map((record) => ({
          key: record.key,
          type: record.ref.type,
          id: record.ref.id,
          title: record.ref.title ?? record.incomingTitle,
          existingTitle: record.existingTitle,
          existingRetrievedAt: record.existingRetrievedAt,
        })),
      },
    }
  }

  buildKnowledgeTrace(input: BuildKnowledgeTraceInput): KnowledgeContextTrace | undefined {
    if (input.call.name === 'movscript_search_knowledge') {
      const payload = isJSONRecord(input.result) ? input.result : undefined
      const results = Array.isArray(payload?.results) ? payload.results.filter(isJSONRecord) : []
      return {
        title: 'Knowledge searched',
        summary: `${results.length} knowledge result(s) for ${stringField(input.call.args?.query) ?? 'empty query'}.`,
        data: {
          eventType: 'context.knowledge_searched',
          toolName: input.call.name,
          query: stringField(input.call.args?.query) ?? null,
          domain: stringField(input.call.args?.domain) ?? null,
          tags: Array.isArray(input.call.args?.tags) ? input.call.args.tags.filter((item): item is string => typeof item === 'string') : [],
          limit: numberField(input.call.args?.limit) ?? null,
          resultCount: results.length,
          results: results.map((item) => ({
            id: stringField(item.id) ?? '',
            title: stringField(item.title) ?? stringField(item.id) ?? '',
            collectionId: stringField(item.collectionId) ?? '',
            domain: stringField(item.domain) ?? '',
            score: numberField(item.score) ?? null,
            contentHash: stringField(item.contentHash) ?? null,
            charCount: numberField(item.charCount) ?? null,
          })),
          refs: knowledgeRefsFromLedger(input.ledger),
        },
      }
    }
    if (input.call.name === 'movscript_get_knowledge') {
      const payload = isJSONRecord(input.result) ? input.result : undefined
      const id = stringField(payload?.id) ?? stringField(input.call.args?.id) ?? 'unknown'
      const content = typeof payload?.content === 'string' ? payload.content : ''
      return {
        title: 'Knowledge loaded',
        summary: `${id} loaded (${content.length} chars${payload?.truncated === true ? ', truncated' : ''}).`,
        data: {
          eventType: 'context.knowledge_loaded',
          toolName: input.call.name,
          id,
          title: stringField(payload?.title) ?? id,
          collectionId: stringField(payload?.collectionId) ?? null,
          domain: stringField(payload?.domain) ?? null,
          requestedMaxChars: numberField(input.call.args?.maxChars) ?? null,
          contentChars: content.length,
          sourceCharCount: numberField(payload?.charCount) ?? null,
          contentHash: stringField(payload?.contentHash) ?? null,
          truncated: payload?.truncated === true,
          refs: knowledgeRefsFromLedger(input.ledger).filter((ref) => ref.id === id),
        },
      }
    }
    return undefined
  }
}

export const contextManager = new ContextManager()

interface KnowledgeTraceRef extends Record<string, JSONValue> {
  type: 'knowledge'
  id: string
  title: string
  source: string
  evidence: string
  contentHash: string | null
  charCount: number | null
  usedInPrompt: boolean
}

function knowledgeRefsFromLedger(ledger: ContextLedger): KnowledgeTraceRef[] {
  return ledger.retrieved
    .filter((record) => record.ref.type === 'knowledge')
    .map((record) => ({
      type: 'knowledge',
      id: record.ref.id,
      title: record.ref.title ?? record.title,
      source: record.source,
      evidence: record.evidence,
      contentHash: record.contentHash ?? record.ref.hash ?? null,
      charCount: record.charCount ?? null,
      usedInPrompt: record.usedInPrompt,
    }))
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
