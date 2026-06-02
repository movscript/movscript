import { createHash } from 'node:crypto'
import type { JSONValue } from '../../../shared/protocol/types.js'
import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import type { AgentDebugContextPanel, AgentMessage, AgentRun, AgentRuntimeLimits, CompiledPromptPreview, ResolvedAgentSkill, ResolvedToolCatalog, ToolCall } from '../../../state/shared/types.js'
import type { AgentManifest } from '../../../catalog/manifest/agentManifest.js'
import type { AgentMemory } from '../../../memory/shared/types.js'
import type { ToolSource } from '../../../ports/tools/toolExecutionSource.js'
import { buildContext, buildRuntimeChatTools, type BuiltContext } from '../builder/modelContextBuilder.js'
import type { RuntimeHistoricalVisionContext, SkillDiscoverySummary } from '../builder/modelContextBuilder.js'
import { buildModelToolResultContext, type ModelToolResultContext } from '../../tool-result/toolResultContext.js'
import type { AgentRuntimeContractResolver } from '../../../contracts/runtime/runtimeContract.js'
import type { AgentCommandRuntime } from '../../command/commandRouter.js'
import type { NormalizedClientInput } from '../../input/client/normalizeClientInput.js'
import type { RuntimeModelChatMessage, RuntimeModelChatTool, RuntimeModelContentPart } from '../../../model/config/modelConfig.js'
import { runtimeModelContentText, runtimeModelTextContent } from '../../../messages/model/modelMessage.js'
import { compactPromptHistory, filterPromptMemories, normalizeThreadContextSummary, type CompactedPromptHistory } from '../hygiene/promptHygiene.js'
import {
  createEmptyContextLedger,
  amendContextLedgerRecord,
  deleteContextLedgerRecord,
  recordToolResultInContextLedgerWithAudit,
  summarizeContextMutations,
  type AmendContextRecordInput,
  type CreateEmptyContextLedgerInput,
  type DeleteContextRecordInput,
  type RecordToolResultInContextLedgerAudit,
} from '../../ledger/core/contextLedger.js'
import type { ContextBundle, ContextLedger, RetrievedContextRecord } from '../../ledger/shared/contextLedgerTypes.js'
import { refKey } from '../../ledger/retrieval/retrievedContextStore.js'

const INLINE_IMAGE_PROMPT_ESTIMATE_CHARS = 2048

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
  runtimeLimits: AgentRuntimeLimits
  memories: AgentMemory[]
  warnings: string[]
  history: AgentMessage[]
  userMessage: string
  clientInput?: NormalizedClientInput
  historicalVisionContext?: RuntimeHistoricalVisionContext
  threadSummary?: string
  historyProjection?: CompactedPromptHistory
  runtimeState?: unknown
  command?: AgentCommandRuntime
  contractResolver?: AgentRuntimeContractResolver
  ledger?: ContextLedger
  runId?: string
  threadId?: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
}

export interface ComposeModelTurnInput extends ComposeModelContextInput {
  toolLoopHistory?: RuntimeModelChatMessage[]
}

export interface ModelTurnPromptTrace {
  title: string
  summary: string
  data: Record<string, unknown>
}

export interface SkillContextProjection {
  skillId: string
  name: string
  activationReason: ResolvedAgentSkill['activationReason']
  contextBehavior?: string
  includedInPrompt: boolean
  promptPartId: string
  promptLayer?: string
  promptKind?: string
  renderedChars?: number
  omittedReason?: string
  omittedStage?: string
  originalChars?: number
  priority?: number
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

export interface BuildReferenceTraceInput {
  call: ToolCall
  result?: JSONValue
  ledger: ContextLedger
}

export interface ReferenceContextTrace {
  title: string
  summary: string
  data: Record<string, JSONValue>
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
    if (history.compactedCount <= 0 && history.filteredCount <= 0) return undefined
    return {
      title: 'Thread history compacted',
      summary: `${history.compactedCount} older message(s) summarized and ${history.filteredCount} runtime failure message(s) filtered before prompt composition.`,
      data: {
        eventType: 'context.history_compacted',
        compactedCount: history.compactedCount,
        retainedCount: history.messages.length,
        inputCount: history.inputCount,
        filteredCount: history.filteredCount,
        summaryChars: history.summaryChars,
        projectionDecisions: history.projectionDecisions as unknown as JSONValue,
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
    const projection = buildReactiveModelTurnProjection({
      baseMessages: builtContext.messages,
      toolLoopHistory: input.toolLoopHistory ?? [],
      clientInput: input.clientInput,
      historicalVisionContext: input.historicalVisionContext,
      limitChars: builtContext.promptStats.budget.limitChars,
    })
    const messages = projection.messages
    const runtimeContract = input.contractResolver?.find(input.manifest)
    const tools = buildRuntimeChatTools(input.tools, runtimeContract)
    const contextBundle = this.buildContextBundle({
      builtContext,
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
      builtContext,
      messages,
      tools,
      contextBundle,
      promptTrace: {
        title: 'Prompt composed',
        summary: `${builtContext.systemPrompt.length} system prompt chars, ${input.skills.length} active skill(s).`,
        data: {
          eventType: 'prompt.composed',
          contextEventType: 'context.prompt_composed',
          charCount: builtContext.systemPrompt.length,
          messageCount: messages.length,
          systemMessageCount: builtContext.systemMessages.length,
          promptStats: builtContext.promptStats,
          ...(input.historyProjection ? { historyProjection: promptHistoryProjectionTrace(input.historyProjection) } : {}),
          ...(projection.toolLoopProjection ? { toolLoopProjection: projection.toolLoopProjection } : {}),
          ...(projection.historicalVisualProjection ? { historicalVisualProjection: projection.historicalVisualProjection } : {}),
          ...(projection.attachmentProjection ? { attachmentProjection: projection.attachmentProjection } : {}),
          skillIds: input.skills.map((skill) => skill.id),
          skillContextProjection: buildSkillContextProjection(input.skills, builtContext),
          availableToolNames: input.tools.available.map((tool) => tool.name),
          blockedToolCount: input.tools.blocked.length,
          debugPartIds: builtContext.debugParts.map((part) => part.id),
          ...(builtContext.degraded ? { degraded: builtContext.degraded } : {}),
          warnings: builtContext.warnings,
        },
      },
    }
  }

  buildContextBundle(input: {
    builtContext: BuiltContext
    messages: RuntimeModelChatMessage[]
    tools: RuntimeModelChatTool[]
    ledger?: ContextLedger
    runId?: string
    threadId?: string
    roundId?: string
    roundIndex?: number
    roundLabel?: string
    createdAt?: string
  }): ContextBundle {
    const createdAt = input.createdAt ?? new Date().toISOString()
    const promptHash = stableHash({
      messages: input.messages.map((message) => ({
        role: message.role,
        content: runtimeModelContentText(message.content),
        tool_call_id: 'tool_call_id' in message ? message.tool_call_id : undefined,
      })),
      tools: input.tools.map((tool) => tool.function.name),
    })
    const activeRecords = (input.ledger?.retrieved ?? []).filter((record) => (record.status ?? 'active') === 'active')
    const amendedRecords = (input.ledger?.retrieved ?? []).filter((record) => record.status === 'amended')
    const deletedRecords = (input.ledger?.retrieved ?? []).filter((record) => record.status === 'deleted')
    return {
      schema: 'movscript.context-bundle.v1',
      id: `ctxb_${hashText([
        input.runId ?? input.ledger?.runId ?? '',
        input.threadId ?? input.ledger?.threadId ?? '',
        input.roundId ?? '',
        String(input.roundIndex ?? ''),
        promptHash,
      ].join(':')).slice(0, 16)}`,
      ...(input.runId ?? input.ledger?.runId ? { runId: input.runId ?? input.ledger?.runId } : {}),
      ...(input.threadId ?? input.ledger?.threadId ? { threadId: input.threadId ?? input.ledger?.threadId } : {}),
      ...(input.roundId ? { roundId: input.roundId } : {}),
      ...(input.roundIndex !== undefined ? { roundIndex: input.roundIndex } : {}),
      ...(input.roundLabel ? { roundLabel: input.roundLabel } : {}),
      createdAt,
      promptHash,
      messageCount: input.messages.length,
      toolCount: input.tools.length,
      systemMessageCount: input.builtContext.systemMessages.length,
      promptChars: input.builtContext.promptStats.totalChars,
      budget: {
        usedChars: input.builtContext.promptStats.budget.usedChars,
        limitChars: input.builtContext.promptStats.budget.limitChars,
        remainingChars: input.builtContext.promptStats.budget.remainingChars,
        pressure: contextPressure(input.builtContext.promptStats.budget.status),
      },
      promptParts: input.builtContext.promptStats.parts.map((part) => ({
        id: part.id,
        kind: part.kind,
        title: part.title,
        charCount: part.chars,
        hash: stableHash(input.builtContext.debugParts.find((debugPart) => debugPart.id === part.id)?.content ?? ''),
        layer: part.layer,
      })),
      promptBudget: {
        initialSystemChars: input.builtContext.budgetLedger.initialSystemChars,
        finalSystemChars: input.builtContext.budgetLedger.finalSystemChars,
        decisionCount: input.builtContext.budgetLedger.decisionCount,
        decisions: input.builtContext.budgetLedger.decisions,
      },
      contextRefs: (input.ledger?.retrieved ?? []).map(contextBundleRef),
      activeContextKeys: activeRecords.map((record) => refKey(record.ref)),
      amendedContextKeys: amendedRecords.map((record) => refKey(record.ref)),
      deletedContextKeys: deletedRecords.map((record) => refKey(record.ref)),
    }
  }

  buildPromptPreview(input: ComposeModelContextInput): CompiledPromptPreview {
    const builtContext = this.composeModelContext(input)
    return {
      system: builtContext.systemPrompt,
      messages: builtContext.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({ role: message.role, content: runtimeModelContentText(message.content) })),
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
        ...(result.resultRef ? {
          resultRef: result.resultRef as unknown as JSONValue,
          resultHash: result.resultRef.hash ?? null,
          refKey: result.resultRef.key,
        } : {}),
      },
    }
  }

  buildLedgerUpdatedTrace(ledger: ContextLedger): ContextTracePayload {
    const records = ledger.retrieved.map((record) => ({
      key: refKey(record.ref),
      type: record.ref.type,
      id: record.ref.id,
      title: record.ref.title ?? record.title,
      source: record.source,
      evidence: record.evidence,
      status: record.status ?? 'active',
      version: record.version ?? record.ref.version ?? null,
      hash: record.contentHash ?? record.ref.hash ?? null,
    }))
    const activeCount = records.filter((record) => record.status === 'active').length
    const amendedCount = records.filter((record) => record.status === 'amended').length
    const deletedCount = records.filter((record) => record.status === 'deleted').length
    const refLimit = 50
    return {
      title: 'Context ledger updated',
      summary: `${activeCount} active ref(s), ${amendedCount} amended, ${deletedCount} deleted.`,
      data: {
        eventType: 'context.ledger_updated',
        retrievedCount: ledger.retrieved.length,
        activeCount,
        amendedCount,
        deletedCount,
        artifactRefCount: ledger.artifactRefs.length,
        mutationSummary: summarizeContextMutations(ledger) as unknown as JSONValue,
        refs: records.slice(-refLimit) as unknown as JSONValue,
        refsTruncated: records.length > refLimit,
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

  buildReferenceTrace(input: BuildReferenceTraceInput): ReferenceContextTrace | undefined {
    if (input.call.name === 'reference_search') {
      const payload = isJSONRecord(input.result) ? input.result : undefined
      const results = Array.isArray(payload?.results) ? payload.results.filter(isJSONRecord) : []
      return {
        title: 'Reference searched',
        summary: `${results.length} reference result(s) for ${stringField(input.call.args?.query) ?? 'empty query'}.`,
        data: {
          eventType: 'context.reference_searched',
          toolName: input.call.name,
          query: stringField(input.call.args?.query) ?? null,
          domain: stringField(input.call.args?.domain) ?? null,
          tags: Array.isArray(input.call.args?.tags) ? input.call.args.tags.filter((item): item is string => typeof item === 'string') : [],
          limit: numberField(input.call.args?.limit) ?? null,
          resultCount: results.length,
          results: results.map((item) => {
            const metadata = isJSONRecord(item.metadata) ? item.metadata : {}
            return {
              id: stringField(item.id) ?? '',
              title: stringField(item.title) ?? stringField(item.id) ?? '',
              kind: stringField(item.kind) ?? null,
              source: stringField(item.source) ?? null,
              retrievalMethod: stringField(item.retrievalMethod) ?? null,
              localReferenceSetId: stringField(metadata.localReferenceSetId) ?? null,
              domain: stringField(metadata.domain) ?? null,
              score: numberField(item.score) ?? null,
              contentHash: stringField(metadata.contentHash) ?? null,
              charCount: numberField(metadata.charCount) ?? null,
            }
          }),
          refs: referenceRefsFromLedger(input.ledger),
        },
      }
    }
    if (input.call.name === 'reference_get') {
      const payload = isJSONRecord(input.result) ? input.result : undefined
      const id = stringField(payload?.id) ?? stringField(input.call.args?.id) ?? 'unknown'
      const content = typeof payload?.content === 'string' ? payload.content : ''
      return {
        title: 'Reference loaded',
        summary: `${id} loaded (${content.length} chars${payload?.truncated === true ? ', truncated' : ''}).`,
        data: {
          eventType: 'context.reference_loaded',
          toolName: input.call.name,
          id,
          title: stringField(payload?.title) ?? id,
          localReferenceSetId: stringField(payload?.localReferenceSetId) ?? null,
          domain: stringField(payload?.domain) ?? null,
          requestedMaxChars: numberField(input.call.args?.maxChars) ?? null,
          contentChars: content.length,
          sourceCharCount: numberField(payload?.charCount) ?? null,
          contentHash: stringField(payload?.contentHash) ?? null,
          truncated: payload?.truncated === true,
          refs: referenceRefsFromLedger(input.ledger).filter((ref) => ref.id === id),
        },
      }
    }
    return undefined
  }
}

export const modelTurnContext = new ModelTurnContextComposer()

function buildSkillContextProjection(skills: ResolvedAgentSkill[], builtContext: BuiltContext): SkillContextProjection[] {
  const partsById = new Map(builtContext.promptStats.parts.map((part) => [part.id, part]))
  const latestDecisionByPartId = new Map<string, BuiltContext['budgetLedger']['decisions'][number]>()
  for (const decision of builtContext.budgetLedger.decisions) {
    if (decision.partId.startsWith('skill.')) latestDecisionByPartId.set(decision.partId, decision)
  }
  return skills.map((skill) => {
    const promptPartId = `skill.${skill.id}`
    const part = partsById.get(promptPartId)
    const decision = latestDecisionByPartId.get(promptPartId)
    return {
      skillId: skill.id,
      name: skill.name,
      activationReason: skill.activationReason,
      ...(skill.runtime?.contextBehavior ? { contextBehavior: skill.runtime.contextBehavior } : {}),
      includedInPrompt: !!part,
      promptPartId,
      ...(part?.layer ? { promptLayer: part.layer } : {}),
      ...(part?.kind ? { promptKind: part.kind } : {}),
      ...(part?.chars !== undefined ? { renderedChars: part.chars } : {}),
      ...(decision?.reason ? { omittedReason: decision.reason } : {}),
      ...(decision?.stage ? { omittedStage: decision.stage } : {}),
      ...(decision?.originalChars !== undefined ? { originalChars: decision.originalChars } : {}),
      ...(decision?.priority !== undefined ? { priority: decision.priority } : {}),
    }
  })
}

function promptHistoryProjectionTrace(history: CompactedPromptHistory): Record<string, JSONValue> {
  return {
    inputCount: history.inputCount,
    retainedCount: history.retainedCount,
    compactedCount: history.compactedCount,
    filteredCount: history.filteredCount,
    summaryChars: history.summaryChars,
    decisions: history.projectionDecisions as unknown as JSONValue,
  }
}

function buildReactiveModelTurnProjection(input: {
  baseMessages: RuntimeModelChatMessage[]
  toolLoopHistory: RuntimeModelChatMessage[]
  clientInput?: NormalizedClientInput
  historicalVisionContext?: RuntimeHistoricalVisionContext
  limitChars: number
}): {
  messages: RuntimeModelChatMessage[]
  toolLoopProjection?: Record<string, JSONValue>
  historicalVisualProjection?: Record<string, JSONValue>
  attachmentProjection?: Record<string, JSONValue>
} {
  const lastMessage = input.baseMessages.at(-1)
  const beforeUser = input.baseMessages.slice(0, -1)
  const historicalVisualMessages = extractHistoricalVisualMessages(input.historicalVisionContext)
  let toolLoopMessages = input.toolLoopHistory
  let visualMessages = historicalVisualMessages
  const assembleMessages = () => [
    ...beforeUser,
    ...toolLoopMessages,
    ...visualMessages,
    ...(lastMessage ? [lastMessage] : []),
  ]
  let messages = assembleMessages()
  const decisions: Array<Record<string, JSONValue>> = []
  const initialChars = estimateRuntimeModelMessagesWithImages(messages)
  const toolLoopChars = estimateRuntimeModelMessagesWithImages(input.toolLoopHistory)
  if (initialChars > input.limitChars && input.toolLoopHistory.length > 0) {
    const summary = runtimeModelTextContent([
      'Tool-loop tail compacted for prompt budget.',
      `- ${input.toolLoopHistory.length} current tool-loop message(s) were summarized instead of included verbatim.`,
      `- Original tool-loop estimate: ${toolLoopChars} chars.`,
      '- The durable transcript and tool result refs remain available outside this model-context projection.',
    ].join('\n'))
    toolLoopMessages = [{ role: 'system', content: summary }]
    messages = assembleMessages()
    decisions.push({
      action: 'compact',
      stage: 'tool_loop_tail',
      reason: 'Current tool-loop tail was summarized because the full model request exceeded the context window after routine history compaction.',
      messageCount: input.toolLoopHistory.length,
      originalChars: toolLoopChars,
      requestCharsBefore: initialChars,
      requestCharsAfter: estimateRuntimeModelMessagesWithImages(messages),
      limitChars: input.limitChars,
    })
  }

  let historicalVisualProjection = input.historicalVisionContext?.projection
  const requestCharsBeforeHistoricalVisualTrim = estimateRuntimeModelMessagesWithImages(messages)
  if (requestCharsBeforeHistoricalVisualTrim > input.limitChars && hasInlineImagePartsInMessages(visualMessages)) {
    const originalInlineImageChars = imagePartCharsInMessages(visualMessages)
    visualMessages = visualMessages.map((message) => ({
      ...message,
      content: message.content.filter((part) => part.type !== 'image'),
    }))
    messages = assembleMessages()
    const droppedInlineImageCount = historicalVisualMessagesInlineImageCount(input.historicalVisionContext)
    historicalVisualProjection = {
      ...(historicalVisualProjection ?? {}),
      includedInlineImageCount: 0,
      metadataOnlyCount: (projectionNumber(historicalVisualProjection, 'metadataOnlyCount') ?? 0) + droppedInlineImageCount,
      droppedInlineImageCount,
      decisions: [
        ...((historicalVisualProjection?.decisions as unknown[] | undefined) ?? []),
        {
          action: 'drop',
          stage: 'historical_visual_context',
          reason: 'Historical inline image payloads were removed before current user attachments because the model request exceeded the context window.',
          inlineImageCount: droppedInlineImageCount,
          originalInlineImageChars,
          requestCharsBefore: requestCharsBeforeHistoricalVisualTrim,
          requestCharsAfter: estimateRuntimeModelMessagesWithImages(messages),
          limitChars: input.limitChars,
        },
      ] as unknown as JSONValue,
    }
  }

  let attachmentProjection = input.clientInput && input.clientInput.attachments.length > 0
    ? attachmentProjectionTrace(input.clientInput)
    : undefined
  const requestCharsBeforeAttachmentTrim = estimateRuntimeModelMessagesWithImages(messages)
  if (requestCharsBeforeAttachmentTrim > input.limitChars && hasInlineImageParts(messages.at(-1))) {
    const originalInlineImageChars = imagePartChars(messages.at(-1))
    messages = replaceLastMessage(messages, (message) => ({
      ...message,
      content: message.content.filter((part) => part.type !== 'image'),
    }))
    const requestCharsAfter = estimateRuntimeModelMessagesWithImages(messages)
    const attachmentDecisions = [
      ...((attachmentProjection?.decisions as unknown[] | undefined) ?? []),
      {
        action: 'drop',
        stage: 'user_attachments',
        reason: 'Inline image payloads were removed after history/tool-loop compaction was not enough to fit the model request. Text attachment metadata remains in the user message.',
        inlineImageCount: input.clientInput?.attachments.filter((attachment) => isImageAttachment(attachment.type, attachment.mimeType) && !!attachment.dataUrl).length ?? 0,
        originalInlineImageChars,
        requestCharsBefore: requestCharsBeforeAttachmentTrim,
        requestCharsAfter,
        limitChars: input.limitChars,
      },
    ]
    attachmentProjection = {
      ...(attachmentProjection ?? {}),
      inlineImageCount: 0,
      metadataOnlyCount: input.clientInput?.attachments.length ?? 0,
      droppedInlineImageCount: input.clientInput?.attachments.filter((attachment) => isImageAttachment(attachment.type, attachment.mimeType) && !!attachment.dataUrl).length ?? 0,
      decisions: attachmentDecisions as unknown as JSONValue,
    }
  }

  return {
    messages,
    ...(input.toolLoopHistory.length > 0 ? { toolLoopProjection: toolLoopProjectionTrace(input.toolLoopHistory, decisions) } : {}),
    ...(historicalVisualProjection ? { historicalVisualProjection } : {}),
    ...(attachmentProjection ? { attachmentProjection } : {}),
  }
}

function extractHistoricalVisualMessages(context: RuntimeHistoricalVisionContext | undefined): RuntimeModelChatMessage[] {
  if (!context || context.references.length === 0) return []
  const lines = [
    '[Historical visual references from earlier user messages]',
    'These image references came from prior user messages in this thread and are included to preserve visual continuity for the current turn.',
    ...context.references.map((reference, index) => {
      const identity = reference.resourceId !== undefined ? `resource_id=${reference.resourceId}` : reference.attachmentId ? `attachment_id=${reference.attachmentId}` : 'local_preview'
      const payload = reference.dataUrl ? ', image_payload=data_url' : ', image_payload=metadata_only'
      return `${index + 1}. ${reference.name ?? 'historical image'} (${reference.mimeType ?? 'image/unknown'}, ${reference.size ?? 0} bytes, message_id=${reference.messageId}, ${identity}${payload})`
    }),
  ]
  const parts: RuntimeModelContentPart[] = runtimeModelTextContent(lines.join('\n'))
  for (const reference of context.references) {
    if (!reference.dataUrl) continue
    parts.push({
      type: 'image',
      source: { type: 'data_url', dataUrl: reference.dataUrl },
      detail: 'auto',
    })
  }
  return [{ role: 'user', content: parts }]
}

function toolLoopProjectionTrace(messages: RuntimeModelChatMessage[], decisions: Array<Record<string, JSONValue>> = []): Record<string, JSONValue> {
  const chars = estimateRuntimeModelMessagesWithImages(messages)
  return {
    messageCount: messages.length,
    includedCount: decisions.some((decision) => decision.action === 'compact') ? 0 : messages.length,
    compactedCount: decisions.some((decision) => decision.action === 'compact') ? messages.length : 0,
    chars,
    decisions: (decisions.length > 0 ? decisions : [{
      action: 'retain',
      stage: 'tool_loop_tail',
      reason: 'Current tool-loop messages are retained verbatim for model continuity.',
      messageCount: messages.length,
      chars,
    }]) as unknown as JSONValue,
  }
}

function attachmentProjectionTrace(input: NormalizedClientInput): Record<string, JSONValue> {
  const inlineImageCount = input.attachments.filter((attachment) => isImageAttachment(attachment.type, attachment.mimeType) && !!attachment.dataUrl).length
  const metadataOnlyCount = input.attachments.length - inlineImageCount
  const totalBytes = input.attachments.reduce((total, attachment) => total + (attachment.size ?? 0), 0)
  const dataUrlChars = input.attachments.reduce((total, attachment) => total + (attachment.dataUrl?.length ?? 0), 0)
  return {
    attachmentCount: input.attachments.length,
    inlineImageCount,
    metadataOnlyCount,
    totalBytes,
    dataUrlChars,
    decisions: [{
      action: 'retain',
      stage: 'user_attachments',
      reason: 'Image data_url attachments are sent as image parts; video/file attachments remain metadata-only unless a tool loads derived content.',
      attachmentCount: input.attachments.length,
      inlineImageCount,
      metadataOnlyCount,
      dataUrlChars,
    }],
  }
}

function estimateRuntimeModelMessagesWithImages(messages: RuntimeModelChatMessage[]): number {
  return messages.reduce((total, message) => total + message.role.length + message.content.reduce((partTotal, part) => {
    if (part.type === 'text') return partTotal + part.text.length
    return partTotal + INLINE_IMAGE_PROMPT_ESTIMATE_CHARS
  }, 0) + 2, 0)
}

function hasInlineImageParts(message: RuntimeModelChatMessage | undefined): boolean {
  return message?.content.some((part) => part.type === 'image' && part.source.type === 'data_url') === true
}

function hasInlineImagePartsInMessages(messages: RuntimeModelChatMessage[]): boolean {
  return messages.some(hasInlineImageParts)
}

function imagePartChars(message: RuntimeModelChatMessage | undefined): number {
  return message?.content.reduce((total, part) => part.type === 'image' && part.source.type === 'data_url' ? total + part.source.dataUrl.length : total, 0) ?? 0
}

function imagePartCharsInMessages(messages: RuntimeModelChatMessage[]): number {
  return messages.reduce((total, message) => total + imagePartChars(message), 0)
}

function historicalVisualMessagesInlineImageCount(context: RuntimeHistoricalVisionContext | undefined): number {
  return context?.references.filter((reference) => !!reference.dataUrl).length ?? 0
}

function projectionNumber(projection: Record<string, JSONValue> | undefined, key: string): number | undefined {
  const value = projection?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function replaceLastMessage(messages: RuntimeModelChatMessage[], replace: (message: RuntimeModelChatMessage) => RuntimeModelChatMessage): RuntimeModelChatMessage[] {
  const last = messages.at(-1)
  if (!last) return messages
  return [...messages.slice(0, -1), replace(last)]
}

function isImageAttachment(type?: string, mimeType?: string): boolean {
  return type === 'image' || mimeType?.toLowerCase().startsWith('image/') === true
}

interface ReferenceTraceRef extends Record<string, JSONValue> {
  type: 'reference'
  id: string
  title: string
  source: string
  evidence: string
  contentHash: string | null
  charCount: number | null
  usedInPrompt: boolean
}

function referenceRefsFromLedger(ledger: ContextLedger): ReferenceTraceRef[] {
  return ledger.retrieved
    .filter((record) => record.ref.type === 'reference')
    .map((record) => ({
      type: 'reference',
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

function contextBundleRef(record: RetrievedContextRecord): ContextBundle['contextRefs'][number] {
  return {
    key: refKey(record.ref),
    ref: record.ref,
    status: record.status ?? 'active',
    title: record.title,
    source: record.source,
    evidence: record.evidence,
    ...(record.version ? { version: record.version } : {}),
    ...(record.contentHash ? { contentHash: record.contentHash } : {}),
    ...(record.charCount !== undefined ? { charCount: record.charCount } : {}),
  }
}

function contextPressure(status: BuiltContext['promptStats']['budget']['status']): NonNullable<ContextBundle['budget']>['pressure'] {
  switch (status) {
    case 'exceeded': return 'over'
    case 'critical': return 'high'
    case 'warning': return 'medium'
    default: return 'low'
  }
}

function stableHash(value: unknown): string {
  return `sha256:${hashText(stableStringify(value))}`
}

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`
}
