import type { AgentMemory } from '../memory/types.js'
import type { AgentRun, ToolCallOutcome } from '../state/types.js'
import { buildRetrievedContextStore, uniqueRetrievedContextRefs } from './retrievedContextStore.js'
import type { ContextRef } from './types.js'

const MIN_OMITTED_KNOWLEDGE_BODY_CHARS = 400

export interface BuildFinalSourceSummaryInput {
  run?: AgentRun
  toolResults?: ToolCallOutcome[]
  memories?: AgentMemory[]
  userMessage?: string
}

export function buildFinalSourceSummary(input: BuildFinalSourceSummaryInput): string {
  const lines = finalSourceLines(input)
  return lines.length > 0 ? ['来源：', ...lines.map((line) => `- ${line}`)].join('\n') : ''
}

export function appendFinalSourceSummary(content: string, input: BuildFinalSourceSummaryInput): string {
  const trimmed = content.trim()
  if (!trimmed) return trimmed
  const bounded = omitLargeKnowledgeBodies(trimmed, input.run)
  if (/^来源[:：]/m.test(bounded) || /^Sources:/im.test(bounded)) return bounded
  const summary = buildFinalSourceSummary(input)
  return summary ? [bounded, summary].join('\n\n') : bounded
}

function finalSourceLines(input: BuildFinalSourceSummaryInput): string[] {
  const lines: string[] = []
  const store = buildRetrievedContextStore(input.run?.metadata?.contextLedger)
  const records = store.records
  const refs = uniqueRetrievedContextRefs(records)
  const knowledgeRefs = refs.filter((ref) => ref.type === 'knowledge')
  const draftRefs = refs.filter((ref) => ref.type === 'draft')
  const projectRefs = refs.filter((ref) => ref.type === 'project' || ref.type === 'production' || ref.type === 'asset_slot')
  const generationRefs = refs.filter((ref) => ref.type === 'generation_job')

  if (projectRefs.length > 0 || hasBackendTool(input.toolResults ?? [])) {
    lines.push(formatSourceLine({
      label: '当前项目事实',
      refs: projectRefs,
      fallback: 'backend/MCP tool result',
      records,
      defaultSources: ['backend', 'mcp'],
      defaultEvidence: ['verified'],
    }))
  }
  if (draftRefs.length > 0) {
    lines.push(formatSourceLine({
      label: '本地草稿',
      refs: draftRefs,
      fallback: 'draft tool result',
      records,
      defaultSources: ['draft'],
      defaultEvidence: ['draft'],
    }))
  }
  if (knowledgeRefs.length > 0) {
    lines.push(formatSourceLine({
      label: '通用知识建议',
      refs: knowledgeRefs,
      fallback: 'knowledge tool result',
      records,
      defaultSources: ['knowledge'],
      defaultEvidence: ['advisory'],
    }))
  }
  if (generationRefs.length > 0) {
    lines.push(formatSourceLine({
      label: '生成任务状态',
      refs: generationRefs,
      fallback: 'generation tool result',
      records,
      defaultSources: ['tool_result', 'mcp'],
      defaultEvidence: ['runtime_state'],
    }))
  }
  if ((input.memories?.length ?? 0) > 0) {
    lines.push(`记忆摘要：${input.memories!.slice(0, 3).map((memory) => `memory#${memory.id}`).join(', ')}（source=memory; evidence=summary）`)
  }
  if (input.userMessage?.trim()) lines.push('用户输入：本轮消息（source=user_input; evidence=user_claimed）')
  if ((input.toolResults?.length ?? 0) > 0 && lines.length === 0) lines.push('工具结果：本轮 runtime/MCP tool result（source=tool_result; evidence=runtime_state）')
  return lines
}

function hasBackendTool(toolResults: ToolCallOutcome[]): boolean {
  return toolResults.some((outcome) => /^movscript_(read|query|get|list|create_project|create_script)/.test(outcome.call.name))
}

function formatRefs(refs: ContextRef[], fallback: string): string {
  if (refs.length === 0) return fallback
  return refs.slice(0, 5).map((ref) => `${ref.type}#${ref.id}${ref.title ? `《${ref.title}》` : ''}`).join(', ')
}

function formatSourceLine(input: {
  label: string
  refs: ContextRef[]
  fallback: string
  records: ReturnType<typeof buildRetrievedContextStore>['records']
  defaultSources: string[]
  defaultEvidence: string[]
}): string {
  const keys = new Set(input.refs.map((ref) => `${ref.type}:${ref.id}:${ref.version ?? ref.hash ?? ''}`))
  const records = input.records.filter((record) => keys.has(`${record.ref.type}:${record.ref.id}:${record.ref.version ?? record.ref.hash ?? ''}`))
  const sources = uniqueSorted(records.map((record) => record.source), input.defaultSources)
  const evidence = uniqueSorted(records.map((record) => record.evidence), input.defaultEvidence)
  return `${input.label}：${formatRefs(input.refs, input.fallback)}（source=${sources.join('/')}; evidence=${evidence.join('/')}）`
}

function uniqueSorted(values: string[], fallback: string[]): string[] {
  const unique = Array.from(new Set(values.filter((value) => value.trim().length > 0)))
  return (unique.length > 0 ? unique : fallback).sort((a, b) => a.localeCompare(b))
}

function omitLargeKnowledgeBodies(content: string, run: AgentRun | undefined): string {
  if (!run) return content
  let bounded = content
  for (const knowledge of loadedKnowledgeBodies(run)) {
    if (knowledge.body.length < MIN_OMITTED_KNOWLEDGE_BODY_CHARS) continue
    if (!bounded.includes(knowledge.body)) continue
    const ref = `knowledge#${knowledge.id}${knowledge.title ? `《${knowledge.title}》` : ''}`
    bounded = bounded.split(knowledge.body).join(`[已省略 knowledge 正文：${ref}；请通过来源引用或读取工具查看。]`)
  }
  return bounded
}

function loadedKnowledgeBodies(run: AgentRun): Array<{ id: string; title?: string; body: string }> {
  return run.steps.flatMap((step) => {
    if (step.toolName !== 'movscript_get_knowledge') return []
    const result = isRecord(step.result) ? step.result : undefined
    const id = stringField(result?.id)
    const body = stringField(result?.content)
    if (!id || !body) return []
    return [{
      id,
      ...(stringField(result?.title) ? { title: stringField(result?.title) } : {}),
      body,
    }]
  })
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
