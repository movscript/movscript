import type { JSONValue } from '../../../shared/protocol/types.js'
import type { AgentMessage, AgentRun, CompiledPromptPreview, ToolCall } from '../../../state/shared/types.js'
import type { ToolSource } from '../../../ports/tools/toolExecutionSource.js'
import { runRuntimePromptPipeline, type RuntimePromptContext, type RuntimePromptContextInput } from '../pipeline/runtimePromptPipeline.js'
import { buildRuntimeChatTools } from '../compiler/runtimeToolCompiler.js'
import type { RuntimeHistoricalVisionContext } from './runtimeHistoricalVisionTypes.js'
import { buildModelToolResultContext, type ModelToolResultContext } from '../../tool-result/toolResultContext.js'
import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import type { RuntimeModelChatMessage, RuntimeModelChatTool } from '../../../model/config/modelConfig.js'
import { runtimeModelContentText } from '../../../messages/model/modelMessage.js'
import { compactPromptHistory, normalizeThreadContextSummary, type CompactedPromptHistory } from '../hygiene/promptHygiene.js'
import { promptBundleDebugParts, promptBundleFragments } from '../compiler/promptBundle.js'
import { buildReactiveModelTurnProjection } from './modelTurnProjection.js'
import { buildContextBundle as buildContextBundleRecord, type BuildContextBundleInput } from './contextBundleBuilder.js'
import { buildModelTurnPromptTrace } from './modelTurnTrace.js'
import type { ModelTurnPromptTrace } from './modelTurnTrace.js'
import {
  buildHistoryCompactedTracePayload,
  buildLedgerDedupedTracePayload,
  buildLedgerUpdatedTracePayload,
  buildReferenceTracePayload,
  buildToolResultDroppedTracePayload,
  type BuildReferenceTraceInput,
  type ContextTracePayload,
  type ReferenceContextTrace,
} from './contextTraceBuilder.js'
import {
  createEmptyContextLedger,
  amendContextLedgerRecord,
  deleteContextLedgerRecord,
  recordToolResultInContextLedgerWithAudit,
  type AmendContextRecordInput,
  type CreateEmptyContextLedgerInput,
  type DeleteContextRecordInput,
  type RecordToolResultInContextLedgerAudit,
} from '../../ledger/core/contextLedger.js'
import type { ContextBundle, ContextLedger } from '../../ledger/shared/contextLedgerTypes.js'

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

export interface ComposeRuntimePromptContextInput extends RuntimePromptContextInput {}

export interface ComposeModelTurnInput extends RuntimePromptContextInput {
  historicalVisionContext?: RuntimeHistoricalVisionContext
  historyProjection?: CompactedPromptHistory
  ledger?: ContextLedger
  runId?: string
  threadId?: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  toolLoopHistory?: RuntimeModelChatMessage[]
  contractResolver?: AgentRuntimeContractResolver
}

export type { ModelTurnPromptTrace, SkillContextProjection } from './modelTurnTrace.js'

export type { BuildReferenceTraceInput, ContextTracePayload, ReferenceContextTrace } from './contextTraceBuilder.js'

export interface ComposedModelTurnContext {
  promptContext: RuntimePromptContext
  messages: RuntimeModelChatMessage[]
  tools: RuntimeModelChatTool[]
  contextBundle: ContextBundle
  promptTrace: ModelTurnPromptTrace
}

export interface BuildToolResultContextInput {
  run: AgentRun
  call: ToolCall
  result?: JSONValue
  error?: string
  maxResultSizeChars?: number
}

export class ModelTurnContextComposer {
  createRunLedger(input: CreateEmptyContextLedgerInput): ContextLedger {
    return createEmptyContextLedger(input)
  }

  recordToolResult(input: RecordToolResultContextInput): RecordToolResultInContextLedgerAudit {
    return recordToolResultInContextLedgerWithAudit(input)
  }

  amendContextRecord(input: AmendContextRecordInput): ContextLedger {
    return amendContextLedgerRecord(input)
  }

  deleteContextRecord(input: DeleteContextRecordInput): ContextLedger {
    return deleteContextLedgerRecord(input)
  }

  compactThreadHistory(input: CompactThreadHistoryInput): CompactedPromptHistory {
    return compactPromptHistory(
      input.messages,
      input.maxMessages,
      normalizeThreadContextSummary(input.threadSummary),
    )
  }

  buildHistoryCompactedTrace(history: CompactedPromptHistory): ContextTracePayload | undefined {
    return buildHistoryCompactedTracePayload(history)
  }

  composeRuntimePromptContext(input: ComposeRuntimePromptContextInput): RuntimePromptContext {
    return runRuntimePromptPipeline(input)
  }

  private promptContextInput(input: ComposeModelTurnInput): RuntimePromptContextInput {
    return {
      manifest: input.manifest,
      skills: input.skills,
      ...(input.skillDiscovery ? { skillDiscovery: input.skillDiscovery } : {}),
      context: input.context,
      tools: input.tools,
      runtimeLimits: input.runtimeLimits,
      warnings: input.warnings,
      history: input.history,
      userMessage: input.userMessage,
      ...(input.clientInput ? { clientInput: input.clientInput } : {}),
      ...(input.threadSummary ? { threadSummary: input.threadSummary } : {}),
      ...(input.runtimeState !== undefined ? { runtimeState: input.runtimeState } : {}),
      ...(input.command ? { command: input.command } : {}),
    }
  }

  composeModelTurn(input: ComposeModelTurnInput): ComposedModelTurnContext {
    const promptContext = this.composeRuntimePromptContext(this.promptContextInput(input))
    const projection = buildReactiveModelTurnProjection({
      baseMessages: promptContext.providerProjection.messages,
      toolLoopHistory: input.toolLoopHistory ?? [],
      clientInput: input.clientInput,
      historicalVisionContext: input.historicalVisionContext,
      limitChars: promptContext.promptStats.budget.limitChars,
    })
    const messages = projection.messages
    const runtimeContract = input.contractResolver?.find(input.manifest)
    const tools = buildRuntimeChatTools(input.tools, runtimeContract)
    const contextBundle = this.buildContextBundle({
      promptContext,
      messages,
      tools,
      ledger: input.ledger,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.roundId ? { roundId: input.roundId } : {}),
      ...(input.roundIndex !== undefined ? { roundIndex: input.roundIndex } : {}),
      ...(input.roundLabel ? { roundLabel: input.roundLabel } : {}),
    })
    return {
      promptContext,
      messages,
      tools,
      contextBundle,
      promptTrace: buildModelTurnPromptTrace({
        promptContext,
        messages,
        skills: input.skills,
        tools: input.tools,
        projection,
        ...(input.historyProjection ? { historyProjection: input.historyProjection } : {}),
      }),
    }
  }

  buildContextBundle(input: BuildContextBundleInput): ContextBundle {
    return buildContextBundleRecord(input)
  }

  buildRuntimePromptPreview(input: ComposeRuntimePromptContextInput): CompiledPromptPreview {
    const promptContext = this.composeRuntimePromptContext(input)
    return {
      system: promptContext.promptBundle.sectionPrompt,
      sectionPrompt: promptContext.promptBundle.sectionPrompt,
      providerSystemPrompt: promptContext.providerProjection.systemPrompt,
      providerSystemMessages: promptContext.providerProjection.systemMessages.map((message) => ({ role: message.role, content: runtimeModelContentText(message.content) })),
      messages: promptContext.providerProjection.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role, content: runtimeModelContentText(message.content) })),
      debugParts: promptBundleDebugParts(promptContext.promptBundle),
      promptFragments: promptBundleFragments(promptContext.promptBundle),
      promptStats: promptContext.promptStats,
    }
  }

  buildToolResultContext(input: BuildToolResultContextInput): ModelToolResultContext {
    return buildModelToolResultContext(input)
  }

  buildToolResultDroppedTrace(toolName: string, result: ModelToolResultContext): ContextTracePayload | undefined {
    return buildToolResultDroppedTracePayload(toolName, result)
  }

  buildLedgerUpdatedTrace(ledger: ContextLedger): ContextTracePayload {
    return buildLedgerUpdatedTracePayload(ledger)
  }

  buildLedgerDedupedTrace(toolName: string, audit: RecordToolResultInContextLedgerAudit): ContextTracePayload | undefined {
    return buildLedgerDedupedTracePayload(toolName, audit)
  }

  buildReferenceTrace(input: BuildReferenceTraceInput): ReferenceContextTrace | undefined {
    return buildReferenceTracePayload(input)
  }
}

export const modelTurnContext = new ModelTurnContextComposer()
