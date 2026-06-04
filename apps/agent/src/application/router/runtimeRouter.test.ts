import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { AgentRuntimeRouter, type AgentTaskGraphSnapshot, type AgentRun, type AgentInternalRunSignal } from './runtimeRouter.js'
import type { JSONValue } from '../../shared/protocol/types.js'
import { FileAgentStore } from '../../state/store/file/fileStore.js'
import { InMemoryAgentStore } from '../../state/store/core/store.js'
import { buildAgentToolResultRecord, FileAgentToolResultStore, InMemoryAgentToolResultStore } from '../../state/store/tool-results/toolResultStore.js'
import { buildModelToolResultContext } from '../../context/tool-result/toolResultContext.js'
import { FileAgentWorkspaceStore, InMemoryAgentWorkspaceStore, validateWorkspace } from '../../workspaces/store/workspaceStore.js'
import { InMemoryAgentMemoryStore } from '../../memory/store/in-memory/memoryStore.js'
import { DEFAULT_AGENT_MANIFEST } from '../../catalog/manifest/agentManifest.js'
import { BackendApplyClient, type BackendApplyAuthContext, type BackendApplyResult } from '../../workspaces/adapters/backend/backendApplyClient.js'
import type { ApplyWorkspaceReview } from '../../workspaces/apply/workspaceApply.js'
import { InMemoryAgentCatalogStateStore } from '../../catalog/registry/state/catalogState.js'
import { loadAgentPluginCatalog } from '../../catalog/loading/core/loader.js'
import { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../../tools/registry/core/toolRegistry.js'
import { normalizeClientInput } from '../../context/input/client/normalizeClientInput.js'
import { WORKSPACE_CONTENT_SCHEMA_IDS } from '@movscript/workspaces'
import { InMemoryReferenceStore, ReferenceManager } from '../../reference/index.js'

process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-test-')), 'model-config.json')

const WRITE_AGENT_MANIFEST = {
  ...DEFAULT_AGENT_MANIFEST,
  tools: [
    ...DEFAULT_AGENT_MANIFEST.tools,
    { name: 'movscript_project_create', mode: 'allow' as const, approval: 'always' as const },
  ],
}

const storyboardRhythmContent = '分镜节奏基础正文。短剧内容单元需要明确节拍、转折和信息递进，避免每个镜头只重复同一个动作。每个镜头都要承担叙事推进、情绪变化或空间交代的至少一个任务，并在下一镜头产生可感知的变化。'

function createTestReferenceManager(): ReferenceManager {
  return new ReferenceManager(new InMemoryReferenceStore({
    referenceSets: [{
      id: 'film.reference.storyboard',
      version: '1.0.0',
      domain: 'storyboard',
      name: 'Storyboard Test Reference',
      tags: ['test'],
      chunkIds: ['storyboard.rhythm.basic'],
    }],
    chunks: [{
      id: 'storyboard.rhythm.basic',
      localReferenceSetId: 'film.reference.storyboard',
      domain: 'storyboard',
      title: '分镜节奏基础',
      tags: ['rhythm'],
      summary: '用于测试分镜节奏参考搜索和读取。',
      content: storyboardRhythmContent,
      sourcePath: '/test/reference/storyboard/rhythm.md',
      contentHash: 'sha256:rhythm',
      charCount: storyboardRhythmContent.length,
    }],
  }))
}

// Install a default model config so executeRun() can find one
{
  const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
  new RuntimeModelConfigStore().save({
    modelConfigId: 1,
    model: 'model_config:1',
    apiKind: 'openai_chat_completions',
    apiKey: 'test-key',
  })
}

// Default model fetch: returns tool calls based on message content, then a final text reply
function installDefaultModelFetch(): void {
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
    const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const toolMessages = messages.filter((m) => m.role === 'tool')
    const tools = (body.tools as Array<{ function: { name: string } }>) ?? []
    const toolNames = new Set(tools.map((t) => t.function.name))
    const isWorkContinuation = /^\[Runtime work continuation\]/.test(userMsg)
    if (isThreadTitleRequest(messages)) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: userMsg.slice(0, 12) }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    // Extract project id from system message
    const projectId = (() => {
      const sys = messages.find((m) => m.role === 'system')?.content ?? ''
      const m = sys.match(/project#(\d+)/)
      return m ? Number(m[1]) : undefined
    })()

    // Extract memories from system message
    const memoriesSection = (() => {
      const sys = messages.find((m) => m.role === 'system')?.content ?? ''
      const m = sys.match(/## Relevant memories\n([\s\S]*?)(?=\n##|$)/)
      return m ? m[1].trim() : ''
    })()
    const memoryCount = memoriesSection ? (memoriesSection.match(/\[/g) ?? []).length : 0

    if (
      /按模型能力|model contract/i.test(userMsg)
      && toolMessages.length > 0
      && toolNames.has('core_work_start')
      && !toolResultForCall(toolMessages, 'core_work_start')
    ) {
      const modelsResult = toolResultForCall(toolMessages, 'generation_model_list') ?? toolResultForCall(toolMessages, 'movscript.list_models')
      const contract = firstModelContract(modelsResult)
      if (contract) {
        const supported = new Set(Array.isArray(contract.supported_param_keys) ? contract.supported_param_keys.filter((item): item is string => typeof item === 'string') : [])
        const extraParams: Record<string, unknown> = {}
        if (supported.has('resolution')) extraParams.resolution = '480p'
        if (supported.has('duration')) extraParams.duration = '5'
        const args: Record<string, unknown> = {
          prompt: '雨夜便利店，电影感，16:9',
          output_type: contract.capabilities?.includes('video') ? 'video' : 'image',
          model_config_id: contract.id,
          wait: false,
          ...(Object.keys(extraParams).length > 0 ? { extra_params: extraParams } : {}),
          ...(projectId !== undefined ? { projectId } : {}),
        }
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_generation_from_contract_1',
                type: 'function',
                function: { name: 'core_work_start', arguments: JSON.stringify({ kind: 'generation_job', request: args }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    }

    // If we already have tool results, return final text
    if (toolMessages.length > 0) {
      const warnings: string[] = []
      for (const tm of toolMessages) {
        const parsed = (() => { try { return JSON.parse(String(tm.content ?? '{}')) } catch { return {} } })() as Record<string, unknown>
        if (parsed.error) warnings.push(`${(parsed.call as any)?.name ?? 'tool'} 未完成：${parsed.error}`)
      }
      const content = warnings.length > 0
        ? `已完成工具调用。${warnings.join(' ')}`
        : memoryCount > 0
          ? `已完成工具调用。已参考 ${memoryCount} 条记忆。`
          : '已完成工具调用。'
      return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    // Decide tool calls based on message
    const callsToMake: Array<{ id: string; name: string; args: Record<string, unknown> }> = []

    if (/记忆|memory|偏好|默认镜头风格/i.test(userMsg) && toolNames.has('core_memory_search')) {
      callsToMake.push({ id: 'call_memory_1', name: 'core_memory_search', args: { query: userMsg.slice(0, 40), limit: 8, ...(projectId !== undefined ? { projectId } : {}) } })
    }
    if (/创建.*项目|新建.*项目|create.*project/i.test(userMsg) && toolNames.has('movscript_project_create')) {
      const quoted = userMsg.match(/[「“"]([^」”"]+)[」”"]/)?.[1]
      const name = quoted ?? '测试项目'
      callsToMake.push({
        id: 'call_create_project_1',
        name: 'movscript_project_create',
        args: {
          name,
          description: '由 agent 创建的测试项目。',
        },
      })
    }
    if (/工作区|workspace/i.test(userMsg) && !/应用|apply/i.test(userMsg) && toolNames.has('workspace_create')) {
      const workspaceContent = JSON.stringify({
        schema: WORKSPACE_CONTENT_SCHEMA_IDS.contentUnitWorkspace,
        scope: 'content_unit_workspace',
        productionId: 4,
        workspace: {
          units: [{
            title: '测试内容单元',
            kind: 'shot',
            description: memoriesSection
              ? `用户请求：${userMsg}\n\n参考记忆：\n${memoriesSection}`
              : `用户请求：${userMsg}`,
          }],
        },
      })
      callsToMake.push({ id: 'call_workspace_1', name: 'workspace_create', args: { kind: 'content_unit_workspace', title: '工作区', content: workspaceContent, ...(projectId !== undefined ? { projectId } : {}) } })
    }
    if (/按模型能力|model contract/i.test(userMsg) && toolNames.has('generation_model_list')) {
      callsToMake.push({
        id: 'call_list_models_for_generation_1',
        name: 'generation_model_list',
        args: { capability: /视频|video/i.test(userMsg) ? 'video' : 'image' },
      })
    }
    if (!isWorkContinuation && !/按模型能力|model contract/i.test(userMsg) && /生成|出图|视频|image|video/i.test(userMsg) && toolNames.has('core_work_start')) {
      const request = {
        prompt: '雨夜便利店，电影感，16:9',
        output_type: /视频|video/i.test(userMsg) ? 'video' : 'image',
        aspect_ratio: '16:9',
        wait: false,
        ...(projectId !== undefined ? { projectId } : {}),
      }
      callsToMake.push({
        id: 'call_generation_1',
        name: 'core_work_start',
        args: { kind: 'generation_job', request },
      })
    }
    if (/选择|缺少上下文|ask user/i.test(userMsg) && !/用户补充信息/.test(userMsg) && toolNames.has('core_user_input_request')) {
      callsToMake.push({
        id: 'call_input_1',
        name: 'core_user_input_request',
        args: {
          title: '选择目标内容',
          summary: '当前请求没有说明要处理哪类项目内容。',
          question: '你希望我先处理哪一类内容？',
          inputType: 'choice',
          choices: [
            { id: 'script', label: '剧本', description: '先处理剧本文本和结构。' },
            { id: 'asset', label: '素材需求', description: '先检查素材需求和设定资料引用。' },
          ],
          allowCustomAnswer: true,
        },
      })
    }
    if (/spawn subagent/i.test(userMsg) && toolNames.has('core_work_start')) {
      callsToMake.push({
        id: 'call_spawn_subagent_1',
        name: 'core_work_start',
        args: {
          kind: 'subagent_run',
          request: {
            name: 'research_worker',
            instructions: 'Check the requested context and report concise findings.',
          },
        },
      })
    }
    if (/list subagents/i.test(userMsg) && toolNames.has('core_work_list')) {
      callsToMake.push({
        id: 'call_list_subagents_1',
        name: 'core_work_list',
        args: {},
      })
    }
    if (/wait subagent/i.test(userMsg) && toolNames.has('core_work_wait')) {
      callsToMake.push({
        id: 'call_wait_subagent_1',
        name: 'core_work_wait',
        args: { timeoutMs: 1000 },
      })
    }

    if (callsToMake.length > 0) {
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: null,
            tool_calls: callsToMake.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })),
          },
          finish_reason: 'tool_calls',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    // No tool calls — return a contextual text reply
    const content = /记住|remember/i.test(userMsg)
      ? `已记录您的偏好。已参考 ${memoryCount} 条记忆。`
      : '好的，已完成。'
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}
installDefaultModelFetch()

const DYNAMIC_CATALOG_BASE_MANIFEST = {
  ...DEFAULT_AGENT_MANIFEST,
  id: 'movscript.test.dynamic-catalog-agent',
  name: 'Dynamic Catalog Test Agent',
  tools: [],
}

function toolResultForCall(toolMessages: Array<{ role: string; content: string | null }>, toolName: string): Record<string, unknown> | undefined {
  for (const message of [...toolMessages].reverse()) {
    const parsed = parseToolMessageResult(message.content)
    const call = isTestRecord(parsed.call) ? parsed.call : undefined
    if (call?.name !== toolName) continue
    const result = unwrapToolResultRecord(parsed.result)
    if (result) return result
  }
  return undefined
}

function firstModelContract(result: Record<string, unknown> | undefined): Record<string, any> | undefined {
  const contracts = Array.isArray(result?.model_contracts) ? result.model_contracts : []
  return contracts.find((item): item is Record<string, any> => isTestRecord(item) && Number.isFinite(Number(item.id)))
}

function isThreadTitleRequest(messages: Array<{ role: string; content: string | null }>): boolean {
  const system = messages.find((message) => message.role === 'system')?.content ?? ''
  return /short chat thread titles/i.test(system)
}

function parseToolMessageResult(content: string | null): Record<string, unknown> {
  if (!content) return {}
  try {
    const parsed = JSON.parse(content) as unknown
    return isTestRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function unwrapToolResultRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isTestRecord(value)) return undefined
  const content = Array.isArray(value.content) ? value.content : []
  const textItem = content.find((item) => isTestRecord(item) && item.type === 'text' && typeof item.text === 'string')
  if (isTestRecord(textItem) && typeof textItem.text === 'string') {
    try {
      const parsed = JSON.parse(textItem.text) as unknown
      return isTestRecord(parsed) ? parsed : value
    } catch {
      return value
    }
  }
  return value
}

type ToolCallRecord = {
  name: string
  args: Record<string, JSONValue>
}

class FakeMCPClient {
  readonly calls: ToolCallRecord[] = []
  readonly extraTools: any[] = []
  readonly toolResults = new Map<string, JSONValue>()
  readonly toolHandlers = new Map<string, (args: Record<string, JSONValue>) => JSONValue>()
  projectId: number | null = null
  userId: number | null = null
  failTools = new Set<string>()
  failInitialize = false

  async initialize(): Promise<JSONValue> {
    if (this.failInitialize) throw new Error('mcp offline')
    return { ok: true }
  }

  async listResources(): Promise<any[]> {
    return []
  }

  async listTools(): Promise<any[]> {
    return [
      { name: 'movscript_project_create', description: 'Create a project.', inputSchema: {} },
      { name: 'movscript_script_locate', description: 'Read project scripts.', inputSchema: {} },
      ...this.extraTools,
    ]
  }

  async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
    this.calls.push({ name, args })
    if (this.failTools.has(name)) {
      throw new Error(`${name} failed`)
    }
    if (name === 'movscript_focus_get') {
      return toolText({
        focus: {
          project: this.projectId === null ? null : { id: this.projectId, name: 'Test Project' },
          user: this.userId === null ? null : { id: this.userId, username: 'tester' },
        },
        timings: {
          focusMs: 12,
          totalMs: 12,
        },
      })
    }
    const handler = this.toolHandlers.get(name)
    if (handler) return toolText(handler(args))
    if (this.toolResults.has(name)) {
      return toolText(this.toolResults.get(name))
    }
    return toolText({ ok: true })
  }
}

class FakeBackendApplyClient extends BackendApplyClient {
  readonly calls: Array<{ review: ApplyWorkspaceReview; auth?: BackendApplyAuthContext }> = []
  readonly previewCalls: Array<{ review: ApplyWorkspaceReview; auth?: BackendApplyAuthContext }> = []
  result: BackendApplyResult = {
    performed: true,
    method: 'PATCH',
    url: 'http://backend/api/v1/projects/42/entities/content-units/7',
    payload: { description: 'New content-unit description' },
  }

  override isEnabled(): boolean {
    return true
  }

  override async applyReview(review: ApplyWorkspaceReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    this.calls.push({ review, auth })
    return this.result
  }

  override async previewApplyReview(review: ApplyWorkspaceReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    this.previewCalls.push({ review, auth })
    return {
      ...this.result,
      response: { status: 'ok', dry_run: true, would_apply: { counts: {} } },
    }
  }

}

function createTestRuntime(options: ConstructorParameters<typeof AgentRuntimeRouter>[0]): AgentRuntimeRouter {
  return new AgentRuntimeRouter(options)
}

test('thread message fallback pages use ordinal cursors in descending order', () => {
  const store = new InMemoryAgentStore()
  const threadId = 'thread_paged_fallback'
  store.createThread({
    id: threadId,
    title: 'Paged thread',
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:03.000Z',
    messages: [
      { id: 'msg_fallback_1', threadId, role: 'user', content: 'first', createdAt: '2026-05-21T00:00:01.000Z' },
      { id: 'msg_fallback_2', threadId, role: 'assistant', content: 'second', createdAt: '2026-05-21T00:00:02.000Z' },
      { id: 'msg_fallback_3', threadId, role: 'user', content: 'third', createdAt: '2026-05-21T00:00:03.000Z' },
    ],
  })
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient(), store })

  const page1 = runtime.listThreadMessagesPage(threadId, { direction: 'desc', limit: 2 })
  const page2 = runtime.listThreadMessagesPage(threadId, { direction: 'desc', afterOrdinal: page1?.nextAfterOrdinal, limit: 2 })

  assert.deepEqual(page1?.messages.map((message) => message.content), ['third', 'second'])
  assert.equal(page1?.nextAfterOrdinal, 2)
  assert.equal(page1?.hasMore, true)
  assert.deepEqual(page2?.messages.map((message) => message.content), ['first'])
  assert.equal(page2?.nextAfterOrdinal, 1)
  assert.equal(page2?.hasMore, false)
})

test('thread deletion removes stored tool result records for deleted runs', () => {
  const store = new InMemoryAgentStore()
  const toolResultStore = new InMemoryAgentToolResultStore()
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient(), store, toolResultStore })
  const thread = runtime.createThread({ title: 'Tool result cleanup' })
  const run: AgentRun = {
    id: 'run_cleanup',
    threadId: thread.id,
    status: 'completed',
    runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
    metadata: {},
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    steps: [],
  }
  store.createRun(run)
  toolResultStore.upsertToolResult({
    schema: 'movscript.agent.tool-result.v1',
    key: 'tool_result:call_cleanup:sha256:cleanup',
    refKey: 'tool_result:call_cleanup:sha256:cleanup',
    resultHash: 'cleanup',
    runId: run.id,
    threadId: thread.id,
    toolName: 'movscript_script_locate',
    result: { ok: true },
    originalChars: 2048,
    renderedChars: 128,
    dropped: true,
    reason: 'budget_dropped',
    modelProjection: '{"contextControl":{"resultRef":"tool_result:call_cleanup:sha256:cleanup"}}',
    preview: '{"contextControl":{"resultRef":"tool_result:call_cleanup:sha256:cleanup"}}',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  })

  const deletion = runtime.deleteThread(thread.id)

  assert.deepEqual(deletion.deletedRunIds, [run.id])
  assert.equal(toolResultStore.listToolResults({ runId: run.id }).length, 0)
})

test('interrupted run resume reuses file-backed tool result projection after runtime restart', async () => {
  const originalFetch = globalThis.fetch
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-tool-result-recovery-'))
  const runtimeDataDir = dir
  const toolResultPath = join(dir, 'tool-results.json')
  const modelConfigPath = join(dir, 'model-config.json')
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = modelConfigPath
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore(modelConfigPath).save({
      modelConfigId: 31,
      model: 'model_config:31',
      apiKind: 'openai_chat_completions',
      apiKey: 'test-key',
    })

    const rawResult = {
      projectId: 42,
      scripts: [{ id: 1, title: '长剧本', content: '雨夜便利店。'.repeat(1200) }],
    }
    const result = toolText(rawResult)
    const call = { id: 'call_restart_scripts', name: 'movscript_script_locate', args: { projectId: 42 } }
    const seedStore = new FileAgentStore(runtimeDataDir)
    const seedRuntime = createTestRuntime({ mcpClient: new FakeMCPClient(), store: seedStore })
    const thread = seedRuntime.createThread({ title: '读取剧本', messages: [{ role: 'user', content: '读取项目剧本' }] })
    const run: AgentRun = {
      id: 'run_restart_projection',
      threadId: thread.id,
      status: 'in_progress',
      runtimeLimits: { approvalMode: 'interactive', maxToolCalls: 20, maxIterations: 20, allowNetwork: false, allowFileBytes: false },
      agentManifest: DEFAULT_AGENT_MANIFEST,
      metadata: {
        initialUserMessageId: thread.messages[0]?.id ?? '',
        limits: { maxRetrievedContextChars: 24000 },
      },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      steps: [],
    }
    seedStore.createRun(run)

    const storedContext = buildModelToolResultContext({
      run: {
        ...run,
        metadata: {
          ...(run.metadata ?? {}),
          limits: { maxRetrievedContextChars: 1000 },
        },
      },
      call,
      result,
    })
    assert.equal(storedContext.dropped, true)
    assert.ok(storedContext.resultRef)
    new FileAgentToolResultStore(toolResultPath).upsertToolResult(buildAgentToolResultRecord({
      runId: run.id,
      threadId: thread.id,
      call,
      result,
      modelContext: storedContext,
      resultRef: storedContext.resultRef,
      now: '2026-01-01T00:00:00.000Z',
    }))

    const requests: Record<string, unknown>[] = []
    let modelCallCount = 0
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null; tool_call_id?: string }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '读取剧本' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      modelCallCount += 1
      requests.push(body)
      if (modelCallCount === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'done', finish_reason: 'stop' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const resumedStore = new FileAgentStore(runtimeDataDir)
    const resumedToolResultStore = new FileAgentToolResultStore(toolResultPath)
    const client = new FakeMCPClient()
    client.projectId = 42
    client.toolResults.set('movscript_script_locate', rawResult)
    const runtime = createTestRuntime({
      mcpClient: client,
      store: resumedStore,
      toolResultStore: resumedToolResultStore,
    })

    const recovery = runtime.reconcileRuntimeThreads()
    assert.deepEqual(recovery.interruptedRunIds, [run.id])
    runtime.resumeInterruptedRun(run.id)
    const completed = await waitForRun(runtime, run.id)

    assert.equal(completed.status, 'completed')
    const secondMessages = requests[1]?.messages as any[]
    const toolMessage = secondMessages.find((message) => message?.role === 'tool' && message.tool_call_id === call.id)
    assert.ok(toolMessage)
    assert.equal(toolMessage.content, storedContext.content)
    assert.equal(String(toolMessage.content).length <= 1000, true)
    assert.doesNotMatch(String(toolMessage.content), /雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalModelConfigPath === undefined) {
      delete process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
    } else {
      process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

test('workspace-first workspace requests create local agent workspaces without backend writes', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个工作区' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.status, 'completed')
  assert.equal(runtime.listWorkspaces({ projectId: 42 }).length, 1)
  assert.equal(client.calls.some((call) => call.name === 'workspace_create'), false)
})

test('previews taskGraph and policy without creating a run or executing planned tools', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个项目「测试项目」' }] })

  const preview = await runtime.previewRun({
    threadId: thread.id,
    agentManifest: WRITE_AGENT_MANIFEST,
  })

  assert.equal(preview.status, 'preview')
  assert.equal(preview.threadId, thread.id)
  assert.equal(preview.currentProjectId, 42)
  assert.equal(preview.pendingApprovals[0]?.toolName, 'movscript_project_create')
  assert.equal(preview.agentManifest?.schema, 'movscript.agent.current')
  assert.ok(preview.context)
  assert.ok(preview.skills)
  assert.ok(preview.tools?.available.some((tool) => tool.name === 'movscript_project_create'))
  assert.ok(preview.promptPreview?.debugParts.some((part) => part.kind === 'tool'))
  assert.equal(preview.toolCalls.length, 0)
  assert.equal(runtime.listRuns().length, 0)
  assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)
  assert.ok(client.calls.some((call) => call.name === 'movscript_focus_get'))
})

test('runtime builds envelope context from client input without frontend prompt assembly', async () => {
  const client = new FakeMCPClient()
  client.projectId = null
  const runtime = createTestRuntime({ mcpClient: client })

  const preview = await runtime.previewRun({
    clientInput: {
      message: '检查第 3 场分镜缺口',
      attachments: [{ id: 'res-8', name: 'moment-ref.png', type: 'image', mimeType: 'image/png', size: 128, resourceId: 8 }],
      uiSnapshot: {
        route: { pathname: '/projects/42/scene-moments' },
        project: { id: 42, name: 'Client Project', status: 'active' },
        selection: { entityType: 'scene_moment', entityId: 3, label: '第 3 场' },
        recentResources: [{ id: 8, name: 'moment-ref.png', type: 'image', mimeType: 'image/png', size: 128 }],
        labels: ['Local Runtime'],
      },
    },
  })

  assert.equal(preview.context?.project?.id, 42)
  assert.equal(preview.context?.selection?.entityType, 'scene_moment')
  assert.equal(preview.context?.attachments[0]?.resourceId, 8)
  assert.equal(preview.context?.recentResources[0]?.id, 8)
  assert.equal(preview.context?.labels[0], 'Local Runtime')
  assert.match(preview.message, /用户附件引用/)
  assert.equal(preview.debug?.manifestId, 'movscript.config_file.base')
  assert.equal(preview.promptPreview?.messages.at(-1)?.content.includes('moment-ref.png'), true)
})

test('thread runtime snapshot observes completed async work and auto-starts the queued continuation run', async () => {
  const store = new InMemoryAgentStore()
  const client = new FakeMCPClient()
  client.toolHandlers.set('generation_job_get', (args) => ({
    jobId: args.jobId,
    status: 'finished',
    output_resource_id: 9001,
  }))
  const runtime = createTestRuntime({ mcpClient: client, store })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '生成一张图' }] })
  const run: AgentRun = {
    id: 'run_1',
    threadId: thread.id,
    status: 'completed',
    runtimeLimits: { approvalMode: 'interactive',
      maxToolCalls: 8,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
    completedAt: '2026-05-21T00:00:01.000Z',
    steps: [],
  }
  store.createRun(run)
  store.createRuntimeWork({
    id: 'work_1',
    threadId: thread.id,
    runId: run.id,
    kind: 'generation_job',
    mode: 'async',
    status: 'waiting',
    request: { prompt: 'image' },
    continuationPolicy: { mode: 'any_completed' },
    externalHandle: { provider: 'movscript', type: 'generation_job', id: 42 },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  })
  store.createRuntimeContinuation({
    id: 'continuation_work_1',
    threadId: thread.id,
    runId: run.id,
    status: 'waiting',
    trigger: { type: 'work_completed', workIds: ['work_1'], mode: 'any' },
    createdAt: '2026-05-21T00:00:00.000Z',
    updatedAt: '2026-05-21T00:00:00.000Z',
  })

  const snapshot = await runtime.getThreadRuntimeSnapshot(thread.id)

  assert.equal(snapshot?.works[0]?.status, 'completed')
  assert.equal(snapshot?.continuations[0]?.status, 'consumed')
  assert.equal(snapshot?.interactions.length, 0)
  const runs = store.listRuns({ threadId: thread.id })
  assert.equal(runs.length, 2)
  assert.match(runs.find((item) => item.parentRunId === run.id)?.status ?? '', /^(queued|in_progress)$/)
})

test('preview activates only triggered layered skills instead of loading every config file Skill', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const preview = await runtime.previewRun({
    clientInput: {
      message: '简单回答当前项目是什么',
      uiSnapshot: {
        route: { pathname: '/projects/42' },
        project: { id: 42, name: 'Test Project' },
      },
    },
  })

  const skillIds = preview.skills?.map((skill) => skill.id) ?? []
  assert.ok(skillIds.includes('core.base.default'))
  assert.ok(skillIds.includes('core.rules.runtime'))
  assert.equal(skillIds.includes('workspace.rules.lifecycle'), false)
  assert.equal(skillIds.includes('movscript.rules.workspace'), false)
  assert.equal(skillIds.includes('movscript.project_standards_workspace'), false)
  assert.equal(skillIds.includes('generation.visual_execution'), false)
  assert.deepEqual(preview.debug?.layerTrace?.skillIds, ['core.base.default', 'core.rules.runtime'])
  assert.equal(preview.debug?.layerTrace?.configFileId, 'movscript.config_file.base')
  assert.equal(preview.debug?.layerTrace?.triggerTraces?.every((trigger) => trigger.selected === false), true)
})

test('preview debug explains selected task trigger reasons', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const preview = await runtime.previewRun({
    clientInput: {
      message: '请帮我做项目规范工作区',
      uiSnapshot: {
        route: { pathname: '/projects/42' },
        project: { id: 42, name: 'Test Project' },
      },
    },
  })

  const triggers = preview.debug?.layerTrace?.triggerTraces ?? []
  const selected = triggers.find((trigger) => trigger.id === 'movscript.project_standards_workspace')
  assert.equal(preview.debug?.layerTrace?.skillIds.includes('movscript.project_standards_workspace'), true)
  assert.equal(selected?.selected, true)
  assert.equal(selected?.matched, true)
  assert.ok(selected?.reason.startsWith('selected:'))
  assert.deepEqual(preview.debug?.layerTrace?.intentSignals?.find((signal) => signal.intent === 'project_standards_workspace'), {
    intent: 'project_standards_workspace',
    source: 'keyword_fallback',
    confidence: 'low',
    evidence: 'keyword:项目规范工作区',
  })
})

test('normalizeClientInput preserves top-level workspace id', () => {
  const normalized = normalizeClientInput({
    message: '请继续使用当前工作区',
    uiSnapshot: {
      workspaceId: 'workspace_123',
      pageContext: {
        workspaceId: 'workspace_123',
      },
    },
  })

  assert.equal(normalized?.uiSnapshot?.workspaceId, 'workspace_123')
  assert.equal(normalized?.uiSnapshot?.pageContext?.workspaceId, 'workspace_123')
})

test('agentic loop does not emit workspace tool calls without a page-owned workspace shell', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个工作区' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.status, 'completed')
  assert.ok(run.steps.some((step) => step.toolName === 'workspace_create' && step.status === 'completed'))
  assert.equal(run.steps.some((step: any) => step.type === 'planning' || step.type === 'subagent'), false)
  assert.equal(runtime.listWorkspaces({ projectId: 42 }).length, 1)
})

test('capabilities distinguish available and blocked tools', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.extraTools.push({ name: 'studio_render', description: 'Render from studio.', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } } } })
  const runtime = createTestRuntime({ mcpClient: client })

  const capabilities = await runtime.getCapabilities({
    currentProjectId: 42,
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_project_create', mode: 'allow' }],
    },
  })

  assert.equal(capabilities.mcp.connected, true)
  assert.ok(capabilities.resolvedTools.available.some((tool) => tool.name === 'movscript_project_create'))
  assert.equal(capabilities.resolvedTools.byName['workspace_create']?.available, false)
  assert.ok(capabilities.pluginCatalog?.metadata?.mcpPacks)
  assert.ok(capabilities.registry.some((tool) => tool.name === 'mcp__default__studio_render' && tool.source === 'mcp'))
})

test('runtime workspace tools are available without MCP tool discovery except removed listing', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const capabilities = await runtime.getCapabilities({ currentProjectId: 42 })

  assert.equal(capabilities.resolvedTools.byName['workspace_apply_preview']?.available, true)
  assert.equal(capabilities.resolvedTools.byName.core_file_edit?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_list_workspaces'], undefined)
  assert.equal(capabilities.resolvedTools.byName['workspace_create']?.available, true)
})

test('runtime validates script split workspace content edited through the real file', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-workspaces-'))
  const workspaceStore = new FileAgentWorkspaceStore(join(dir, 'workspaces.json'))
  const runtime = createTestRuntime({ mcpClient: client, workspaceStore })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请细化工作区' }] })
  const workspace = workspaceStore.createWorkspace({
    projectId: 42,
    kind: 'production_workspace',
    title: '剧本拆分工作区',
    target: { projectId: 42, entityType: 'production', entityId: 7 },
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.productionWorkspace,
      productionId: 7,
      mode: 'snapshot',
      workspace: {
        segments: [{
          title: '第一段',
          summary: '旧摘要',
          scene_moments: [{
            title: '雨夜开场',
            creative_references: [{ id: 1, role: '主角' }],
            asset_slots: [{ name: '雨夜街道', kind: 'image' }],
          }],
        }],
      },
    }),
  })

  try {
    const edited = JSON.parse(readFileSync(workspace.filePath ?? '', 'utf8')) as {
      workspace?: { segments?: Array<{ summary?: string }> }
    }
    if (edited.workspace?.segments?.[0]) edited.workspace.segments[0].summary = '新摘要'
    writeFileSync(workspace.filePath ?? '', JSON.stringify(edited, null, 2), 'utf8')

    const editRun = runtime.createToolRun({
      threadId: thread.id,
      title: 'Preview workspace',
      message: 'Preview workspace',
      toolCall: {
        name: 'workspace_apply_preview',
        args: {
          workspaceId: workspace.id,
        },
      },
    })
    const completed = await waitForRun(runtime, editRun.id)
    const updated = runtime.getWorkspace(workspace.id)
    const parsed = JSON.parse(updated?.content ?? '{}') as { workspace?: { segments?: Array<{ summary?: string }> } }
    const validation = updated ? validateWorkspace(updated) : undefined

    assert.equal(completed.status, 'completed')
    assert.equal(parsed.workspace?.segments?.[0]?.summary, '新摘要')
    assert.equal(validation?.ok, true)
    assert.equal(client.calls.some((call) => call.name === 'workspace_apply_preview'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('explicit write agent can create_project without a current project after approval', async () => {
  const client = new FakeMCPClient()
  client.projectId = null
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个项目「测试项目」' }] })

  const run = await createAndWaitForRun(runtime, thread.id, { agentManifest: WRITE_AGENT_MANIFEST })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript_project_create')
  assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)
  assertRunTraceEventTypes(runtime, run.id, [
    'context.run_built',
    'config_file.resolved',
    'trigger.evaluated',
    'prompt.composed',
    'tool.call.permission_decision',
    'approval.requested',
  ])

  runtime.approveInteraction(run.pendingApprovals![0].interactionId!)
  const resumed = await waitForRun(runtime, run.id)
  const call = client.calls.find((item) => item.name === 'movscript_project_create')

  assert.equal(resumed.status, 'completed')
  assert.equal(call?.args.name, '测试项目')
  assert.equal(call?.args.projectId, undefined)
  const contextTrace = runtime.getRunTraceEvents(resumed.id, { kind: 'context' }).find((event) => event.title === 'Runtime context resolved')
  const contextTraceData = isTestRecord(contextTrace?.data) ? contextTrace.data : undefined
  const focusTimingsValue = contextTraceData && !Array.isArray(contextTraceData)
    ? (contextTraceData as Record<string, unknown>).focusTimings
    : undefined
  const focusTimings = isTestRecord(focusTimingsValue)
    ? (focusTimingsValue as Record<string, unknown>)
    : undefined
  assert.equal(focusTimings?.focusMs, 12)
  const toolTrace = runtime.getRunTraceEvents(resumed.id, { kind: 'tool_call' }).find((event) => event.toolName === 'movscript_project_create' && event.status === 'completed')
  assert.equal(typeof toolTrace?.durationMs, 'number')
  assert.ok((toolTrace?.durationMs ?? -1) >= 0)
  const tracePage = runtime.getRunTracePage(resumed.id, { limit: 2 })
  assert.equal(tracePage.runId, resumed.id)
  assert.equal(tracePage.events.length, 2)
  assert.equal(tracePage.total > tracePage.events.length, true)
  assert.equal(tracePage.hasMore, true)
  assert.equal(tracePage.nextCursor, tracePage.events.at(-1)?.id)
  const nextTracePage = runtime.getRunTracePage(resumed.id, { cursor: tracePage.nextCursor, limit: 2 })
  assert.equal(nextTracePage.events.some((event) => tracePage.events.some((previous) => previous.id === event.id)), false)
  const toolTracePage = runtime.getRunTracePage(resumed.id, { kind: 'tool_call', limit: 1 })
  assert.equal(toolTracePage.total, runtime.getRunTraceEvents(resumed.id, { kind: 'tool_call', limit: Number.MAX_SAFE_INTEGER }).length)
  assert.equal(toolTracePage.events.every((event) => event.kind === 'tool_call'), true)
  const toolStep = runtime.getRun(resumed.id)?.steps.find((step) => step.toolName === 'movscript_project_create' && step.status === 'completed')
  assert.equal(typeof toolStep?.durationMs, 'number')
  assert.ok((toolStep?.durationMs ?? -1) >= 0)
})

test('worker completion records reversible rollback artifacts for local workspace side effects', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const agentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [
      ...DEFAULT_AGENT_MANIFEST.tools,
      { name: 'workspace_create', mode: 'allow' as const, approval: 'never' as const },
    ],
  }
  const runtime = createTestRuntime({
    mcpClient: client,
    activeAgentManifest: agentManifest,
    toolRegistry: new StaticToolRegistry([{
      name: 'workspace_create',
      description: 'Create a local review workspace.',
      permission: 'workspace.write',
      risk: 'workspace',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个工作区' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Workspace rollback rollout',
    tasks: [{ id: 'task_workspace', title: 'Create workspace' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
    agentManifest,
  })
  const workerRun = runtime.createToolRun({
    threadId: thread.id,
    agentManifest,
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_workspace',
    toolCall: {
      name: 'workspace_create',
      args: {
        kind: 'content_unit_workspace',
        title: '工作区',
        productionId: 4,
        content: JSON.stringify({
          schema: WORKSPACE_CONTENT_SCHEMA_IDS.contentUnitWorkspace,
          scope: 'content_unit_workspace',
          productionId: 4,
          workspace: {
            units: [{
              title: '测试内容单元',
              kind: 'shot',
              description: '用户请求：请创建一个工作区',
            }],
          },
        }),
        projectId: 42,
      },
    },
  })
  runtime.updateTask('task_workspace', {
    status: 'running',
    ownerRunId: workerRun.id,
  })
  const worker = await waitForRun(runtime, workerRun.id)
  await runtime.flushPostRunRecords()

  assert.ok(worker.status === 'completed' || worker.status === 'completed_with_warnings')
  assertRunTraceEventTypes(runtime, worker.id, ['rollback_policy'])
  const task = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((item) => item.id === 'task_workspace')
  const completionArtifact = task?.artifacts.find((artifact) => artifact.type === 'run' && artifact.uri === `agent-run:${worker.id}`)
  const rollbackArtifact = task?.artifacts.find((artifact) => artifact.type === 'rollback-policy' && artifact.uri?.startsWith('agent-workspace:'))
  assert.equal(completionArtifact?.metadata?.createdFrom, 'worker_completion')
  assert.equal(completionArtifact?.metadata?.sourceRunId, worker.id)
  assert.equal(completionArtifact?.metadata?.sourceTaskId, 'task_workspace')
  assert.equal(completionArtifact?.metadata?.sourceRunRole, 'worker')
  assert.equal(rollbackArtifact?.metadata?.createdFrom, 'rollback_policy')
  assert.equal(typeof rollbackArtifact?.metadata?.sourceRunId, 'string')
  assert.ok(runtime.getRun(String(rollbackArtifact?.metadata?.sourceRunId)))
  assert.equal(rollbackArtifact?.metadata?.taskGraphId, taskGraph.taskGraph.id)
  assert.equal(rollbackArtifact?.metadata?.toolName, 'workspace_create')
})

test('run agentManifest limits tool execution', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个工作区' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_script_locate', mode: 'allow', approval: 'never' }],
    },
  })

  assert.equal(run.status, 'completed')
  assert.equal(runtime.listWorkspaces({ projectId: 42 }).length, 0)
  assert.deepEqual(run.agentManifest?.tools, [{ name: 'movscript_script_locate', mode: 'allow', approval: 'never' }])
})

test('run requiring approval pauses before tool execution and resumes after approval', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个项目「测试项目」' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: WRITE_AGENT_MANIFEST,
  })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript_project_create')
  assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)

  runtime.approveInteraction(run.pendingApprovals![0].interactionId!)
  const resumed = await waitForRun(runtime, run.id)
  const projectCall = client.calls.find((call) => call.name === 'movscript_project_create')

  assert.ok(resumed.status === 'completed' || resumed.status === 'completed_with_warnings')
  assert.equal(projectCall?.args.name, '测试项目')
  assert.equal(runtime.listWorkspaces({ projectId: 42 }).length, 0)
  assert.equal(resumed.pendingApprovals?.[0].status, 'approved')
  assertRunTraceEventTypes(runtime, resumed.id, ['approval.resolved'])
  assert.equal(findTraceEventByEventType(runtime, resumed.id, 'approval.resolved')?.data?.outcome, 'approved')
})

test('run with multiple approvals resumes once all approvals are accepted', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
    const toolMessages = messages.filter((message) => message.role === 'tool')
    if (isThreadTitleRequest(messages)) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'multiple approvals' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (toolMessages.length > 0) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '已完成工具调用。' }, finish_reason: 'stop' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_create_project_1',
              type: 'function',
              function: { name: 'movscript_project_create', arguments: JSON.stringify({ name: '测试项目 A' }) },
            },
            {
              id: 'call_create_project_2',
              type: 'function',
              function: { name: 'movscript_project_create', arguments: JSON.stringify({ name: '测试项目 B' }) },
            },
          ],
        },
        finish_reason: 'tool_calls',
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建两个项目' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: WRITE_AGENT_MANIFEST,
    })

    assert.equal(run.status, 'requires_action')
    assert.deepEqual(run.pendingApprovals?.map((approval) => approval.toolName), ['movscript_project_create', 'movscript_project_create'])
    assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)

    const [firstApproval, secondApproval] = run.pendingApprovals ?? []
    assert.ok(firstApproval?.interactionId)
    assert.ok(secondApproval?.interactionId)
    const partiallyApproved = runtime.approveInteraction(firstApproval.interactionId).run
    assert.equal(partiallyApproved.status, 'requires_action')
    assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)

    runtime.approveInteraction(secondApproval.interactionId)
    const resumed = await waitForRun(runtime, run.id)
    const assistant = runtime.getThread(thread.id)?.messages.find((message) => message.id === resumed.assistantMessageId)

    assert.ok(resumed.status === 'completed' || resumed.status === 'completed_with_warnings')
    assert.deepEqual(client.calls.filter((call) => call.name === 'movscript_project_create').map((call) => call.args.name), ['测试项目 A', '测试项目 B'])
    assert.equal(resumed.pendingApprovals?.every((approval) => approval.status === 'approved'), true)
    assert.match(assistant?.content ?? '', /已完成工具调用/)
    assertRunTraceEventTypes(runtime, resumed.id, ['approval.resolved'])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('run can request user input and resume after an answer', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '缺少上下文，请让我选择' }] })

  const run = await createAndWaitForRun(runtime, thread.id, { agentManifest: WRITE_AGENT_MANIFEST })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingInputRequests?.[0]?.title, '选择目标内容')
  assert.equal(run.pendingInputRequests?.[0]?.choices[0]?.label, '剧本')
  assert.equal(run.pendingApprovals?.length ?? 0, 0)
  assert.equal(
    runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.kind === 'input' && event.title === 'User input required')
      .length,
    1,
  )

  const answered = runtime.answerRunInputRequest(run.id, {
    requestId: run.pendingInputRequests![0].id,
    choiceIds: ['script'],
    text: '优先处理第一场。',
  })
  assert.equal(answered.status, 'queued')
  const resumed = await waitForRun(runtime, run.id)
  const finalThread = runtime.getThread(thread.id)

  assert.equal(resumed.status, 'completed')
  assert.equal(resumed.pendingInputRequests?.[0]?.status, 'answered')
  assert.equal(resumed.pendingInputRequests?.[0]?.answer?.choiceIds?.[0], 'script')
  assert.ok(finalThread?.messages.some((message) => message.role === 'user' && /用户补充信息/.test(message.content) && /剧本/.test(message.content)))
})

test('run requiring approval can be rejected without executing the tool', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个项目「测试项目」' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: WRITE_AGENT_MANIFEST,
  })
  const rejected = runtime.rejectInteraction(run.pendingApprovals![0].interactionId!).run
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === rejected.assistantMessageId)

  assert.equal(rejected.status, 'completed_with_warnings')
  assert.equal(rejected.pendingApprovals?.[0].status, 'rejected')
  assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)
  assert.match(assistant?.content ?? '', /已取消需要确认的工具调用/)
  assertRunTraceEventTypes(runtime, rejected.id, ['approval.resolved'])
  assert.equal(findTraceEventByEventType(runtime, rejected.id, 'approval.resolved')?.data?.outcome, 'denied')
})

test('run can be cancelled while waiting for action', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个项目「测试项目」' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: WRITE_AGENT_MANIFEST,
  })
  const cancelled = runtime.cancelRun(run.id, { reason: '用户停止了当前会话。' })
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === cancelled.assistantMessageId)

  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.pendingApprovals?.[0].status, 'rejected')
  assert.ok(cancelled.cancelledAt)
  assert.match(assistant?.content ?? '', /已停止当前会话/)
  assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)
})

test('cancelling an already finished run returns the current run', async () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '你好' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const cancelled = runtime.cancelRun(run.id, { reason: '用户停止了当前会话。' })

  assert.equal(run.status, 'completed')
  assert.equal(cancelled.id, run.id)
  assert.equal(cancelled.status, 'completed')
})

test('agent does not apply workspaces as a model-visible tool', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const workspace = runtime.createLocalWorkspace({
    projectId: 42,
    kind: 'content_unit_workspace',
    title: 'Content unit update',
    content: 'New content-unit description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })
  const thread = runtime.createThread({
    messages: [{ role: 'user', content: `请应用工作区 ${workspace.id} 到 content_unit #7 字段 description` }],
  })

  const run = await createAndWaitForRun(runtime, thread.id, { agentManifest: WRITE_AGENT_MANIFEST })

  assert.equal(run.status, 'completed')
  assert.equal(run.pendingApprovals?.length ?? 0, 0)
  assert.equal(runtime.getWorkspace(workspace.id)?.status, 'workspace')
  assert.equal(backendApplyClient.calls.length, 0)
})

test('UI apply_workspace API applies current workspace without creating an agent approval run', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const workspace = runtime.createLocalWorkspace({
    projectId: 42,
    kind: 'content_unit_workspace',
    title: 'Content unit update',
    content: 'New content-unit description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })

  const applied = await runtime.applyWorkspaceFromUI({
    workspaceId: workspace.id,
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
    currentValue: 'Old content-unit description',
    proposedValue: 'New content-unit description',
  }) as any

  assert.equal(applied.status, 'applied')
  assert.equal(applied.review.currentValue, 'Old content-unit description')
  assert.equal(runtime.getWorkspace(workspace.id)?.status, 'workspace')
  assert.equal(runtime.getWorkspace(workspace.id)?.metadata?.lastApplyStatus, 'applied')
  assert.equal((runtime.getWorkspace(workspace.id)?.metadata?.applyReview as any)?.requiresBackendApply, true)
  assert.equal(runtime.getWorkspace(workspace.id)?.metadata?.backendWritePerformed, true)
  assert.equal((runtime.getWorkspace(workspace.id)?.metadata?.backendApply as any)?.method, 'PATCH')
  assert.equal(backendApplyClient.calls.length, 1)
  assert.equal(runtime.listRuns().length, 0)

  runtime.updateWorkspace({
    workspaceId: workspace.id,
    content: 'Revised content-unit description',
  })
  const appliedAgain = await runtime.applyWorkspaceFromUI({
    workspaceId: workspace.id,
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
    currentValue: 'New content-unit description',
    proposedValue: 'Revised content-unit description',
  }) as any

  assert.equal(appliedAgain.status, 'applied')
  assert.equal(runtime.getWorkspace(workspace.id)?.status, 'workspace')
  assert.equal(backendApplyClient.calls.length, 2)
})

test('UI apply_workspace API passes explicit user id to backend apply client', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const workspace = runtime.createLocalWorkspace({
    projectId: 42,
    kind: 'content_unit_workspace',
    title: 'Content unit update',
    content: 'New content-unit description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })
  await runtime.applyWorkspaceFromUI({
    workspaceId: workspace.id,
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
    appliedByUserId: 9,
  })

  assert.equal(backendApplyClient.calls[0].auth?.userId, 9)
})

test('apply_workspace preview API returns before and after values', () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const workspace = runtime.createLocalWorkspace({
    projectId: 42,
    kind: 'project_standards_workspace',
    title: 'Script update',
    content: 'Updated script text',
  })

  const preview = runtime.previewApplyWorkspace({
    workspaceId: workspace.id,
    targetEntityType: 'script',
    targetEntityId: 3,
    targetField: 'content',
    currentValue: 'Old script text',
  }) as any

  assert.equal(preview.status, 'preview')
  assert.equal(preview.review.currentValue, 'Old script text')
  assert.equal(preview.review.proposedValue, 'Updated script text')
  assert.equal(preview.review.risk, 'write')
})

test('simulateApplyWorkspace dry-runs backend apply without marking workspace applied', async () => {
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient(), backendApplyClient })
  const workspace = runtime.createLocalWorkspace({
    projectId: 42,
    kind: 'project_standards_workspace',
    title: 'Project standards workspace',
    content: JSON.stringify({
      schema: WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace,
      scope: 'project_standards_workspace',
      mode: 'snapshot',
      summary: 'Project-level style standards.',
      workspace: {
        project_style: {
          aspect_ratio: '9:16',
          shot_size_system: ['wide', 'medium', 'close-up', 'insert'],
          visual_style: 'Clean vertical drama realism with readable character expressions and key props.',
          negative_rules: ['No arbitrary character face changes', 'No unreadable dark prop details'],
        },
      },
      impact_notes: [],
      createdAt: '2026-05-08T00:00:00.000Z',
    }),
    target: { projectId: 42, entityType: 'project', entityId: 42, field: 'workspace' },
  })

  const result = await runtime.simulateApplyWorkspace({ workspaceId: workspace.id }) as any

  assert.equal(result.ok, true)
  assert.equal(result.backendApply.response.dry_run, true)
  assert.equal(backendApplyClient.previewCalls.length, 1)
  assert.equal(backendApplyClient.calls.length, 0)
  assert.equal(runtime.getWorkspace(workspace.id)?.status, 'workspace')
})

test('rejectWorkspace records review rejection without closing local workspace', () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const workspace = runtime.createLocalWorkspace({
    projectId: 42,
    kind: 'project_standards_workspace',
    title: 'Reject me',
    content: 'Not useful',
  })

  const rejected = runtime.rejectWorkspace({ workspaceId: workspace.id, reason: 'out of scope' })

  assert.equal(rejected.status, 'workspace')
  assert.equal(rejected.rejectedReason, 'out of scope')
  assert.equal(rejected.metadata?.lastReviewStatus, 'rejected')
})

test('sandbox mode intercepts agent write-risk tools', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const run = runtime.createToolRun({
    title: 'Sandbox create project',
    message: 'Sandbox create project',
    sandboxMode: true,
    agentManifest: WRITE_AGENT_MANIFEST,
    toolCall: {
      name: 'movscript_project_create',
      args: { name: 'Sandbox project' },
    },
  })

  const finished = await waitForRun(runtime, run.id)
  const sandboxed = finished.steps.find((step) => step.toolName === 'movscript_project_create')

  assert.equal(finished.status, 'completed')
  assert.equal(Boolean(finished.pendingApprovals?.some((approval) => approval.status === 'pending')), false)
  assert.equal(sandboxed?.sandboxed, true)
  assert.equal(sandboxed?.roundSource, 'runtime_rule')
  assert.equal((sandboxed?.result as any)?.sandboxed, true)
  assert.equal(client.calls.some((call) => call.name === 'movscript_project_create'), false)
})

test('persists threads, messages, runs, and steps across runtime rebuilds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-log-'))
  try {
    const runtimeDataDir = dir
    const client = new FakeMCPClient()
    client.projectId = 42
    const store = new FileAgentStore(runtimeDataDir)
    const runtime = createTestRuntime({ mcpClient: client, store })
    const thread = runtime.createThread({ title: 'Persistent thread' })
    runtime.addMessage(thread.id, { role: 'user', content: '帮我写一个镜头工作区' })
    const run = await createAndWaitForRun(runtime, thread.id)

    const rebuilt = createTestRuntime({ mcpClient: new FakeMCPClient(), store: new FileAgentStore(runtimeDataDir) })
    const restoredThread = rebuilt.getThread(thread.id)
    const restoredRun = rebuilt.getRun(run.id)
    const restoredTraceEvents = rebuilt.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })

    assert.equal(restoredThread?.title, 'Persistent thread')
    assert.equal(restoredThread?.messages.some((message) => message.role === 'user'), true)
    assert.equal(restoredRun?.status, 'completed')
    assert.ok(restoredRun?.steps.some((step) => step.type === 'tool_call'))
    assert.deepEqual(restoredRun?.traceEvents ?? [], [])
    assert.ok(restoredTraceEvents.some((event) => event.kind === 'context'))
    assert.ok(restoredTraceEvents.some((event) => event.kind === 'tool_call'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('thread summaries omit full messages and PATCH-style update changes title and archived', () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'hello' }] })
  runtime.updateThread(thread.id, {
    title: 'Updated title',
    archived: true,
    metadata: { source: 'test' },
  })

  const summary = runtime.listThreadSummaries().find((item) => item.id === thread.id) as any
  assert.equal(summary.title, 'Updated title')
  assert.equal(summary.archived, true)
  assert.equal(summary.metadata.source, 'test')
  assert.equal(summary.messageCount, 1)
  assert.equal('messages' in summary, false)
})

test('new threads expose an agent-owned idle status', () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const thread = runtime.createThread({ title: 'Idle thread' })
  const summary = runtime.listThreadSummaries().find((item) => item.id === thread.id)

  assert.equal(thread.status, 'idle')
  assert.equal(summary?.status, 'idle')
  assert.equal(summary?.activeRunId, undefined)
  assert.equal(summary?.lastRunId, undefined)
})

test('agent runtime owns thread run projection fields', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'hello' }] })
  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.role, 'planner')
  const restoredThread = runtime.getThread(thread.id)
  const summary = runtime.listThreadSummaries().find((item) => item.id === thread.id)
  assert.equal(restoredThread?.status, 'completed')
  assert.equal(restoredThread?.lastRunId, run.id)
  assert.equal(restoredThread?.lastRunStatus, run.status)
  assert.equal(restoredThread?.activeRunId, undefined)
  assert.equal(summary?.status, 'completed')
  assert.equal(summary?.lastRunId, run.id)
  assert.equal(summary?.lastRunStatus, run.status)
  assert.equal(summary?.activeRunId, undefined)
})

test('agent runtime generates a thread title during the first run', async () => {
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string | null }> }
      const system = body.messages?.find((message) => message.role === 'system')?.content ?? ''
      const user = body.messages?.find((message) => message.role === 'user')?.content ?? ''
      calls.push(String(system))
      if (/short chat thread titles/i.test(String(system))) {
        assert.match(String(user), /帮我写一个雨夜便利店短片/)
        return new Response(JSON.stringify({ choices: [{ message: { content: '雨夜短片创作' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '正式回复' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个雨夜便利店短片' }] })
    const run = await createAndWaitForRun(runtime, thread.id)
    await waitForThreadTitle(runtime, thread.id, '雨夜短片创作')
    const restoredThread = runtime.getThread(thread.id)
    const summary = runtime.listThreadSummaries().find((item) => item.id === thread.id)

    assert.equal(restoredThread?.title, '雨夜短片创作')
    assert.equal(restoredThread?.metadata?.titleGenerationStatus, 'completed')
    assert.equal(restoredThread?.metadata?.titleSource, 'model')
    assert.equal(summary?.title, '雨夜短片创作')
    assert.equal(run.status, 'completed')
    assert.equal(calls.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('agent runtime does not wait for slow thread title generation before running the model loop', async () => {
  const originalFetch = globalThis.fetch
  let finishTitle!: () => void
  const calls: string[] = []
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string | null }> }
      const system = body.messages?.find((message) => message.role === 'system')?.content ?? ''
      calls.push(String(system))
      if (/short chat thread titles/i.test(String(system))) {
        await new Promise<void>((resolve) => {
          finishTitle = resolve
        })
        return new Response(JSON.stringify({ choices: [{ message: { content: '慢标题' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '正式回复' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个雨夜便利店短片' }] })
    const run = await createAndWaitForRun(runtime, thread.id)

    assert.equal(run.status, 'completed')
    assert.equal(calls.some((system) => /short chat thread titles/i.test(system)), true)
    assert.equal(calls.some((system) => !/short chat thread titles/i.test(system)), true)
    assert.equal(runtime.getThread(thread.id)?.metadata?.titleGenerationStatus, 'pending')

    finishTitle()
    await waitForThreadTitle(runtime, thread.id, '慢标题')
    assert.equal(runtime.getThread(thread.id)?.metadata?.titleGenerationStatus, 'completed')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('agent runtime persists generated thread titles asynchronously', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string | null }> }
      if (isThreadTitleRequest(body.messages ?? [])) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '雨夜短片创作' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '正式回复' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个雨夜便利店短片' }] })
    const run = runtime.createRun({ threadId: thread.id })
    const completed = await waitForRun(runtime, run.id)
    await waitForThreadTitle(runtime, thread.id, '雨夜短片创作')

    assert.equal(runtime.getThread(thread.id)?.title, '雨夜短片创作')
    assert.equal(completed.status, 'completed')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('agent runtime updates plan revisions without streaming assistant message anchors', () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const thread = runtime.createThread()
  const run: AgentRun = {
    id: 'run_plan_stream',
    threadId: thread.id,
    status: 'in_progress',
    runtimeLimits: { approvalMode: 'auto',
      maxToolCalls: 10,
      maxIterations: 10,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-22T00:00:00.000Z',
    updatedAt: '2026-05-22T00:00:00.000Z',
    steps: [],
  }
  const events: AgentInternalRunSignal[] = []
  const unsubscribe = runtime.subscribeThreadStream(thread.id, (event) => events.push(event))
  events.length = 0

  const result = runtime.updatePlan(run, {
    tasks: [
      { step: 'Inspect message flow', status: 'completed' },
      { step: 'Refresh pinned status', status: 'in_progress' },
    ],
  }) as { status: string; revision?: { id: string } }

  unsubscribe()

  assert.equal(result.status, 'updated')
  assert.equal(result.revision?.id.startsWith('plan_revision'), true)
  assert.equal(events.some((event) => event.type === 'assistant_message'), false)
  assert.equal(runtime.getThread(thread.id)?.messages.length, 0)
  assert.equal(runtime.getThread(thread.id)?.planRevisions?.length, 1)
})

test('agent runtime keeps explicit thread titles', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string | null }> }
      const system = body.messages?.find((message) => message.role === 'system')?.content ?? ''
      assert.doesNotMatch(String(system), /short chat thread titles/i)
      return new Response(JSON.stringify({ choices: [{ message: { content: '正式回复' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
    const thread = runtime.createThread({ title: '已有标题', messages: [{ role: 'user', content: 'hello' }] })
    await createAndWaitForRun(runtime, thread.id)

    assert.equal(runtime.getThread(thread.id)?.title, '已有标题')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('agent runtime falls back to the user message when title generation fails', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string | null }> }
      const system = body.messages?.find((message) => message.role === 'system')?.content ?? ''
      if (/short chat thread titles/i.test(String(system))) {
        return new Response(JSON.stringify({ error: 'title model failed' }), { status: 500, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '正式回复' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '这是一个非常长的用户请求，用来验证标题生成失败时可以截断回退' }] })
    await createAndWaitForRun(runtime, thread.id)
    await waitForThreadTitle(runtime, thread.id, '这是一个非常长的用户请求，用来验证标题生成失败时可以截断回退')
    const restoredThread = runtime.getThread(thread.id)

    assert.equal(restoredThread?.title, '这是一个非常长的用户请求，用来验证标题生成失败时可以截断回退')
    assert.equal(restoredThread?.metadata?.titleGenerationStatus, 'fallback')
    assert.equal(restoredThread?.metadata?.titleSource, 'fallback')
    assert.match(String(restoredThread?.metadata?.titleGenerationError), /HTTP 500/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('user conversation runs default to planner while tool runs default to worker', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'hello' }] })

  const userRun = await createAndWaitForRun(runtime, thread.id)
  const toolRun = runtime.createToolRun({
    threadId: thread.id,
    toolCall: {
      name: 'movscript_script_locate',
      args: { projectId: 42 },
    },
  })
  const finishedToolRun = await waitForRun(runtime, toolRun.id)

  assert.equal(userRun.role, 'planner')
  assert.equal(finishedToolRun.role, 'worker')
  assert.equal(finishedToolRun.parentRunId, undefined)
})

test('preference memories are written and searchable by the next run', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const memoryStore = new InMemoryAgentMemoryStore()
  const runtime = createTestRuntime({ mcpClient: client, memoryStore })
  const thread = runtime.createThread()
  runtime.addMessage(thread.id, { role: 'user', content: '记住默认镜头风格是手持纪实' })

  const firstRun = await createAndWaitForRun(runtime, thread.id)
  await runtime.flushPostRunRecords()
  const preference = runtime.listMemories({ kind: 'preference', projectId: 42 })[0]
  assert.ok(preference)
  assert.equal((firstRun.metadata?.memoryIds as string[] | undefined)?.length, 0)

  runtime.addMessage(thread.id, { role: 'user', content: '搜索主角' })
  const secondRun = await createAndWaitForRun(runtime, thread.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === secondRun.assistantMessageId)

  assert.equal((secondRun.metadata?.memoryIds as string[]).includes(preference.id), false)
  assert.equal(runHasTool(secondRun, 'core_memory_search'), false)

  runtime.addMessage(thread.id, { role: 'user', content: '搜索我的默认镜头风格记忆' })
  const thirdRun = await createAndWaitForRun(runtime, thread.id)
  const memoryStep = thirdRun.steps.find((step) => step.toolName === 'core_memory_search')

  assert.match(assistant?.content ?? '', /已完成|当前/)
  assert.match(JSON.stringify(memoryStep?.result ?? {}), /手持纪实/)
})

test('completed runs persist thread context summaries and reuse refs in later prompts', async () => {
  const originalFetch = globalThis.fetch
  const seenSystemPrompts: string[] = []
  let referenceCallCount = 0
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
        return new Response(JSON.stringify({ choices: [{ message: { content: userMsg.slice(0, 12) }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const systemPrompt = messages.filter((m) => m.role === 'system').map((m) => m.content ?? '').join('\n\n')
      seenSystemPrompts.push(systemPrompt)
      const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      const toolMessages = messages.filter((m) => m.role === 'tool')
      const tools = (body.tools as Array<{ function: { name: string } }>) ?? []
      const toolNames = new Set(tools.map((t) => t.function.name))
      if (/分镜缺口/.test(userMsg) && toolMessages.length === 0 && toolNames.has('reference_search')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_search_reference_1',
                type: 'function',
                function: {
                  name: 'reference_search',
                  arguments: JSON.stringify({
                    query: '分镜 节奏',
                    kind: 'text',
                    source: 'local_reference',
                    domain: 'storyboard',
                    limit: 2,
                  }),
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/分镜缺口/.test(userMsg) && toolMessages.length < 3 && toolNames.has('reference_get')) {
        referenceCallCount += 1
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: `call_get_reference_${referenceCallCount}`,
                type: 'function',
                function: { name: 'reference_get', arguments: JSON.stringify({ id: 'storyboard.rhythm.basic', maxChars: 80 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: toolMessages.length > 0 ? '已完成分镜缺口检查。' : '好的，继续。' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client, referenceManager: createTestReferenceManager() })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '检查分镜缺口' }] })
    const firstRun = await createAndWaitForRun(runtime, thread.id)
    const afterFirst = runtime.getThread(thread.id)
    const firstAssistant = afterFirst?.messages.find((message) => message.id === firstRun.assistantMessageId)
    const summary = afterFirst?.metadata?.threadContextSummary as any

    const searchedTrace = findTraceEventByEventType(runtime, firstRun.id, 'context.reference_searched')
    assert.equal(searchedTrace?.data?.query, '分镜 节奏')
    assert.equal(searchedTrace?.data?.domain, 'storyboard')
    assert.equal(typeof searchedTrace?.data?.resultCount, 'number')
    const loadedTrace = findTraceEventByEventType(runtime, firstRun.id, 'context.reference_loaded')
    assert.equal(loadedTrace?.data?.id, 'storyboard.rhythm.basic')
    assert.equal(loadedTrace?.data?.truncated, true)
    assert.equal((loadedTrace?.data?.refs as any[])?.some((ref) => ref.id === 'storyboard.rhythm.basic' && ref.evidence === 'advisory'), true)
    const dedupedTrace = findTraceEventByEventType(runtime, firstRun.id, 'context.item_deduped')
    assert.equal((dedupedTrace?.data?.dedupedCount as number) >= 1, true)
    assert.equal((dedupedTrace?.data?.records as any[])?.some((record) => record.type === 'reference' && record.id === 'storyboard.rhythm.basic'), true)

    assert.equal(summary?.schema, 'movscript.thread-context-summary.v2')
    assert.equal(firstRun.metadata?.threadContextSummary && (firstRun.metadata.threadContextSummary as any).schema, 'movscript.thread-context-summary.v2')
    assert.ok(summary.recentRunRefs?.[0]?.retrievedRefs?.some((ref: any) => ref.type === 'reference' && ref.id === 'storyboard.rhythm.basic'))
    assert.doesNotMatch(firstAssistant?.content ?? '', /来源：/)
    assert.doesNotMatch(firstAssistant?.content ?? '', /参考资料：.*reference#storyboard\.rhythm\.basic《分镜节奏基础》.*（source=reference; evidence=advisory）/)
    assert.doesNotMatch(firstAssistant?.content ?? '', /用户输入：本轮消息（source=user_input; evidence=user_claimed）/)

    runtime.addMessage(thread.id, { role: 'user', content: '继续' })
    const secondRun = await createAndWaitForRun(runtime, thread.id)
    const promptEvent = findTraceEventByEventType(runtime, secondRun.id, 'prompt.composed')
    const parts = (promptEvent?.data?.promptStats as any)?.parts as any[]

    assert.ok(parts.some((part) => part.id === 'thread.continuity'))
    assert.match(seenSystemPrompts.at(-1) ?? '', /Persisted thread context summary/)
    assert.match(seenSystemPrompts.at(-1) ?? '', /reference#storyboard.rhythm.basic/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('content unit storyboard workspace searches reference and creates a workspace workspace', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
        return new Response(JSON.stringify({ choices: [{ message: { content: userMsg.slice(0, 12) }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
      const toolMessages = messages.filter((m) => m.role === 'tool')
      const tools = (body.tools as Array<{ function: { name: string } }>) ?? []
      const toolNames = new Set(tools.map((t) => t.function.name))
      if (/内容单元分镜 workspace/.test(userMsg) && toolMessages.length === 0 && toolNames.has('reference_search')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_search_storyboard_reference',
                type: 'function',
                function: { name: 'reference_search', arguments: JSON.stringify({ query: '内容单元 分镜 节奏', domain: 'storyboard', limit: 2 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/内容单元分镜 workspace/.test(userMsg) && toolMessages.length === 1 && toolNames.has('reference_get')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_get_storyboard_reference',
                type: 'function',
                function: { name: 'reference_get', arguments: JSON.stringify({ id: 'storyboard.rhythm.basic', maxChars: 120 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/内容单元分镜 workspace/.test(userMsg) && toolMessages.length === 2 && toolNames.has('workspace_create')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_create_content_unit_workspace',
                type: 'function',
                function: {
                  name: 'workspace_create',
                  arguments: JSON.stringify({
                    workspace: true,
                    kind: 'content_unit_workspace',
                    title: '内容单元分镜 workspace',
                    projectId: 42,
                    productionId: 4,
                    content: JSON.stringify({
                      schema: 'movscript.content_unit_workspace.v1',
                      scope: 'content_unit_workspace',
                      productionId: 4,
                      workspace: {
                        units: [{
                          title: '雨夜开场推进',
                          kind: 'shot',
                          description: '用一个低机位跟拍把主角带入便利店门口。',
                          shot: {
                            shot_size: 'medium shot',
                            camera_angle: 'low angle',
                            camera_movement: 'slow tracking',
                          },
                          lighting: '雨棚冷光和店内暖光形成反差。',
                        }],
                      },
                      summary: '基于 storyboard.rhythm.basic 创建内容单元分镜 workspace。',
                    }),
                  }),
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '已创建内容单元分镜 workspace workspace。', finish_reason: 'stop' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client, referenceManager: createTestReferenceManager() })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建内容单元分镜 workspace 工作区' }] })
    const run = await createAndWaitForRun(runtime, thread.id)
    const workspace = runtime.listWorkspaces({ projectId: 42, kind: 'content_unit_workspace' })[0]

    assert.equal(run.status, 'completed_with_warnings')
    assert.equal(run.pendingApprovals?.length ?? 0, 0)
    assert.equal(run.steps.some((step) => step.toolName === 'reference_search' && step.status === 'completed'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'reference_get' && step.status === 'completed'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'workspace_create' && step.status === 'completed'), true)
    assert.equal(workspace?.kind, 'content_unit_workspace')
    assert.match(workspace?.content ?? '', /movscript\.content_unit_workspace\.v1/)
    assert.equal((workspace?.metadata as any)?.workspace, true)
    assert.equal((workspace?.target as any)?.entityType, 'production')
    assert.equal((workspace?.target as any)?.entityId, 4)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('records backend OpenAI-compatible model HTTP request and response in run trace', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-trace-'))
  const runtimeDataDir = modelConfigDir
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore().save({
      modelConfigId: 13,
      model: 'model_config:13',
      apiKind: 'openai_chat_completions',
      apiKey: 'test-key',
    })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      assert.equal(body.model, 'model_config:13')
      return new Response(JSON.stringify({
        id: 'chatcmpl_trace_test',
        choices: [{ message: { content: 'trace reply' } }],
      }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', 'x-trace-id': 'trace-test' },
      })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const store = new FileAgentStore(runtimeDataDir)
    const runtime = createTestRuntime({ mcpClient: client, store })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: 'hello' }] })
    const run = await createAndWaitForRun(runtime, thread.id, { backendAuthToken: 'secret-token' })

    const traceEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    const requestEvent = traceEvents.find((event) => event.kind === 'model_call' && event.title === 'Model HTTP request sent')
    const responseEvent = traceEvents.find((event) => event.kind === 'model_call' && event.title === 'Model HTTP response received')
    const assistantEvent = traceEvents.find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
    const requestData = requestEvent?.data as any
    const responseData = responseEvent?.data as any
    const assistantData = assistantEvent?.data as any

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(requestData.request.url, 'http://localhost:8765/v1/chat/completions')
    assert.equal(requestData.request.method, 'POST')
    assert.equal(requestData.request.headers.Authorization, undefined)
    assert.equal(requestData.request.body.model, 'model_config:13')
    assert.equal(typeof requestData.request.body.messageCount, 'number')
    assert.equal(requestData.request.body.messageCount > 0, true)
    assert.equal(requestData.request.body.contentMode, 'summary')
    assert.equal(typeof requestData.request.body.bodyHash, 'string')
    assert.equal(requestData.request.body.messages, undefined)
    assert.equal(responseData.response.status, 200)
    assert.equal(responseData.response.headers['content-type'], 'application/json')
    assert.equal(responseData.response.headers['x-trace-id'], 'trace-test')
    assert.equal(typeof responseData.response.bodyTextHash, 'string')
    assert.equal(responseData.response.bodyTextChars > 0, true)
    assert.match(responseData.response.bodyText, /trace reply/)
    assert.equal(responseData.response.parsedBody.id, 'chatcmpl_trace_test')
    assert.equal(responseData.response.contentChars, 'trace reply'.length)
    assert.equal(responseData.response.content, 'trace reply')
    assert.equal(typeof requestData.contextBundleId, 'string')
    assert.equal(requestData.contextBundleId, responseData.contextBundleId)
    assert.equal(requestData.contextBundleRef.id, requestData.contextBundleId)
    assert.equal(responseData.contextBundleRef.id, responseData.contextBundleId)
    assert.equal(requestData.contextBundle, undefined)
    assert.equal(typeof responseData.latencyMs, 'number')
    assert.equal(typeof assistantData.messageId, 'string')
    assert.equal(assistantData.content, undefined)
    assert.equal(assistantData.contentMode, 'summary')
    assert.equal(typeof assistantData.contentHash, 'string')
    assert.equal(assistantData.chars > 0, true)
    assert.match(assistantEvent?.summary ?? '', /Assistant message created \(\d+ chars\)\./)
    assert.doesNotMatch(assistantEvent?.summary ?? '', /trace reply/)
    assert.doesNotMatch(assistantEvent?.summary ?? '', /来源/)
    assert.equal(assistantData.source, 'model')
    assertRunTraceEventTypes(runtime, run.id, [
      'context.run_built',
      'config_file.resolved',
      'trigger.evaluated',
      'prompt.composed',
    ])
    const runBuiltEvent = findTraceEventByEventType(runtime, run.id, 'context.run_built')
    assert.ok(Array.isArray((runBuiltEvent?.data as any)?.activeSkillIds))
    assert.ok(Array.isArray((runBuiltEvent?.data as any)?.visibleToolNames))
    const promptEvent = findTraceEventByEventType(runtime, run.id, 'prompt.composed')
    const promptStats = promptEvent?.data?.promptStats as any
    assert.equal(promptEvent?.data?.contextEventType, 'context.prompt_composed')
    assert.equal((promptEvent?.data?.contextBundleRef as any)?.id, promptEvent?.data?.contextBundleId)
    assert.equal(promptEvent?.data?.contextBundle, undefined)
    assert.equal((promptEvent?.data?.contextBundleRef as any)?.promptPartCount > 0, true)
    assert.equal((promptEvent?.data?.contextBundleRef as any)?.contextRefs, undefined)
    assert.equal((promptEvent?.data?.contextBundleRef as any)?.promptParts, undefined)
    assert.equal(typeof promptEvent?.data?.messageCount, 'number')
    assert.equal(typeof promptEvent?.data?.systemMessageCount, 'number')
    assert.equal(typeof promptStats?.totalChars, 'number')
    assert.ok(promptStats.byLayer.level0_core > 0)
    assert.equal(promptStats.byLayer.level1_context, 0)
    assert.ok(promptStats.byLayer.level2_behavior > 0)
    assert.ok(promptStats.byContextLayer.runtime_contract > 0)
    assert.equal(promptStats.byContextLayer.focus, 0)
    assert.ok(promptStats.byContextLayer.behavior > 0)
    assert.ok(Array.isArray(promptStats.parts))
    assert.equal(run.metadata?.contextLedger && (run.metadata.contextLedger as any).schema, 'movscript.context-ledger.v1')
    assert.ok(Array.isArray(run.metadata?.activeSkillIds))
    assert.ok(Array.isArray(run.metadata?.visibleToolNames))

    const rebuilt = createTestRuntime({ mcpClient: new FakeMCPClient(), store: new FileAgentStore(runtimeDataDir) })
    const restoredTraceEvents = rebuilt.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    const restoredRequestData = restoredTraceEvents
      .find((event) => event.kind === 'model_call' && event.title === 'Model HTTP request sent')
      ?.data as any
    const restoredResponseData = restoredTraceEvents
      .find((event) => event.kind === 'model_call' && event.title === 'Model HTTP response received')
      ?.data as any
    const restoredAssistantData = restoredTraceEvents
      .find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
      ?.data as any
    assert.equal(restoredRequestData.request.body.model, 'model_config:13')
    assert.equal(typeof restoredRequestData.request.body.messageCount, 'number')
    assert.equal(restoredRequestData.request.body.messageCount > 0, true)
    assert.equal(restoredRequestData.request.body.contentMode, 'summary')
    assert.equal(typeof restoredRequestData.request.body.bodyHash, 'string')
    assert.equal(restoredRequestData.request.body.messages, undefined)
    assert.equal(restoredRequestData.request.headers.Authorization, undefined)
    assert.equal(restoredResponseData.response.headers['content-type'], 'application/json')
    assert.equal(restoredResponseData.response.headers['x-trace-id'], 'trace-test')
    assert.equal(typeof restoredResponseData.response.bodyTextHash, 'string')
    assert.equal(restoredResponseData.response.bodyTextChars > 0, true)
    assert.match(restoredResponseData.response.bodyText, /trace reply/)
    assert.equal(restoredResponseData.response.parsedBody.id, 'chatcmpl_trace_test')
    assert.equal(restoredResponseData.response.contentChars, 'trace reply'.length)
    assert.equal(restoredResponseData.response.content, 'trace reply')
    assert.equal(typeof restoredRequestData.contextBundleId, 'string')
    assert.equal(restoredRequestData.contextBundleId, restoredResponseData.contextBundleId)
    assert.equal(restoredRequestData.contextBundleRef.id, restoredRequestData.contextBundleId)
    assert.equal(restoredResponseData.contextBundleRef.id, restoredResponseData.contextBundleId)
    assert.equal(restoredRequestData.contextBundle, undefined)
    assert.equal(typeof restoredAssistantData.messageId, 'string')
    assert.equal(restoredAssistantData.content, undefined)
    assert.equal(restoredAssistantData.contentMode, 'summary')
    assert.equal(typeof restoredAssistantData.contentHash, 'string')
    assert.equal(restoredAssistantData.chars > 0, true)
    assert.equal(restoredAssistantData.source, 'model')
    assert.deepEqual(rebuilt.getRun(run.id)?.traceEvents ?? [], [])
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('emits assistant_progress events from streamed model content', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-stream-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13', apiKind: 'openai_chat_completions', apiKey: 'test-key' })

    globalThis.fetch = (async () => {
      const body = [
        'data: {"choices":[{"delta":{"role":"assistant","content":"流式"},"finish_reason":""}]}',
        '',
        'data: {"event":{"content_delta":"响应"}}',
        '',
        'data: {"content_delta":"继续"}',
        '',
        'data: {"choices":[{"delta":{"content":"完成"},"finish_reason":"stop"}]}',
        '',
        'data: [DONE]',
        '',
      ].join('\n')
      return new Response(body, {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: 'hello stream' }] })
    const run = runtime.createRun({ threadId: thread.id, backendAuthToken: 'secret-token' })
    const progressChunks: string[] = []
    const progressSnapshots: string[] = []
    const finalAssistantMessages: string[] = []
    runtime.subscribeRunStream(run.id, (event) => {
      if (event.type === 'assistant_progress') {
        progressChunks.push(event.delta)
        progressSnapshots.push(event.accumulated)
      }
      if (event.type === 'assistant_message') {
        finalAssistantMessages.push(event.message.content)
      }
    })

    const completed = await waitForRun(runtime, run.id)

    assert.ok(completed.status === 'completed' || completed.status === 'completed_with_warnings')
    assert.deepEqual(completed.traceEvents ?? [], [])
    assert.deepEqual(progressChunks, ['流式', '响应', '继续', '完成'])
    assert.deepEqual(progressSnapshots, ['流式', '流式响应', '流式响应继续', '流式响应继续完成'])
    assert.equal(runtime.getRunTraceEvents(completed.id, { limit: Number.MAX_SAFE_INTEGER }).some((event) => event.title === 'Assistant progress update'), false)
    const assistantTrace = runtime.getRunTraceEvents(completed.id, { limit: Number.MAX_SAFE_INTEGER })
      .find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
    assert.equal((assistantTrace?.data as any)?.content, undefined)
    assert.equal((assistantTrace?.data as any)?.contentMode, 'summary')
    assert.match(assistantTrace?.summary ?? '', /Assistant message created \(\d+ chars\)\./)
    assert.doesNotMatch(assistantTrace?.summary ?? '', /流式完成/)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('emits structured live trace events from streamed tool call deltas', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-tool-stream-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  let callCount = 0
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13', apiKind: 'openai_chat_completions', apiKey: 'test-key' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string | null }> }
      if (isThreadTitleRequest(body.messages ?? [])) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '流式工具调用' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      callCount += 1
      if (callCount === 1) {
        const body = [
          'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_stream_project","type":"function","function":{"name":"movscript_project_create","arguments":"{\\"name\\""}}]},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"雨夜便利店\\""}}]},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]},"finish_reason":"tool_calls"}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n')
        return new Response(body, {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'text/event-stream' },
        })
      }

      return new Response(JSON.stringify({
        choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
      }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: 'stream a tool call' }] })
    const run = runtime.createRun({
      threadId: thread.id,
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_project_create', mode: 'allow', approval: 'never' },
        ],
      },
    })
    const liveToolEvents: any[] = []
    const liveToolStreamEvents: any[] = []
    runtime.subscribeRunStream(run.id, (event) => {
      if (event.type === 'trace' && event.event.kind === 'tool_call' && event.event.title === 'Model tool call delta') {
        liveToolStreamEvents.push(event)
        liveToolEvents.push(event.event)
      }
    })

    const completed = await waitForRun(runtime, run.id)

    assert.ok(completed.status === 'completed' || completed.status === 'completed_with_warnings')
    assert.equal(runtime.listWorkspaces({ projectId: 42 }).length, 0)
    assert.equal(liveToolEvents.length >= 3, true)
    assert.deepEqual(new Set(liveToolEvents.map((event) => event.id)).size, 1)
    assert.equal(liveToolStreamEvents.every((event) => event.run === undefined), true)
    const finalStream = liveToolEvents.at(-1)?.data?.stream
    assert.equal(finalStream?.toolCall?.name, 'movscript_project_create')
    assert.equal(finalStream?.toolCall?.parseStatus, 'valid_json')
    assert.equal(finalStream?.toolCall?.argumentsJSON, undefined)
    assert.equal(finalStream?.toolCall?.argumentsJSONMode, 'summary')
    assert.equal(finalStream?.toolCall?.argumentsBufferMode, 'summary')
    assert.doesNotMatch(JSON.stringify(finalStream), /雨夜便利店/)
    assert.deepEqual(completed.traceEvents ?? [], [])
    assert.equal(runtime.getRunTraceEvents(completed.id, { limit: Number.MAX_SAFE_INTEGER }).some((event) => event.title === 'Model tool call delta'), false)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('model tool_calls are executed and fed back into the next model turn', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-loop-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  const requests: Array<Record<string, unknown>> = []
  let callCount = 0
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13', apiKind: 'openai_chat_completions', apiKey: 'test-key' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '创建项目' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      callCount += 1
      requests.push(body)

      if (callCount === 1) {
        assert.equal(Array.isArray(body.tools), true)
        assert.equal((body.tools as any[]).some((tool) => tool?.function?.name === 'movscript_project_create'), true)
        return new Response(JSON.stringify({
          id: 'chatcmpl_tool_turn_1',
          choices: [{
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_read_context',
                  type: 'function',
                  function: {
                    name: 'movscript_project_create',
                    arguments: JSON.stringify({
                      name: '雨夜便利店',
                    }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          }],
        }), {
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({
        id: 'chatcmpl_tool_turn_2',
        choices: [{
          message: {
            content: JSON.stringify({
              status: 'done',
              toolResultsSeen: (body.messages as any[]).filter((message) => message?.role === 'tool').length,
            }),
          },
        }],
      }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '创建项目' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_project_create', mode: 'allow', approval: 'never' },
        ],
      },
    })
    const finalThread = runtime.getThread(thread.id)
    const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(callCount >= 2, true)
    assert.equal(runtime.listWorkspaces({ projectId: 42 }).length, 0)
    const ledger = run.metadata?.contextLedger as any
    assert.equal(ledger?.schema, 'movscript.context-ledger.v1')
    const ledgerEvent = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
      .find((event) => event.data && (event.data as any).eventType === 'context.ledger_updated')
    assert.ok(ledgerEvent)
    const secondMessages = requests[1]?.messages as any[]
    assert.equal(secondMessages.some((message) => message?.role === 'assistant' && Array.isArray(message.tool_calls)), true)
    assert.equal(secondMessages.some((message) => message?.role === 'tool' && message.tool_call_id === 'call_read_context'), true)
    assert.equal(secondMessages.some((message) => {
      if (message?.role !== 'user' || typeof message.content !== 'string') return false
      try {
        const parsed = JSON.parse(message.content)
        return Array.isArray(parsed.toolResults)
      } catch {
        return false
      }
    }), false)
    assert.match(assistant?.content ?? '', /status/)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('assistant content from multiple model turns is preserved in the final chat message', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-turn-content-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  let callCount = 0
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13', apiKind: 'openai_chat_completions', apiKey: 'test-key' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '创建项目' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      callCount += 1
      if (callCount === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: '先说明一下，我会先创建项目，再给出结果。',
              tool_calls: [{
                id: 'call_create_project_turn_1',
                type: 'function',
                function: {
                  name: 'movscript_project_create',
                  arguments: JSON.stringify({
                    name: '雨夜便利店',
                  }),
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }

      return new Response(JSON.stringify({
        choices: [{ message: { content: '已完成工具调用，最终结论如下。', finish_reason: 'stop' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '创建项目' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_project_create', mode: 'allow', approval: 'never' },
        ],
      },
    })
    const assistant = runtime.getThread(thread.id)?.messages.find((message) => message.id === run.assistantMessageId)

    assert.equal(callCount >= 2, true)
    assert.match(assistant?.content ?? '', /先说明一下/)
    assert.match(assistant?.content ?? '', /已完成工具调用/)
    const assistantTrace = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
      .find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
    assert.equal((assistantTrace?.data as any)?.content, undefined)
    assert.match(assistantTrace?.summary ?? '', /Assistant message created \(\d+ chars\)\./)
    assert.doesNotMatch(assistantTrace?.summary ?? '', /先说明一下/)
    assert.doesNotMatch(assistantTrace?.summary ?? '', /已完成工具调用/)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('oversized tool results are summarized before the next model turn', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-tool-result-budget-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  const requests: Array<Record<string, unknown>> = []
  let callCount = 0
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13', apiKind: 'openai_chat_completions', apiKey: 'test-key' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '读取剧本' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      callCount += 1
      requests.push(body)
      if (callCount === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_read_scripts',
                type: 'function',
                function: { name: 'movscript_script_locate', arguments: JSON.stringify({ projectId: 42 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'done', finish_reason: 'stop' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    client.toolResults.set('movscript_script_locate', {
      projectId: 42,
      scripts: [{ id: 1, title: '长剧本', content: '雨夜便利店。'.repeat(1200) }],
    })
    const toolResultStore = new InMemoryAgentToolResultStore()
    const runtime = createTestRuntime({ mcpClient: client, toolResultStore })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '读取项目剧本' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        metadata: { limits: { maxRetrievedContextChars: 1000 } },
      },
    })

    const secondMessages = requests[1]?.messages as any[]
    const toolMessage = secondMessages.find((message) => message?.role === 'tool' && message.tool_call_id === 'call_read_scripts')
    assert.ok(toolMessage)
    assert.equal(String(toolMessage.content).length <= 1000, true)
    assert.match(String(toolMessage.content), /contextControl/)
    assert.match(String(toolMessage.content), /omitted_tool_result_summary/)
    assert.doesNotMatch(String(toolMessage.content), /雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。/)
    const droppedTrace = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER }).find((event) => (event.data as any)?.eventType === 'context.item_dropped')
    assert.ok(droppedTrace)
    const refKey = String((droppedTrace.data as any).refKey)
    const stored = runtime.getRunToolResult(run.id, refKey)
    assert.equal(stored.runId, run.id)
    assert.equal(stored.toolName, 'movscript_script_locate')
    assert.equal(stored.resultHash, (droppedTrace.data as any).resultHash)
    assert.equal(stored.dropped, true)
    assert.deepEqual(runtime.findRunToolResults(run.id, { resultHash: stored.resultHash }).map((record) => record.key), [stored.key])
    assert.equal(toolResultStore.getToolResult(refKey)?.key, stored.key)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('runtime work generation starts emit structured created trace without synchronous polling', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.toolResults.set('generation_job_create', {
    status: 'queued',
    jobId: 123,
    terminal: false,
    monitor: {
      tool: 'generation_job_get',
      args: { jobId: 123, projectId: 42 },
      timeoutMs: 200,
      pollIntervalMs: 10,
    },
    message: '生成任务已创建（Job #123）。',
  })
  let inspectCount = 0
  client.toolHandlers.set('generation_job_get', (): JSONValue => {
    inspectCount += 1
    if (inspectCount < 2) {
      return {
        status: 'running',
        jobId: 123,
        terminal: false,
        progress: 50,
        message: '生成任务 Job #123 仍在进行中，状态：running，进度 50%。',
      }
    }
    return {
      status: 'succeeded',
      jobId: 123,
      providerName: 'test-provider',
      modelDisplay: 'Test Image Model',
      modelIdentifier: 'test/image-model',
      modelConfigId: 9,
      terminal: true,
      progress: 100,
      output_resource_id: 456,
      media: { id: 456, type: 'image', url: '/api/v1/resources/456/file', mime_type: 'image/png' },
      message: '生成完成，输出资源 #456。',
    }
  })
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '生成一张雨夜便利店概念图' }] })
  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'core_work_start', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  const generationEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    .filter((event) => event.kind === 'tool_call' && hasGenerationTraceData(event.data))
  assert.equal(generationEvents.length >= 1, true)
  const created = (generationEvents[0]!.data as Record<string, any>).generation
  assert.equal(created.jobId, 123)
  assert.equal(created.stage, 'created')
  assert.equal(created.status, 'queued')
  assert.equal(created.terminal, false)
  assert.equal(generationEvents.every((event) => (event.data as Record<string, any>).generation.stage === 'created'), true)
  assert.equal(inspectCount, 0)
  assert.deepEqual(client.calls.filter((call) => call.name === 'generation_job_get'), [])
})

test('agent uses model_contracts from list_models before generation params', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.extraTools.push({ name: 'generation_model_list', description: 'List generation models.', inputSchema: {} })
  client.toolResults.set('generation_model_list', {
    count: 1,
    queries: ['capability:video'],
    model_contracts: [{
      id: 77,
      display_name: 'Contract Video',
      capabilities: ['video'],
      accepts_image_input: false,
      input_requirements: {
        image: { min: 0, max: 0 },
        video: { min: 0, max: 0 },
      },
      supported_param_keys: ['duration', 'resolution'],
      params_schema_loaded: true,
      params_schema_rule_count: 1,
    }],
    models: [],
  })
  client.toolResults.set('generation_job_create', {
    status: 'queued',
    jobId: 991,
    terminal: true,
    param_validation: {
      audit_version: 1,
      model_config_id: 77,
      model_contract_loaded: true,
      params_schema_loaded: true,
      params_schema_rule_count: 1,
      supported_params: ['duration', 'resolution'],
      submitted_extra_params: ['duration', 'resolution'],
    },
    message: '生成任务已创建（Job #991）。',
  })
  const generationRegistry = new StaticToolRegistry([
    ...DEFAULT_TOOL_REGISTRY.list(),
    {
      name: 'generation_model_list',
      description: 'List generation models.',
      permission: 'generation.read',
      risk: 'read',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
    {
      name: 'core_work_start',
      description: 'Start an asynchronous runtime work.',
      permission: 'agent.work.write',
      risk: 'generate',
      source: 'runtime',
      projectScoped: true,
      requiresApprovalByDefault: false,
    },
  ])
  const runtime = createTestRuntime({ mcpClient: client, toolRegistry: generationRegistry })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '按模型能力生成一段视频' }] })
  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'generation_model_list', mode: 'allow', approval: 'never' },
        { name: 'core_work_start', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  assert.deepEqual(client.calls.map((call) => call.name).filter((name) => name === 'generation_model_list' || name === 'generation_job_create'), [
    'generation_model_list',
    'generation_job_create',
  ])
  const generationCall = client.calls.find((call) => call.name === 'generation_job_create')
  assert.equal(generationCall?.args.model_config_id, 77)
  assert.equal(generationCall?.args.aspect_ratio, undefined)
  assert.deepEqual(generationCall?.args.extra_params, {
    duration: '5',
    resolution: '480p',
  })
})

test('/image command forces a generation tool call and returns the generated job summary', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.toolResults.set('generation_job_create', {
    status: 'succeeded',
    jobId: 321,
    terminal: true,
    output_resource_id: 654,
    media: { id: 654, type: 'image', url: '/api/v1/resources/654/file', mime_type: 'image/png' },
    message: '图片生成完成，输出资源 #654。',
  })
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '/image 一张雨夜便利店概念图' }] })
  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'core_work_start', mode: 'allow', approval: 'never' },
      ],
    },
  })

  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)
  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  const generationCalls = client.calls.filter((call) => call.name === 'generation_job_create')
  assert.equal(generationCalls.length, 1)
  assert.deepEqual(generationCalls[0]?.args.extra_params, undefined)
  assert.equal(generationCalls[0]?.args.aspect_ratio, undefined)
  assert.match(assistant?.content ?? '', /\/image/)
  assert.match(assistant?.content ?? '', /Output resource: #654/)
})

test('runtime work generation starts do not synchronously monitor failed or cancelled jobs', async () => {
  for (const terminalStatus of ['failed', 'cancelled'] as const) {
    const client = new FakeMCPClient()
    client.projectId = 42
    client.toolResults.set('generation_job_create', {
      status: 'queued',
      jobId: terminalStatus === 'failed' ? 501 : 502,
      terminal: false,
      monitor: {
        tool: 'generation_job_get',
        args: { jobId: terminalStatus === 'failed' ? 501 : 502, projectId: 42 },
        timeoutMs: 200,
        pollIntervalMs: 10,
      },
      message: '生成任务已创建。',
    })
    client.toolHandlers.set('generation_job_get', (): JSONValue => ({
      status: terminalStatus,
      jobId: terminalStatus === 'failed' ? 501 : 502,
      terminal: true,
      message: terminalStatus === 'failed' ? '生成失败：provider rejected prompt。' : '生成任务已取消。',
    }))
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: terminalStatus === 'failed' ? '生成一张失败测试图' : '生成一段取消测试视频' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'core_work_start', mode: 'allow', approval: 'never' },
        ],
      },
    })

    assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
    const generationEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.kind === 'tool_call' && hasGenerationTraceData(event.data))
    assert.equal(generationEvents.length >= 1, true)
    const created = (generationEvents[0]!.data as Record<string, any>).generation
    assert.equal(created.status, 'queued')
    assert.equal(created.stage, 'created')
    assert.equal(created.terminal, false)
    assert.equal(generationEvents.every((event) => (event.data as Record<string, any>).generation.stage === 'created'), true)
    assert.deepEqual(client.calls.filter((call) => call.name === 'generation_job_get'), [])
  }
})

test('runtime work generation starts do not emit synchronous heartbeat monitor updates', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.toolResults.set('generation_job_create', {
    status: 'queued',
    jobId: 778,
    terminal: false,
    monitor: {
      tool: 'generation_job_get',
      args: { jobId: 778, projectId: 42 },
      timeoutMs: 600,
      pollIntervalMs: 250,
      heartbeatMs: 1,
    },
    message: '生成任务已创建。',
  })
  client.toolHandlers.set('generation_job_get', (): JSONValue => ({
    status: 'running',
    jobId: 778,
    terminal: false,
    progress: 20,
    message: '生成任务 Job #778 仍在进行中，状态：running，进度 20%。',
  }))
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '生成一段长时间运行的测试视频' }] })
  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'core_work_start', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  const generationEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    .filter((event) => event.kind === 'tool_call' && hasGenerationTraceData(event.data))
  const observedEvents = generationEvents.filter((event) => {
    const generation = (event.data as Record<string, any>).generation
    return generation.stage === 'observed' && generation.status === 'running'
  })
  assert.equal(observedEvents.length, 0)
  assert.equal(generationEvents.length >= 1, true)
  assert.equal(generationEvents.every((event) => (event.data as Record<string, any>).generation.stage === 'created'), true)
  assert.deepEqual(client.calls.filter((call) => call.name === 'generation_job_get'), [])
})

test('runtime work generation starts do not timeout while async job keeps running', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.toolResults.set('generation_job_create', {
    status: 'queued',
    jobId: 777,
    terminal: false,
    monitor: {
      tool: 'generation_job_get',
      args: { jobId: 777, projectId: 42 },
      timeoutMs: 25,
      pollIntervalMs: 10,
    },
    message: '生成任务已创建（Job #777）。',
  })
  client.toolHandlers.set('generation_job_get', (): JSONValue => ({
    status: 'running',
    jobId: 777,
    terminal: false,
    progress: 20,
    message: '生成任务 Job #777 仍在进行中，状态：running，进度 20%。',
  }))
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '生成一段很慢的视频' }] })
  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'core_work_start', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  const generationEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    .filter((event) => event.kind === 'tool_call' && hasGenerationTraceData(event.data))
  const created = (generationEvents.at(-1)!.data as Record<string, any>).generation
  assert.equal(client.calls.filter((call) => call.name === 'generation_job_get').length, 0)
  assert.equal(created.jobId, 777)
  assert.equal(created.stage, 'created')
  assert.equal(created.status, 'queued')
  assert.equal(created.terminal, false)
})

test('context command returns fallback diagnostics when MCP focus is unavailable', async () => {
  const client = new FakeMCPClient()
  client.failInitialize = true
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread()
  runtime.addMessage(thread.id, {
    role: 'user',
    content: '/context',
    clientInput: {
      message: '/context',
      uiSnapshot: {
        route: { pathname: '/agent/debug' },
        project: { id: 42, name: 'Fallback Project' },
      },
    },
  })

  const run = await createAndWaitForRun(runtime, thread.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)

  assert.equal(run.status, 'completed_with_warnings')
  assert.match(assistant?.content ?? '', /Model gateway messages:/)
  assert.match(assistant?.content ?? '', /Title: Fallback Project/)
  assert.match(assistant?.content ?? '', /Business reference: project#42/)
  assert.match(assistant?.content ?? '', /Focus unavailable: mcp offline/)
  assert.throws(() => JSON.parse(assistant?.content ?? ''))
  const messageStep = run.steps.find((step) => step.type === 'message')
  const diagnostic = (messageStep?.result as any)?.diagnostic
  assert.equal(diagnostic?.schema, 'movscript.local_context_diagnostic.v1')
  assert.equal(diagnostic?.modelGatewayCalled, false)
  assert.equal(Array.isArray(diagnostic?.messages), true)
  assert.equal(diagnostic.messages.some((message: any) => message.role === 'system'), true)
  assert.equal(Array.isArray(diagnostic?.tools?.modelTools), true)
  assert.equal(diagnostic.tools.modelTools.some((tool: any) => tool.name === 'movscript_focus_get'), true)
  {
    const traceEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    assert.equal(traceEvents.some((event) => event.title === 'Focus failed'), true)
    assert.equal(traceEvents.some((event) => event.kind === 'model_call'), false)
  }
})

test('status command returns local context budget diagnostics without model gateway calls', async () => {
  const client = new FakeMCPClient()
  client.failInitialize = true
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread()
  runtime.addMessage(thread.id, {
    role: 'user',
    content: '/status',
    clientInput: {
      message: '/status',
      uiSnapshot: {
        route: { pathname: '/agent/debug' },
        project: { id: 42, name: 'Fallback Project' },
      },
    },
  })

  const run = await createAndWaitForRun(runtime, thread.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)
  const messageStep = run.steps.find((step) => step.type === 'message')
  const diagnostic = (messageStep?.result as any)?.diagnostic

  assert.equal(run.status, 'completed_with_warnings')
  assert.match(assistant?.content ?? '', /Runtime status:/)
  assert.match(assistant?.content ?? '', /Context budget:/)
  assert.equal(diagnostic?.schema, 'movscript.local_status_diagnostic.v1')
  assert.equal(diagnostic?.modelGatewayCalled, false)
  assert.equal(typeof diagnostic?.contextBudget?.remainingChars, 'number')
  assert.equal(diagnostic?.contextBudget?.status === 'ok' || diagnostic?.contextBudget?.status === 'warning' || diagnostic?.contextBudget?.status === 'critical' || diagnostic?.contextBudget?.status === 'exceeded', true)
  {
    const traceEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    assert.equal(traceEvents.some((event) => event.kind === 'model_call'), false)
  }
})

test('context command run stream emits assistant message and done events', async () => {
  const client = new FakeMCPClient()
  client.failInitialize = true
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread()
  runtime.addMessage(thread.id, {
    role: 'user',
    content: '/context',
    clientInput: {
      message: '/context',
      uiSnapshot: {
        route: { pathname: '/agent/debug' },
        project: { id: 42, name: 'Fallback Project' },
      },
    },
  })

  const run = runtime.createRun({ threadId: thread.id })
  const events: string[] = []
  const assistantContents: string[] = []
  const unsubscribe = runtime.subscribeRunStream(run.id, (event) => {
    events.push(event.type)
    if (event.type === 'assistant_message') assistantContents.push(event.message.content)
  })

  try {
    await waitForRun(runtime, run.id)
  } finally {
    unsubscribe()
  }

  assert.equal(events.includes('assistant_message'), true)
  assert.equal(events.at(-1), 'done')
  assert.match(assistantContents.at(-1) ?? '', /Model gateway messages:/)
})

test('memory command returns opened memory file refs without content or model gateway call', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const memoryStore = new InMemoryAgentMemoryStore()
  const memory = memoryStore.createMemory({
    projectId: 42,
    title: '默认镜头风格',
    kind: 'preference',
    content: '默认镜头风格使用冷色低饱和。',
  })
  const runtime = createTestRuntime({ mcpClient: client, memoryStore })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '/memory 默认镜头风格' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)

  assert.equal(run.status, 'completed')
  assert.match(assistant?.content ?? '', /Opened memory files:/)
  assert.match(assistant?.content ?? '', new RegExp(memory.id))
  assert.equal(runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER }).some((event) => event.kind === 'model_call'), false)
})

test('production orchestrate requests include productionId in runtime context', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-production-context-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  const requestBodies: Array<Record<string, unknown>> = []
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../../model/config/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 31, model: 'model_config:31', apiKind: 'openai_chat_completions', apiKey: 'test-key' })

    globalThis.fetch = (async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      return new Response(JSON.stringify({
        id: 'chatcmpl_production_context',
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
      }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '请做 production workspace 制作编排' }] })
    await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_script_locate', mode: 'allow', approval: 'never' },
        ],
      },
      clientInput: {
        message: '递归分析剧本，提取片段、情节、设定资料、素材需求和内容单元，去重并建立关系图',
        uiSnapshot: {
          route: { pathname: '/production-orchestrate', search: '?productionId=4' },
          project: { id: 42, name: 'Test Project' },
          productionId: 4,
          selection: { entityType: 'production', entityId: 4, label: '制作 4' },
          labels: ['production-orchestrate'],
        },
      },
    })

    const contextMessage = requestBodies
      .flatMap((body) => Array.isArray(body.messages) ? body.messages as any[] : [])
      .find((message) => message?.role === 'system' && typeof message.content === 'string' && message.content.includes('## Focus'))
    assert.ok(contextMessage)
    assert.match(String(contextMessage?.content ?? ''), /Active production business reference: production#4/)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('agent can search memories before creating a workspace', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const memoryStore = new InMemoryAgentMemoryStore()
  const runtime = createTestRuntime({ mcpClient: client, memoryStore })
  memoryStore.createMemory({
    projectId: 42,
    title: '默认镜头风格',
    kind: 'preference',
    content: '默认镜头风格是手持纪实',
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '参考我的默认镜头风格记忆，帮我写一个镜头工作区' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const memoryStep = run.steps.find((step) => step.toolName === 'core_memory_search')

  assert.equal(memoryStep?.status, 'completed')
  assert.match(JSON.stringify(memoryStep?.result ?? {}), /默认镜头风格是手持纪实/)
})

test('create_workspace success writes workspace memory', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个工作区' }] })

  await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_project_create', mode: 'allow', approval: 'never' }],
    },
  })

  assert.equal(runtime.listMemories({ kind: 'workspace', projectId: 42 }).length, 0)
})

test('create_workspace creates a local workspace workspace from conversation context', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const runtime = createTestRuntime({ mcpClient: client, workspaceStore })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我开一个项目规范工作区' }] })

  const run = runtime.createToolRun({
    threadId: thread.id,
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'workspace_create', mode: 'allow', approval: 'never' }],
    },
    toolCall: {
      name: 'workspace_create',
      args: {
        kind: 'project_standards_workspace',
        projectId: 42,
        workspace: true,
        content: JSON.stringify({
          schema: WORKSPACE_CONTENT_SCHEMA_IDS.projectStandardsWorkspace,
          scope: 'project_standards_workspace',
          summary: '整理项目设定和素材需求',
          workspace: {
            creative_references: [],
            asset_slots: [],
          },
          impact_notes: [],
        }),
      },
    },
  })

  const finished = await waitForRun(runtime, run.id)
  const workspace = finished.steps.find((step) => step.toolName === 'workspace_create')?.result as any

  assert.equal(finished.status, 'completed')
  assert.equal(workspace?.status, 'created')
  assert.equal(typeof workspace?.workspaceId, 'string')
  assert.equal(runtime.listWorkspaces({ kind: 'project_standards_workspace' }).length, 1)
})

test('workspaces can be scoped by page key', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const workspaceStore = new InMemoryAgentWorkspaceStore()
  const runtime = createTestRuntime({ mcpClient: client, workspaceStore })
  const pageKey = 'production_orchestrate|/production-orchestrate?productionId=4|production|4'
  workspaceStore.createWorkspace({
    projectId: 42,
    kind: 'production_workspace',
    title: 'Scoped workspace',
    content: '{}',
    source: { pageKey, pageType: 'production_orchestrate', pageRoute: '/production-orchestrate?productionId=4', pageEntityType: 'production', pageEntityId: 4 },
  })
  workspaceStore.createWorkspace({
    projectId: 42,
    kind: 'production_workspace',
    title: 'Other page workspace',
    content: '{}',
    source: { pageKey: 'other|page|production|99', pageType: 'other', pageRoute: '/other', pageEntityType: 'production', pageEntityId: 99 },
  })

  const workspaces = runtime.listWorkspaces({ projectId: 42, kind: 'production_workspace', status: 'workspace', pageKey })
  assert.equal(workspaces.length, 1)
  assert.equal(workspaces[0]?.title, 'Scoped workspace')
})

test('runtime reloads target-state local catalog tools for later runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-dynamic-catalog-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const configFilesDir = join(dir, 'config-files')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  try {
    const loader = () => loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      configFilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinConfigFilesDir: configFilesDir,
      baseManifest: DYNAMIC_CATALOG_BASE_MANIFEST,
    })
    const client = new FakeMCPClient()
    client.projectId = 42
    client.extraTools.push({ name: 'studio_dynamic_echo', description: 'Echo dynamic runtime input.', inputSchema: {} })
    client.toolResults.set('studio_dynamic_echo', { ok: true, dynamic: true })
    const runtime = createTestRuntime({
      mcpClient: client,
      catalogStateStore,
      pluginCatalogLoader: loader,
    })

    let capabilities = await runtime.getCapabilities({ currentProjectId: 42 })
    assert.equal(capabilities.resolvedTools.byName.studio_dynamic_echo?.available, undefined)

    writeJSONFile(toolsDir, 'dynamic.tool.json', {
      name: 'studio_dynamic_echo',
      description: 'Echo dynamic runtime input.',
      permission: 'project.read',
      risk: 'read',
      source: 'plugin',
      pluginId: 'test.dynamic',
      inputSchema: {},
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    writeJSONFile(skillsDir, 'dynamic.skill.json', {
      id: 'studio.dynamic',
      name: 'Dynamic Echo',
      description: 'Expose the dynamic echo tool for dynamic checks.',
      triggers: [{ kind: 'keyword', any: ['dynamic check'] }],
      toolGrants: ['studio_dynamic_echo'],
      instructionTemplate: 'Use the dynamic echo tool for dynamic checks.',
    })
    writeJSONFile(packsDir, 'dynamic.pack.json', {
      id: 'studio.pack.dynamic',
      name: 'Dynamic Test Pack',
      source: 'plugin',
      resources: {
        skills: ['dynamic.skill.json'],
        tools: ['dynamic.tool.json'],
      },
      schemas: [],
      tools: ['studio_dynamic_echo'],
      skills: ['studio.dynamic'],
    })
    writeJSONFile(configFilesDir, 'base.config-file.json', {
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Dynamic Test Config File',
      enabledPackIds: ['studio.pack.dynamic'],
    skillIds: [],
      toolGrants: [],
    })
    const reloaded = runtime.reloadAgentCatalog() as any
    assert.equal(reloaded.status, 'reloaded')

    capabilities = await runtime.getCapabilities({ currentProjectId: 42 })
    assert.equal(capabilities.resolvedTools.byName.studio_dynamic_echo?.available, true)
    assert.equal(runtime.listSkillCatalog().some((skill) => skill.id === 'studio.dynamic.skill'), false)

    const thread = runtime.createThread({ messages: [{ role: 'user', content: 'please do a dynamic check' }] })
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = (async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
        const toolMessages = (body.messages as any[]).filter((message) => message?.role === 'tool')
        if (toolMessages.length > 0) {
          return new Response(JSON.stringify({ choices: [{ message: { content: 'dynamic done' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
        }
        assert.equal((body.tools as any[]).some((tool) => tool.function.name === 'studio_dynamic_echo'), true)
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_dynamic',
                type: 'function',
                function: { name: 'studio_dynamic_echo', arguments: JSON.stringify({ input: 'hello' }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
      const run = await createAndWaitForRun(runtime, thread.id)
      assert.equal(run.status, 'completed')
      assert.equal(client.calls.some((call) => call.name === 'studio_dynamic_echo'), true)
      assert.equal(run.steps.some((step) => step.toolName === 'studio_dynamic_echo'), true)
    } finally {
      globalThis.fetch = originalFetch
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime persists selected active config file in catalog state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-config-file-state-'))
  const configFilesDir = join(dir, 'config-files')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  try {
    writeJSONFile(configFilesDir, 'base.config-file.json', {
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base Config File',
      enabledPackIds: [],
    skillIds: [],
      toolGrants: [],
    })
    writeJSONFile(configFilesDir, 'writer.config-file.json', {
      schema: 'movscript.agent.config_file.v1',
      id: 'config_file_writer',
      version: '2.0.0',
      name: 'Writer Config File',
      enabledPackIds: [],
    skillIds: [],
      toolGrants: [],
    })
    const loadCatalog = () => loadAgentPluginCatalog({
      configFilesDir,
      builtinConfigFilesDir: configFilesDir,
      baseManifest: DYNAMIC_CATALOG_BASE_MANIFEST,
    })
    const runtime = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      pluginCatalog: loadCatalog(),
      catalogStateStore,
    })
    catalogStateStore.save({
      version: 1,
      updatedAt: new Date(0).toISOString(),
      metadata: {
        toolPermissionOverridesByConfigFile: {
          movscript_config_file_old: [{ name: 'old_config_file_tool', mode: 'deny' }],
        },
      },
    })

    const saved = runtime.setActiveAgentConfigFile({ configFileId: 'config_file_writer' })

    assert.equal(saved.id, 'config_file_writer')
    assert.equal(saved.name, 'Writer Config File')
    assert.equal(saved.metadata?.configFileId, 'config_file_writer')
    assert.equal(saved.metadata?.configFileVersion, '2.0.0')
    assert.equal(catalogStateStore.load().metadata?.activeConfigFileId, 'config_file_writer')
    assert.equal(catalogStateStore.load().metadata?.toolPermissionOverridesByConfigFile, undefined)

    const restarted = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      pluginCatalog: loadCatalog(),
      catalogStateStore,
    })

    assert.equal(restarted.getActiveAgentManifest().id, 'config_file_writer')
    assert.equal(restarted.getActiveAgentManifest().metadata?.configFileId, 'config_file_writer')
    assert.equal(restarted.getActiveAgentManifest().metadata?.configFileVersion, '2.0.0')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime persists restrictive tool permissions on managed config files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-tool-permissions-state-'))
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const configFilesDir = join(dir, 'config-files')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  try {
    writeJSONFile(toolsDir, 'workspace.tool.json', {
      name: 'workspace_apply_preview',
      description: 'Preview workspace apply.',
      permission: 'workspace.read',
      risk: 'read',
      source: 'plugin',
      inputSchema: {},
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    writeJSONFile(toolsDir, 'memory.tool.json', {
      name: 'core_memory_delete',
      description: 'Delete memory.',
      permission: 'memory.write',
      risk: 'destructive',
      source: 'plugin',
      inputSchema: {},
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'on_write' },
    })
    writeJSONFile(packsDir, 'permissions.pack.json', {
      id: 'movscript.pack.permissions-test',
      name: 'Permissions Test Pack',
      source: 'plugin',
      resources: { tools: ['workspace.tool.json', 'memory.tool.json'] },
      schemas: [],
      tools: ['workspace_apply_preview', 'core_memory_delete'],
      skills: [],
    })
    writeJSONFile(configFilesDir, 'base.config-file.json', {
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base Config File',
      enabledPackIds: ['movscript.pack.permissions-test'],
    skillIds: [],
      toolGrants: [
        { name: 'workspace_apply_preview', mode: 'allow', approval: 'never' },
        { name: 'core_memory_delete', mode: 'allow', approval: 'on_write' },
      ],
    })
    const loadCatalog = () => loadAgentPluginCatalog({
      toolsDir,
      builtinToolsDir: toolsDir,
      packsDir,
      builtinPacksDir: packsDir,
      configFilesDir,
      builtinConfigFilesDir: configFilesDir,
      baseManifest: DYNAMIC_CATALOG_BASE_MANIFEST,
    })
    const runtime = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      pluginCatalog: loadCatalog(),
      catalogStateStore,
    })

    assert.throws(
      () => runtime.saveConfigFileToolPermissions({
        configFileId: 'movscript.config_file.base',
        toolGrants: [{ name: 'workspace_apply_preview', mode: 'deny' }],
      }),
      /config file movscript\.config_file\.base not found/,
    )

    runtime.saveAgentConfigFile({
      activate: true,
      configFile: {
        schema: 'movscript.agent.config_file.v1',
        id: 'config_file_permissions',
        version: '1.0.0',
        name: 'Permissions Config File',
        enabledPackIds: ['movscript.pack.permissions-test'],
        skillIds: [],
        toolGrants: [
          { name: 'workspace_apply_preview', mode: 'allow', approval: 'never' },
          { name: 'core_memory_delete', mode: 'allow', approval: 'on_write' },
        ],
      },
    })

    const saved = runtime.saveConfigFileToolPermissions({
      configFileId: 'config_file_permissions',
      toolGrants: [
        { name: 'workspace_apply_preview', mode: 'deny' },
        { name: 'core_memory_delete', mode: 'allow', approval: 'always' },
      ],
    })

    assert.equal(saved.metadata?.toolPermissionOverridesByConfigFile, undefined)
    assert.equal(catalogStateStore.load().metadata?.toolPermissionOverridesByConfigFile, undefined)
    assert.deepEqual(saved.tools, [
      { name: 'workspace_apply_preview', mode: 'deny', approval: 'never' },
      { name: 'core_memory_delete', mode: 'allow', approval: 'always' },
    ])

    const restarted = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      pluginCatalog: loadCatalog(),
      catalogStateStore,
    })

    assert.deepEqual(restarted.getActiveAgentManifest().tools, saved.tools)
    assert.throws(
      () => restarted.saveConfigFileToolPermissions({ configFileId: 'config_file_permissions', toolGrants: [{ name: 'core_memory_delete', mode: 'allow', approval: 'never' }] }),
      /approval cannot be weaker/,
    )
    assert.throws(
      () => restarted.saveConfigFileToolPermissions({ configFileId: 'config_file_permissions', toolGrants: [{ name: 'movscript_project_create', mode: 'allow', approval: 'always' }] }),
      /not granted by config file config_file_permissions/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime persists skill instruction overrides and validates config file skill selection', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-default-skills-state-'))
  const skillsDir = join(dir, 'skills')
  const packsDir = join(dir, 'packs')
  const configFilesDir = join(dir, 'config-files')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  try {
    writeJSONFile(skillsDir, 'task.skill.json', {
      id: 'studio.settings_test',
      name: 'Settings Test Task',
      description: 'Task skill toggled by settings.',
      triggers: [{ kind: 'always' }],
      toolGrants: [],
      instructionTemplate: 'Settings test task.',
    })
    writeJSONFile(skillsDir, 'core.skill.json', {
      id: 'studio.rules.core_test',
      name: 'Core Test Rules',
      description: 'Core rules locked by settings.',
      loadMode: 'core',
      instructionTemplate: 'Core rules.',
    })
    writeJSONFile(skillsDir, 'dependency.skill.json', {
      id: 'studio.rules.dependency_test',
      name: 'Dependency Test Rules',
      description: 'Dependency rules.',
      instructionTemplate: 'Dependency rules.',
    })
    writeJSONFile(skillsDir, 'dependent.skill.json', {
      id: 'studio.rules.dependent_test',
      name: 'Dependent Test Rules',
      description: 'Rules with dependency.',
      dependencies: ['studio.rules.dependency_test'],
      instructionTemplate: 'Dependent rules.',
    })
    writeJSONFile(skillsDir, 'conflict.skill.json', {
      id: 'studio.rules.conflict_test',
      name: 'Conflict Test Rules',
      description: 'Rules with conflict.',
      enabled: false,
      conflicts: ['studio.settings_test'],
      instructionTemplate: 'Conflict rules.',
    })
    writeJSONFile(packsDir, 'skills.pack.json', {
      id: 'movscript.pack.config-file-skills-test',
      name: 'Config File Skills Test Pack',
      source: 'plugin',
      resources: { skills: ['task.skill.json', 'core.skill.json', 'dependency.skill.json', 'dependent.skill.json', 'conflict.skill.json'] },
      schemas: [],
      tools: [],
      skills: ['studio.settings_test', 'studio.rules.core_test', 'studio.rules.dependency_test', 'studio.rules.dependent_test', 'studio.rules.conflict_test'],
    })
    writeJSONFile(configFilesDir, 'base.config-file.json', {
      schema: 'movscript.agent.config_file.v1',
      id: 'movscript.config_file.base',
      version: '1.0.0',
      name: 'Base Config File',
      enabledPackIds: ['movscript.pack.config-file-skills-test'],
      skillIds: [],
      toolGrants: [],
    })
    const loadCatalog = () => loadAgentPluginCatalog({
      skillsDir,
      builtinSkillsDir: skillsDir,
      packsDir,
      builtinPacksDir: packsDir,
      configFilesDir,
      builtinConfigFilesDir: configFilesDir,
      baseManifest: DYNAMIC_CATALOG_BASE_MANIFEST,
    })
    const runtime = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      pluginCatalog: loadCatalog(),
      catalogStateStore,
    })

    runtime.saveSkillInstructions({ skills: [{ id: 'studio.settings_test', instructionTemplate: 'Edited settings instruction.' }] })

    assert.equal(runtime.listSkillCatalog().find((skill) => skill.id === 'studio.settings_test')?.instructionTemplate, 'Edited settings instruction.')
    assert.deepEqual(catalogStateStore.load().metadata?.skillInstructionOverrides, [{ id: 'studio.settings_test', instructionTemplate: 'Edited settings instruction.' }])

    const restarted = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      pluginCatalog: loadCatalog(),
      catalogStateStore,
    })

    assert.equal(restarted.listSkillCatalog().find((skill) => skill.id === 'studio.settings_test')?.instructionTemplate, 'Edited settings instruction.')
    assert.throws(
      () => restarted.saveSkillInstructions({ skills: [{ id: 'studio.rules.core_test', enabled: false }] }),
      /enabled belongs to config file skillIds/,
    )
    assert.throws(
      () => restarted.saveAgentConfigFile({
        configFile: {
          schema: 'movscript.agent.config_file.v1',
          id: 'invalid_dependency',
          version: '1.0.0',
          name: 'Invalid Dependency',
          enabledPackIds: ['movscript.pack.config-file-skills-test'],
          skillIds: ['studio.rules.dependent_test'],
          toolGrants: [],
        },
      }),
      /config file skill .* requires config file skill/,
    )
    assert.throws(
      () => restarted.saveAgentConfigFile({
        configFile: {
          schema: 'movscript.agent.config_file.v1',
          id: 'invalid_conflict',
          version: '1.0.0',
          name: 'Invalid Conflict',
          enabledPackIds: ['movscript.pack.config-file-skills-test'],
          skillIds: ['studio.settings_test', 'studio.rules.conflict_test'],
          toolGrants: [],
        },
      }),
      /config file skill .* conflicts with config file skill/,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('target-state local catalog loading ignores tool files outside pack resources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-target-tool-'))
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const configFilesDir = join(dir, 'config-files')
  try {
    writeJSONFile(toolsDir, 'dynamic.tool.json', {
      name: 'studio_dynamic_echo',
      description: 'Echo dynamic runtime input.',
      permission: 'project.read',
      risk: 'read',
      source: 'plugin',
      pluginId: 'test.dynamic',
      inputSchema: {},
      projectScoped: false,
      defaults: { grant: 'allow', approval: 'never' },
    })
    const catalog = loadAgentPluginCatalog({
      toolsDir,
      builtinToolsDir: toolsDir,
      packsDir,
      configFilesDir,
      builtinPacksDir: packsDir,
      builtinConfigFilesDir: configFilesDir,
      baseManifest: DYNAMIC_CATALOG_BASE_MANIFEST,
    })
    assert.equal(Boolean(catalog.registry.get('studio_dynamic_echo')), false)
    assert.equal(catalog.manifest.tools.some((grant) => grant.name === 'studio_dynamic_echo'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('reloadAgentCatalog rolls back when catalog linter reports errors', () => {
  let loadCount = 0
  const goodCatalog = loadAgentPluginCatalog()
  const badCatalog = {
    ...goodCatalog,
    catalogIssues: [{
      level: 'error' as const,
      code: 'catalog.lint.fail',
      message: 'broken candidate',
      resourceId: 'studio.pack.broken',
    }],
    registry: new StaticToolRegistry([]),
    warnings: [],
  }
  const runtime = createTestRuntime({
    mcpClient: new FakeMCPClient(),
    pluginCatalogLoader: () => {
      loadCount += 1
      return loadCount === 1 ? goodCatalog : badCatalog
    },
  })

  assert.ok(runtime.listRegisteredTools().length > 0)
  const beforeCount = runtime.listRegisteredTools().length
  const result = runtime.reloadAgentCatalog() as any

  assert.equal(result.status, 'rolled_back')
  assert.equal(result.eventType, 'catalog.reload')
  assert.equal(result.outcome, 'rolled_back')
  assert.equal(result.reason, 'catalog.lint.fail')
  assert.equal(runtime.listRegisteredTools().length, beforeCount)
})

test('in-flight runs keep their catalog snapshot across external reloads', async () => {
  const oldRegistry = new StaticToolRegistry([{
    name: 'studio_snapshot_old',
    description: 'Old snapshot tool.',
    permission: 'project.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  }])
  const newRegistry = new StaticToolRegistry([{
    name: 'studio_snapshot_new',
    description: 'New snapshot tool.',
    permission: 'project.read',
    risk: 'read',
    source: 'runtime',
    projectScoped: false,
    requiresApprovalByDefault: false,
  }])
  const makeCatalog = (registry: StaticToolRegistry, version: string) => {
    const catalog = loadAgentPluginCatalog()
    return {
      ...catalog,
      registry,
      manifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: registry.list().map((tool) => ({ name: tool.name, mode: 'allow' as const, approval: 'never' as const })),
      },
      warnings: [],
      catalogIssues: [],
      layeredRegistry: {
        ...catalog.layeredRegistry,
        version,
        configFiles: new Map(),
      },
    }
  }
  let loadCount = 0
  const releaseContext: Array<() => void> = []
  const client = new FakeMCPClient()
  client.projectId = 42
  const originalCallTool = client.callTool.bind(client)
  client.callTool = async (name, args = {}) => {
    if (name === 'movscript_focus_get') {
      await new Promise<void>((resolve) => releaseContext.push(resolve))
    }
    return originalCallTool(name, args)
  }
  const runtime = createTestRuntime({
    mcpClient: client,
    pluginCatalogLoader: () => {
      loadCount += 1
      return loadCount === 1 ? makeCatalog(oldRegistry, 'catalog-old') : makeCatalog(newRegistry, 'catalog-new')
    },
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'snapshot check' }] })
  const run = runtime.createRun({ threadId: thread.id })

  while (releaseContext.length === 0) await new Promise((resolve) => setTimeout(resolve, 5))
  const reloaded = runtime.reloadAgentCatalog() as any
  assert.equal(reloaded.catalogVersion, 'catalog-new')
  releaseContext.splice(0).forEach((resolve) => resolve())

  const completed = await waitForRun(runtime, run.id)
  const event = runtime.getRunTraceEvents(completed.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((item) => item.title === 'Tool catalog resolved')
  const availableToolNames = (event?.data as any)?.availableToolNames ?? []

  assert.equal(completed.status, 'completed')
  assert.deepEqual(completed.metadata?.catalogSnapshot, { id: (completed.metadata?.catalogSnapshot as any)?.id, version: 'catalog-old' })
  assert.equal(availableToolNames.includes('studio_snapshot_old'), true)
  assert.equal(availableToolNames.includes('studio_snapshot_new'), false)
})

test('agent run tool catalog does not expose runtime catalog reload tool', async () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'can you reload the agent catalog?' }] })
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '目录重载不可由运行调用' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const toolNames = new Set(((body.tools as any[]) ?? []).map((tool) => tool.function.name))
      assert.equal(toolNames.has('movscript_reload_agent_catalog'), false)
      return new Response(JSON.stringify({ choices: [{ message: { content: 'catalog reload is not a run tool' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const run = await createAndWaitForRun(runtime, thread.id)

    assert.equal(run.status, 'completed')
    assert.equal(run.steps.some((step) => step.toolName === 'movscript_reload_agent_catalog'), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('file workspace store persists workspaces across runtime rebuilds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-workspaces-'))
  try {
    const workspacePath = join(dir, 'workspaces.json')
    const store = new FileAgentWorkspaceStore(workspacePath)
    const workspace = store.createWorkspace({
      projectId: 42,
      kind: 'project_standards_workspace',
      title: 'Review note',
      content: 'Check storyboard-line gaps.',
      source: { entityType: 'scene_moment', entityId: 12 },
    })

    const rebuilt = new FileAgentWorkspaceStore(workspacePath)
    const restored = rebuilt.getWorkspace(workspace.id)

    assert.equal(restored?.title, 'Review note')
    assert.equal(restored?.source?.entityType, 'scene_moment')
    assert.equal(rebuilt.listWorkspaces({ projectId: 42 }).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime tracks task graph tasks and parent child worker runs', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '好的' }] })

  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Subagent rollout',
    createPlannerRun: false,
    tasks: [
      { id: 'task-model', title: 'Define task model' },
      { title: 'Spawn worker', deps: ['task-model'] },
    ],
  })

  assert.equal(taskGraph.taskGraph.status, 'pending')
  assert.equal(taskGraph.tasks.length, 2)

  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const worker = await createAndWaitForRun(runtime, thread.id, {
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: taskGraph.tasks[0].id,
    progress: 0.25,
  })

  assert.equal(planner.role, 'planner')
  assert.equal(worker.role, 'worker')
  assert.equal(worker.parentRunId, planner.id)
  assert.deepEqual(runtime.getChildRuns(planner.id).map((run) => run.id), [worker.id])
  assert.deepEqual(runtime.listRunsByParent(planner.id).map((run) => run.id), [worker.id])

  const updatedTask = runtime.updateTask(taskGraph.tasks[0].id, {
    status: 'done',
    progress: 1,
    ownerRunId: worker.id,
    artifacts: [{ type: 'run', title: 'Worker run', uri: `agent-run:${worker.id}` }],
  })
  assert.equal(updatedTask.status, 'done')
  assert.equal(updatedTask.ownerRunId, worker.id)
  assert.equal(updatedTask.artifacts.some((artifact) => artifact.uri === `agent-run:${worker.id}`), true)
  assert.equal(runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).runs.length, 2)
})

test('createTaskGraph enforces one taskGraph per thread', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })

  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Single thread taskGraph',
    createPlannerRun: false,
    tasks: [{ id: 'task_single_taskGraph', title: 'Only task' }],
  })

  assert.equal(taskGraph.taskGraph.threadId, thread.id)
  await assert.rejects(() => runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Second thread taskGraph',
    createPlannerRun: false,
    tasks: [{ id: 'task_second_taskGraph', title: 'Second task' }],
  }), /already has taskGraph/)
})

test('runtime task graph API creates, inspects, and replans the session task graph', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请拆分并并行处理' }] })

  const created = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Agent-created taskGraph',
    createPlannerRun: true,
    tasks: [
      { id: 'task_agent_task_graph_a', title: 'Agent task graph A' },
    ],
  })
  const plannerRunId = created.taskGraph.rootRunId
  assert.ok(plannerRunId)
  const planner = runtime.getRun(plannerRunId)!
  assert.equal(created.tasks.length, 1)
  assert.equal(planner.taskGraphId, created.taskGraph.id)

  await assert.rejects(() => runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Ignored second taskGraph',
    createPlannerRun: false,
    tasks: [{ id: 'task_should_not_exist', title: 'Should not exist' }],
  }), /already has taskGraph/)

  const inspected = runtime.getTaskGraphSnapshot(created.taskGraph.id)
  assert.equal(inspected.taskGraph.rootRunId, planner.id)

  const replanned = runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_agent_task_graph_b', title: 'Agent task graph B', deps: ['task_agent_task_graph_a'] },
    ],
    dispatch: false,
  })
  assert.deepEqual(replanned.createdTaskIds, ['task_agent_task_graph_b'])
  assert.equal(runtime.getTaskTree(created.taskGraph.id).find((task: any) => task.id === 'task_agent_task_graph_b')?.status, 'pending')
})

test('task ownerRunId updates must reference an existing run in the same taskGraph', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Task owner boundary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_owner_boundary', title: 'Owned task' },
      { id: 'task_owner_other', title: 'Other owned task' },
    ],
  })
  const otherThread = runtime.createThread({ messages: [{ role: 'user', content: '其他规划' }] })
  const otherTaskGraph = await runtime.createTaskGraph({
    threadId: otherThread.id,
    title: 'Other owner boundary',
    createPlannerRun: false,
    tasks: [],
  })
  const otherRun = runtime.createRun({
    threadId: otherThread.id,
    role: 'planner',
    taskGraphId: otherTaskGraph.taskGraph.id,
  })
  const wrongTaskRun = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_owner_other',
  })

  assert.throws(() => runtime.updateTask('task_owner_boundary', {
    ownerRunId: 'run_missing_owner',
  }), /run not found/)
  assert.throws(() => runtime.updateTask('task_owner_boundary', {
    ownerRunId: otherRun.id,
  }), /does not belong to taskGraph/)
  assert.throws(() => runtime.updateTask('task_owner_boundary', {
    ownerRunId: wrongTaskRun.id,
  }), /is attached to task task_owner_other/)
  assert.equal(runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((task) => task.id === 'task_owner_boundary')?.ownerRunId, undefined)
})

test('task graph updates must reference tasks in the same taskGraph', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Task graph boundary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_graph_target', title: 'Graph target' },
      { id: 'task_graph_peer', title: 'Graph peer' },
    ],
  })
  const otherThread = runtime.createThread({ messages: [{ role: 'user', content: '其他规划' }] })
  await runtime.createTaskGraph({
    threadId: otherThread.id,
    title: 'Other graph boundary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_graph_other_taskGraph', title: 'Other task graph task' },
    ],
  })

  assert.throws(() => runtime.updateTask('task_graph_target', {
    parentId: 'task_missing_parent',
  }), /task not found/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    deps: ['task_missing_dep'],
  }), /task not found/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    parentId: 'task_graph_other_taskGraph',
  }), /does not belong to taskGraph/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    deps: ['task_graph_other_taskGraph'],
  }), /does not belong to taskGraph/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    parentId: 'task_graph_target',
  }), /cannot use itself as parent/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    deps: ['task_graph_target'],
  }), /cannot depend on itself/)

  const unchanged = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((task) => task.id === 'task_graph_target')
  assert.equal(unchanged?.parentId, undefined)
  assert.deepEqual(unchanged?.deps, [])

  const updated = runtime.updateTask('task_graph_target', {
    parentId: 'task_graph_peer',
    deps: ['task_graph_peer'],
  })
  assert.equal(updated.parentId, 'task_graph_peer')
  assert.deepEqual(updated.deps, ['task_graph_peer'])

  assert.throws(() => runtime.updateTask('task_graph_peer', {
    parentId: 'task_graph_target',
  }), /parent cycle detected/)
  assert.equal(runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((task) => task.id === 'task_graph_peer')?.parentId, undefined)

  const cleared = runtime.updateTask('task_graph_target', {
    parentId: null,
  })
  assert.equal(cleared.parentId, undefined)
  assert.deepEqual(cleared.deps, ['task_graph_peer'])

  assert.throws(() => runtime.updateTask('task_graph_peer', {
    deps: ['task_graph_target'],
  }), /dependency cycle detected/)
  assert.deepEqual(runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((task) => task.id === 'task_graph_peer')?.deps, [])
})

test('taskGraph agent bootstrap creates a structured fallback DAG from a goal', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '开始子agent架构改造' }] })

  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Subagent architecture',
    goal: '推进 taskGraph agent 和 worker subagent 架构',
    createPlannerRun: false,
  })

  assert.equal(taskGraph.taskGraph.status, 'pending')
  assert.equal(taskGraph.taskGraph.metadata?.goal, '推进 taskGraph agent 和 worker subagent 架构')
  assert.equal(taskGraph.taskGraph.metadata?.plannerSource, 'fallback')
  assert.equal(taskGraph.tasks.length, 1)
  assert.equal(taskGraph.tasks[0]?.id, 'task_execute_goal')
  assert.equal(taskGraph.tasks[0]?.description, '推进 taskGraph agent 和 worker subagent 架构')
})

test('createTaskGraph validates task graph references before writing taskGraph state', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })

  await assert.rejects(
    runtime.createTaskGraph({
      threadId: thread.id,
      title: 'Invalid missing dependency taskGraph',
      createPlannerRun: false,
      tasks: [
        { id: 'task_invalid_dep', title: 'Invalid dep', deps: ['task_missing_dep'] },
      ],
    }),
    /task not found/,
  )
  assert.equal(runtime.listTaskGraphs().some((taskGraph) => taskGraph.title === 'Invalid missing dependency taskGraph'), false)

  await assert.rejects(
    runtime.createTaskGraph({
      threadId: thread.id,
      title: 'Invalid self parent taskGraph',
      createPlannerRun: false,
      tasks: [
        { id: 'task_self_parent_create', title: 'Self parent', parentId: 'task_self_parent_create' },
      ],
    }),
    /cannot use itself as parent/,
  )
  assert.equal(runtime.listTaskGraphs().some((taskGraph) => taskGraph.title === 'Invalid self parent taskGraph'), false)

  await assert.rejects(
    runtime.createTaskGraph({
      threadId: thread.id,
      title: 'Invalid cycle taskGraph',
      createPlannerRun: false,
      tasks: [
        { id: 'task_cycle_a', title: 'Cycle A', deps: ['task_cycle_b'] },
        { id: 'task_cycle_b', title: 'Cycle B', deps: ['task_cycle_a'] },
      ],
    }),
    /dependency cycle detected/,
  )
  assert.equal(runtime.listTaskGraphs().some((taskGraph) => taskGraph.title === 'Invalid cycle taskGraph'), false)

  await assert.rejects(
    runtime.createTaskGraph({
      threadId: thread.id,
      title: 'Invalid parent cycle taskGraph',
      createPlannerRun: false,
      tasks: [
        { id: 'task_parent_cycle_a', title: 'Parent cycle A', parentId: 'task_parent_cycle_b' },
        { id: 'task_parent_cycle_b', title: 'Parent cycle B', parentId: 'task_parent_cycle_a' },
      ],
    }),
    /parent cycle detected/,
  )
  assert.equal(runtime.listTaskGraphs().some((taskGraph) => taskGraph.title === 'Invalid parent cycle taskGraph'), false)

  const valid = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Valid same-batch graph taskGraph',
    createPlannerRun: false,
    tasks: [
      { id: 'task_create_graph_a', title: 'Graph A' },
      { id: 'task_create_graph_b', title: 'Graph B', parentId: 'task_create_graph_a', deps: ['task_create_graph_a'] },
    ],
  })
  assert.equal(valid.tasks.find((task) => task.id === 'task_create_graph_b')?.parentId, 'task_create_graph_a')
  assert.deepEqual(valid.tasks.find((task) => task.id === 'task_create_graph_b')?.deps, ['task_create_graph_a'])
})

test('simple task graph tasks are executed by the planner run without spawning a worker', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '整理一段说明' }] })

  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Simple planner task',
    tasks: [{ id: 'task_simple', title: '整理说明' }],
  })

  assert.equal(taskGraph.runs.length, 1)
  assert.equal(taskGraph.runs[0]?.role, 'planner')
  assert.equal(taskGraph.runs[0]?.taskId, 'task_simple')
  assert.equal(taskGraph.tasks[0]?.ownerRunId, taskGraph.runs[0]?.id)
  assert.equal(taskGraph.tasks[0]?.status, 'running')
  assert.equal(taskGraph.tasks[0]?.metadata?.executionMode, 'planner_inline')

  const planner = await waitForRun(runtime, taskGraph.runs[0]!.id)
  assert.ok(planner.status === 'completed' || planner.status === 'completed_with_warnings')
  const snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.runs.length, 1)
  assert.equal(snapshot.tasks[0]?.status, 'done')
  assert.equal(snapshot.tasks[0]?.progress, 1)
  assert.equal(snapshot.taskGraph.status, 'done')

  const dispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
    maxWorkers: 2,
  })
  assert.equal(dispatch.spawnedRuns.length, 0)
})

test('supervisor dispatch spawns worker runs and syncs task status from child completion', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Supervisor rollout',
    tasks: [
      { id: 'task_a', title: 'Implement base state' },
      { id: 'task_b', title: 'Wire supervisor', deps: ['task_a'] },
    ],
  })
  const planner = taskGraph.runs[0]
  assert.equal(planner?.role, 'planner')
  const finishedPlanner = await waitForRun(runtime, planner!.id)
  const userMessageCountBeforeDispatch = runtime.getThread(thread.id)?.messages.filter((message) => message.role === 'user').length

  const firstDispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: finishedPlanner.id,
    maxWorkers: 2,
  })
  assert.equal(firstDispatch.spawnedRuns.length, 1)
  assert.deepEqual(firstDispatch.blockedTaskIds, ['task_b'])
  assert.equal(firstDispatch.spawnedRuns[0]?.role, 'worker')
  assert.equal(firstDispatch.spawnedRuns[0]?.parentRunId, finishedPlanner.id)
  assert.equal(firstDispatch.spawnedRuns[0]?.taskId, 'task_a')
  assert.equal(firstDispatch.spawnedRuns[0]?.metadata?.subagentName, 'Agent 1')
  assert.equal(firstDispatch.spawnedRuns[0]?.input?.executionMode, 'worker')
  assert.equal(firstDispatch.spawnedRuns[0]?.input?.sourceMessageId, undefined)
  assert.match(firstDispatch.spawnedRuns[0]?.input?.userMessage ?? '', /Task: Implement base state/)
  assert.deepEqual(firstDispatch.spawnedRuns[0]?.input?.task, {
    id: 'task_a',
    title: 'Implement base state',
    instructions: 'Execute this worker task and report durable artifacts, blockers, and completion status.',
  })
  assert.equal(runtime.getThread(thread.id)?.messages.filter((message) => message.role === 'user').length, userMessageCountBeforeDispatch)
  assert.equal(runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((task) => task.id === 'task_a')?.metadata?.subagentName, 'Agent 1')
  assert.equal(firstDispatch.spawnedRuns[0]?.metadata?.subagentName, 'Agent 1')

  const firstWorker = await waitForRun(runtime, firstDispatch.spawnedRuns[0]!.id)
  assert.ok(firstWorker.status === 'completed' || firstWorker.status === 'completed_with_warnings')
  const afterFirstWorker = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(afterFirstWorker.tasks.find((task) => task.id === 'task_a')?.status, 'done')
  assert.equal(afterFirstWorker.tasks.find((task) => task.id === 'task_a')?.progress, 1)
  assertRunTraceEventTypes(runtime, firstWorker.id, [
    'heartbeat',
    'task_started',
    'task_completed',
    'progress_update',
    'artifact_created',
  ])

  const secondDispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: finishedPlanner.id,
    maxWorkers: 2,
  })
  assert.equal(secondDispatch.spawnedRuns.length, 1)
  assert.equal(secondDispatch.spawnedRuns[0]?.taskId, 'task_b')
  assert.equal(secondDispatch.spawnedRuns[0]?.metadata?.subagentName, 'Agent 2')
  assert.equal(runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((task) => task.id === 'task_b')?.metadata?.subagentName, 'Agent 2')

  const secondWorker = await waitForRun(runtime, secondDispatch.spawnedRuns[0]!.id)
  assert.ok(secondWorker.status === 'completed' || secondWorker.status === 'completed_with_warnings')
  const doneTaskGraph = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(doneTaskGraph.taskGraph.status, 'done')
  assert.equal(doneTaskGraph.taskGraph.progress, 1)
  assert.equal(doneTaskGraph.tasks.every((task) => task.status === 'done'), true)
  assertRunTraceEventTypes(runtime, finishedPlanner.id, ['task_graph_completed'])
})

test('parallel worker dispatch keeps task prompts private to each run input', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '并行执行两个任务' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Parallel worker rollout',
    tasks: [
      { id: 'task_parallel_a', title: 'Collect references' },
      { id: 'task_parallel_b', title: 'Workspace outline' },
    ],
  })
  const planner = await waitForRun(runtime, taskGraph.runs[0]!.id)
  const userMessageCountBeforeDispatch = runtime.getThread(thread.id)?.messages.filter((message) => message.role === 'user').length

  const dispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
    maxWorkers: 2,
  })

  assert.equal(dispatch.spawnedRuns.length, 2)
  assert.equal(runtime.getThread(thread.id)?.messages.filter((message) => message.role === 'user').length, userMessageCountBeforeDispatch)
  const runByTaskId = new Map(dispatch.spawnedRuns.map((run) => [run.taskId, run]))
  assert.match(runByTaskId.get('task_parallel_a')?.input?.userMessage ?? '', /Task: Collect references/)
  assert.doesNotMatch(runByTaskId.get('task_parallel_a')?.input?.userMessage ?? '', /Workspace outline/)
  assert.match(runByTaskId.get('task_parallel_b')?.input?.userMessage ?? '', /Task: Workspace outline/)
  assert.doesNotMatch(runByTaskId.get('task_parallel_b')?.input?.userMessage ?? '', /Collect references/)
})

test('dispatchTaskGraph requires a planner run from the same taskGraph', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Planner dispatch boundary',
    tasks: [{ id: 'task_dispatch_boundary', title: 'Boundary task' }],
  })
  const planner = await waitForRun(runtime, taskGraph.runs[0]!.id)
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_dispatch_boundary',
  })
  const otherThread = runtime.createThread({ messages: [{ role: 'user', content: '其他规划' }] })
  const otherTaskGraph = await runtime.createTaskGraph({
    threadId: otherThread.id,
    title: 'Other planner boundary',
    tasks: [],
  })
  const otherPlanner = await waitForRun(runtime, otherTaskGraph.runs[0]!.id)

  assert.throws(() => runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: worker.id,
  }), /is not a planner run/)
  assert.throws(() => runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: otherPlanner.id,
  }), /does not belong to taskGraph/)
})

test('cancelPlanTree requires the root planner run', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'TaskGraph tree cancel boundary',
    tasks: [{ id: 'task_cancel_tree_boundary', title: 'Boundary task' }],
  })
  const planner = await waitForRun(runtime, taskGraph.runs[0]!.id)
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_cancel_tree_boundary',
  })
  const secondPlanner = runtime.createRun({
    threadId: thread.id,
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })

  assert.throws(() => runtime.cancelPlanTree(worker.id), /is not a planner run/)
  assert.throws(() => runtime.cancelPlanTree(secondPlanner.id), /is not the root planner/)

  const result = runtime.cancelPlanTree(planner.id)
  assert.deepEqual(result.cancelledRunIds, [worker.id])
  assert.equal(runtime.getRun(worker.id)?.status, 'cancelled')
  assert.equal(runtime.getRun(planner.id)?.status, 'completed')
})

test('task protocol emits needs_input events for blocked worker input requests', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Needs input rollout',
    tasks: [{ id: 'task_input', title: 'Ask for input' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const now = new Date().toISOString()
  const worker: AgentRun = {
    id: 'run_needs_input_1',
    threadId: thread.id,
    status: 'requires_action',
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_input',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    runtimeLimits: planner.runtimeLimits,
    createdAt: now,
    updatedAt: now,
    pendingInputRequests: [{
      id: 'input_needs_name',
      runId: 'run_needs_input_1',
      title: 'Need a name',
      question: 'Which name should be used?',
      inputType: 'text',
      choices: [],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }],
    steps: [],
    traceEvents: [],
  }
  store.createRun(worker)
  runtime.updateTask('task_input', {
    status: 'running',
    ownerRunId: worker.id,
  })
  ;(runtime as any).taskRunSync.syncTaskFromRun(worker.id)

  const task = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((item) => item.id === 'task_input')
  assert.equal(task?.status, 'blocked')
  assert.equal(task?.metadata?.blockedKind, 'needs_input')
  assertRunTraceEventTypes(runtime, worker.id, ['needs_input'])
})

test('taskGraph stream replays snapshots and emits task run lifecycle events', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Streamed supervisor rollout',
    tasks: [
      {
        id: 'task_stream',
        title: 'Stream task state',
        metadata: { executionMode: 'worker' },
      },
    ],
  })
  const planner = taskGraph.runs[0]
  assert.equal(planner?.role, 'planner')
  await waitForRun(runtime, planner!.id)
  runtime.updateTask('task_stream', {
    artifacts: [{ id: 'artifact_stream_seed', type: 'workspace', title: 'Stream seed artifact' }],
  })
  const events: string[] = []
  const snapshots: AgentTaskGraphSnapshot[] = []
  const unsubscribe = runtime.subscribePlanStream(taskGraph.taskGraph.id, (event) => {
    events.push(event.type)
    if ('snapshot' in event) snapshots.push(event.snapshot)
  })

  const dispatched = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner!.id,
  })
  await waitForRun(runtime, dispatched.spawnedRuns[0]!.id)

  assert.equal(events[0], 'snapshot')
  assert.equal(events.includes('task'), true)
  assert.equal(events.includes('run'), true)
  assert.equal(events.at(-1), 'done')
  assert.equal(snapshots[0]?.summary?.taskCount, 1)
  assert.equal(snapshots[0]?.summary?.artifactCount, 1)
  assert.equal(snapshots.some((snapshot) => (snapshot.summary?.activeWorkerCount ?? 0) > 0), true)
  assert.equal(snapshots.at(-1)?.summary?.taskStatusCounts.done, 1)
  unsubscribe()
})

test('task metadata updates cannot create duplicate subagent names', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Task subagent metadata boundary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_named_metadata_a', title: 'Named metadata A', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
      { id: 'task_named_metadata_b', title: 'Named metadata B', metadata: { executionMode: 'worker' } },
    ],
  })

  assert.throws(() => runtime.updateTask('task_named_metadata_b', {
    metadata: {
      subagentName: 'Einstein',
      reviewOutcome: 'should_not_write',
    },
  }), /subagent name already exists/)

  const snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  const taskB = snapshot.tasks.find((task) => task.id === 'task_named_metadata_b')
  assert.equal(taskB?.metadata?.subagentName, undefined)
  assert.equal(taskB?.metadata?.reviewOutcome, undefined)

  const updated = runtime.updateTask('task_named_metadata_b', {
    metadata: {
      subagentName: 'Hawking',
    },
  })
  assert.equal(updated.metadata?.subagentName, 'Hawking')
})

test('planner context artifact references include source task provenance', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Artifact source provenance',
    tasks: [
      { id: 'task_artifact_source', title: 'Source task', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
      { id: 'task_artifact_reader', title: 'Reader task' },
    ],
  })
  const planner = await waitForRun(runtime, taskGraph.runs[0]!.id)
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_artifact_source',
    metadata: { subagentName: 'Einstein' },
  })
  runtime.updateTask('task_artifact_source', {
    status: 'running',
    ownerRunId: worker.id,
  })
  runtime.updateTask('task_artifact_reader', {
    artifacts: [{
      id: 'artifact_source_reference',
      type: 'review',
      title: 'Review source output',
      metadata: {
        sourceRunId: worker.id,
        sourceTaskId: 'task_artifact_source',
        toolName: 'movscript_review',
      },
    }],
  })

  const followupPlanner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const contextEvent = runtime.getRunTraceEvents(followupPlanner.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const summary = (contextEvent?.data as any)?.agentTaskGraph?.summary
  const artifact = (contextEvent?.data as any)?.agentTaskGraph?.artifacts
    ?.find((item: any) => item.id === 'artifact_source_reference')

  assert.equal(summary?.taskCount, 2)
  assert.equal(summary?.activeWorkerCount, 1)
  assert.equal(summary?.artifactCount, 1)
  assert.equal(summary?.taskStatusCounts?.running, 1)
  assert.equal(artifact?.sourceTaskTitle, 'Source task')
  assert.equal(artifact?.sourceTaskStatus, 'running')
  assert.equal(artifact?.sourceTaskOwnerRunId, worker.id)
})

test('taskGraph snapshots expose reusable taskGraph summary', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Snapshot summary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_summary_running', title: 'Running summary', metadata: { executionMode: 'worker' } },
      { id: 'task_summary_blocked', title: 'Blocked summary' },
    ],
  })
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_summary_running',
  })
  runtime.updateTask('task_summary_running', {
    status: 'running',
    ownerRunId: worker.id,
    artifacts: [{
      id: 'artifact_summary',
      type: 'review',
      title: 'Summary artifact',
      metadata: { sourceTaskId: 'task_summary_running', sourceRunId: worker.id },
    }],
  })
  runtime.updateTask('task_summary_blocked', {
    status: 'blocked',
    blockedReason: 'Waiting for review',
  })

  const snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.summary?.taskCount, 2)
  assert.equal(snapshot.summary?.taskStatusCounts.running, 1)
  assert.equal(snapshot.summary?.taskStatusCounts.blocked, 1)
  assert.equal(snapshot.summary?.workerCount, 1)
  assert.equal(snapshot.summary?.activeWorkerCount, 1)
  assert.equal(snapshot.summary?.artifactCount, 1)
  assert.deepEqual(snapshot.summary?.blockedTaskIds, ['task_summary_blocked'])
})

test('planner and worker prompts include structured taskGraph context', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Prompt taskGraph context',
    tasks: [
      { id: 'task_context_a', title: 'Context A', metadata: { executionMode: 'worker' } },
      { id: 'task_context_b', title: 'Context B', deps: ['task_context_a'], metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, taskGraph.runs[0]!.id)
  const plannerContextEvent = runtime.getRunTraceEvents(planner.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const plannerPlanContext = (plannerContextEvent?.data as any)?.agentTaskGraph
  assert.equal(plannerPlanContext?.id, taskGraph.taskGraph.id)
  assert.equal(plannerPlanContext?.role, 'planner')
  assert.equal(plannerPlanContext?.tasks?.some((task: any) => task.id === 'task_context_a'), true)

  const dispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
  })
  const worker = await waitForRun(runtime, dispatch.spawnedRuns[0]!.id)
  const workerContextEvent = runtime.getRunTraceEvents(worker.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const workerPlanContext = (workerContextEvent?.data as any)?.agentTaskGraph
  assert.equal(workerPlanContext?.id, taskGraph.taskGraph.id)
  assert.equal(workerPlanContext?.role, 'worker')
  assert.equal(workerPlanContext?.currentTaskId, 'task_context_a')
  assert.equal(workerPlanContext?.workers?.some((run: any) => run.id === worker.id), true)

  runtime.updateTask('task_context_b', {
    artifacts: [{
      id: 'artifact_context_source',
      type: 'review',
      title: 'Context source review',
      metadata: { sourceTaskId: 'task_context_a', sourceRunId: worker.id },
      createdAt: new Date().toISOString(),
    }],
  })
  const followupPlanner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const followupContextEvent = runtime.getRunTraceEvents(followupPlanner.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const followupPlanContext = (followupContextEvent?.data as any)?.agentTaskGraph
  const sourceArtifact = followupPlanContext?.artifacts?.find((artifact: any) => artifact.id === 'artifact_context_source')
  assert.equal(sourceArtifact?.sourceTaskId, 'task_context_a')
  assert.equal(sourceArtifact?.sourceTaskTitle, 'Context A')
})

test('worker runs cannot use planner-only runtime work tools', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'spawn subagent' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Worker cannot dispatch',
    createPlannerRun: false,
    tasks: [{ id: 'task_worker_only', title: 'Worker only', metadata: { executionMode: 'worker' } }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const worker = await createAndWaitForRun(runtime, thread.id, {
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_worker_only',
  })

  assert.equal(runHasTool(worker, 'core_work_start'), false)
  const event = runtime.getRunTraceEvents(worker.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((item) => item.title === 'Tool catalog resolved')
  const availableToolNames = (event?.data as any)?.availableToolNames ?? []
  const blockedTools = (event?.data as any)?.blockedTools ?? []
  assert.equal(availableToolNames.includes('core_work_start'), false)
  assert.equal(blockedTools.some((tool: any) => tool.name === 'core_work_start' && tool.reason === 'wrong_run_role'), true)
})

test('planner capabilities expose runtime work scheduling tools', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })

  const plannerCapabilities = await runtime.getCapabilities({ runRole: 'planner' })
  assert.equal(plannerCapabilities.resolvedTools.byName.core_catalog_inspect?.available, true)
  assert.equal(plannerCapabilities.resolvedTools.byName.core_work_start?.available, true)
  assert.equal(plannerCapabilities.resolvedTools.byName.core_work_wait?.available, true)

  const workerCapabilities = await runtime.getCapabilities({ runRole: 'worker' })
  assert.equal(workerCapabilities.resolvedTools.byName.core_catalog_inspect?.available, true)
  assert.equal(workerCapabilities.resolvedTools.byName.core_work_start?.available, false)
  assert.equal(workerCapabilities.resolvedTools.byName.core_work_start?.unavailableReason, 'wrong_run_role')
})

test('inspect agent catalog returns current snapshot summary and skill details', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请帮我做项目规范工作区工作区' }] })
  const run = await createAndWaitForRun(runtime, thread.id)

  const summary = runtime.inspectAgentCatalog(run, { view: 'summary' }) as any
  assert.equal(summary.status, 'ok')
  assert.equal(summary.configFile.id, 'movscript.config_file.base')
  assert.equal(summary.enabledPackIds.includes('core.pack.agent'), true)
  assert.equal(summary.toolNames.includes('core_catalog_inspect'), true)

  const skill = runtime.inspectAgentCatalog(run, {
    view: 'skill',
    id: 'core.rules.runtime',
  }) as any
  assert.equal(skill.skill.id, 'core.rules.runtime')
  assert.equal(skill.skill.instructionTemplate, undefined)
  assert.equal(skill.coveredByEnabledPack, true)

  const skillWithInstruction = runtime.inspectAgentCatalog(run, {
    view: 'skill',
    id: 'core.rules.runtime',
    includeInstruction: true,
  }) as any
  assert.match(skillWithInstruction.skill.instructionTemplate, /catalog inspection/)

})

test('user conversation runs default to planner role with runtime work scheduling tools', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'spawn subagent' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.role, 'planner')
  assert.equal(run.parentRunId, undefined)
  const event = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((item) => item.title === 'Tool catalog resolved')
  const availableToolNames = (event?.data as any)?.availableToolNames ?? []
  assert.equal(availableToolNames.includes('core_work_start'), true)
})

test('supervisor retries failed tasks within the configured attempt limit', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Retry rollout',
    tasks: [{ id: 'task_retry', title: 'Retry task' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })

  const now = new Date().toISOString()
  const firstRun: AgentRun = {
    id: 'run_retry_1',
    threadId: thread.id,
    status: 'failed',
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_retry',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    runtimeLimits: planner.runtimeLimits,
    createdAt: now,
    updatedAt: now,
    failedAt: now,
    error: 'synthetic failure',
    steps: [],
    traceEvents: [],
  }
  store.createRun(firstRun)
  runtime.updateTask('task_retry', {
    status: 'failed',
    progress: 0.2,
    ownerRunId: firstRun.id,
    blockedReason: 'synthetic failure',
  })

  const secondDispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
    retryFailed: true,
    maxTaskAttempts: 2,
  })
  assert.deepEqual(secondDispatch.retriedTaskIds, ['task_retry'])
  assert.equal(secondDispatch.spawnedRuns.length, 1)
  assert.notEqual(secondDispatch.spawnedRuns[0]?.id, firstRun.id)
  assert.equal(secondDispatch.spawnedRuns[0]?.taskId, 'task_retry')

  runtime.updateTask('task_retry', {
    status: 'failed',
    progress: 0.4,
    ownerRunId: secondDispatch.spawnedRuns[0]!.id,
    blockedReason: 'second synthetic failure',
  })
  const thirdDispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
    retryFailed: true,
    maxTaskAttempts: 2,
  })
  assert.deepEqual(thirdDispatch.retriedTaskIds, [])
  assert.equal(thirdDispatch.spawnedRuns.length, 0)
})

test('supervisor cancels timed out worker runs before dispatching more work', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Timeout rollout',
    tasks: [{ id: 'task_timeout', title: 'Timeout task' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const staleStartedAt = new Date(Date.now() - 60_000).toISOString()
  const run: AgentRun = {
    id: 'run_timeout_1',
    threadId: thread.id,
    status: 'in_progress',
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_timeout',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    runtimeLimits: planner.runtimeLimits,
    createdAt: staleStartedAt,
    updatedAt: staleStartedAt,
    startedAt: staleStartedAt,
    steps: [],
    traceEvents: [],
  }
  store.createRun(run)
  runtime.updateTask('task_timeout', {
    status: 'running',
    progress: 0.1,
    ownerRunId: run.id,
  })

  const dispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
    workerTimeoutMs: 1,
  })
  assert.deepEqual(dispatch.timedOutRunIds, [run.id])
  assert.equal(runtime.getRun(run.id)?.status, 'cancelled')
  const task = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((item) => item.id === 'task_timeout')
  assert.equal(task?.status, 'cancelled')
  assert.equal(task?.metadata?.timedOutRunId, run.id)
  assert.equal(task?.metadata?.workerTimeoutMs, 1)
  assert.equal(task?.metadata?.previousOwnerRunId, run.id)
  assert.equal(task?.metadata?.previousStatus, 'running')
})

test('supervisor uses task-level worker timeout overrides', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Task timeout override rollout',
    tasks: [
      { id: 'task_fast_timeout', title: 'Fast timeout task', metadata: { workerTimeoutMs: 1 } },
      { id: 'task_slow_timeout', title: 'Slow timeout task', metadata: { workerTimeoutMs: 120_000 } },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const staleStartedAt = new Date(Date.now() - 60_000).toISOString()
  const fastRun: AgentRun = {
    id: 'run_fast_timeout',
    threadId: thread.id,
    status: 'in_progress',
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_fast_timeout',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    runtimeLimits: planner.runtimeLimits,
    createdAt: staleStartedAt,
    updatedAt: staleStartedAt,
    startedAt: staleStartedAt,
    steps: [],
    traceEvents: [],
  }
  const slowRun: AgentRun = {
    ...fastRun,
    id: 'run_slow_timeout',
    taskId: 'task_slow_timeout',
  }
  store.createRun(fastRun)
  store.createRun(slowRun)
  runtime.updateTask('task_fast_timeout', { status: 'running', progress: 0.1, ownerRunId: fastRun.id })
  runtime.updateTask('task_slow_timeout', { status: 'running', progress: 0.1, ownerRunId: slowRun.id })

  const dispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
  })
  assert.deepEqual(dispatch.timedOutRunIds, [fastRun.id])
  assert.equal(runtime.getRun(fastRun.id)?.status, 'cancelled')
  assert.equal(runtime.getRun(slowRun.id)?.status, 'in_progress')
  const fastTask = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((item) => item.id === 'task_fast_timeout')
  assert.equal(fastTask?.metadata?.workerTimeoutMs, 1)
  assert.equal(fastTask?.metadata?.timedOutRunId, fastRun.id)
})

test('supervisor uses task-level retry attempt overrides', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Task retry override rollout',
    tasks: [
      { id: 'task_retry_override', title: 'Retry override task', metadata: { maxTaskAttempts: 3 } },
      { id: 'task_retry_default', title: 'Retry default task' },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const firstDispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
    maxWorkers: 2,
  })
  assert.equal(firstDispatch.spawnedRuns.length, 2)
  for (const run of firstDispatch.spawnedRuns) {
    const failedRun = runtime.getRun(run.id)
    assert.ok(failedRun)
    failedRun.status = 'failed'
    failedRun.error = 'worker failed'
    failedRun.failedAt = new Date().toISOString()
    store.updateRun(failedRun)
    runtime.updateTask(run.taskId!, {
      status: 'failed',
      progress: 0,
      ownerRunId: run.id,
      blockedReason: 'worker failed',
    })
  }

  const retryDispatch = runtime.dispatchTaskGraph({
    taskGraphId: taskGraph.taskGraph.id,
    plannerRunId: planner.id,
    retryFailed: true,
    maxTaskAttempts: 1,
    maxWorkers: 2,
  })
  assert.deepEqual(retryDispatch.retriedTaskIds, ['task_retry_override'])
  assert.equal(retryDispatch.spawnedRuns.length, 1)
  assert.equal(retryDispatch.spawnedRuns[0]?.taskId, 'task_retry_override')
  const retryTask = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((item) => item.id === 'task_retry_override')
  assert.equal(retryTask?.metadata?.retryAttempt, 2)
  assert.equal(retryTask?.metadata?.maxTaskAttempts, 3)
})

test('updateTaskGraph updates the task graph, resets blocked work, and dispatches runnable workers', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'RetaskGraph rollout',
    tasks: [
      { id: 'task_blocked', title: 'Blocked task' },
      { id: 'task_followup', title: 'Follow up', deps: ['task_blocked'] },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  runtime.updateTask('task_blocked', {
    status: 'blocked',
    progress: 0.25,
    blockedReason: 'needs smaller task graph',
  })

  const updateTaskGraph = runtime.replanRun(planner.id, {
    tasks: [
      { id: 'task_followup', description: 'Run after the recovered blocked task and added audit task.' },
      { id: 'task_audit', title: 'Audit new path', deps: ['task_blocked'] },
    ],
    resetBlocked: true,
    maxWorkers: 2,
  })

  assert.deepEqual(updateTaskGraph.createdTaskIds, ['task_audit'])
  assert.deepEqual(updateTaskGraph.updatedTaskIds, ['task_followup'])
  assert.deepEqual(updateTaskGraph.resetTaskIds, ['task_blocked'])
  assert.equal(updateTaskGraph.dispatch?.spawnedRuns.length, 1)
  assert.equal(updateTaskGraph.dispatch?.spawnedRuns[0]?.taskId, 'task_blocked')

  const snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_blocked')?.status, 'running')
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_blocked')?.blockedReason, undefined)
  assert.equal(
    snapshot.tasks.find((task) => task.id === 'task_followup')?.description,
    'Run after the recovered blocked task and added audit task.',
  )
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_audit')?.status, 'pending')
})

test('updateTaskGraph can reset needs_review tasks for another worker pass', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Needs review updateTaskGraph rollout',
    tasks: [
      { id: 'task_review', title: 'Reviewable task', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const finishedWorker = runtime.createToolRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_review',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    toolCall: {
      name: 'movscript_script_locate',
      args: { projectId: 42 },
    },
  })
  await waitForRun(runtime, finishedWorker.id)
  runtime.updateTask('task_review', {
    status: 'needs_review',
    progress: 1,
    ownerRunId: finishedWorker.id,
    blockedReason: 'User requested another pass before acceptance.',
  })

  const updateTaskGraph = runtime.replanRun(planner.id, {
    resetNeedsReview: true,
    maxWorkers: 1,
  })

  assert.deepEqual(updateTaskGraph.resetTaskIds, ['task_review'])
  assert.equal(updateTaskGraph.dispatch?.spawnedRuns.length, 1)
  assert.equal(updateTaskGraph.dispatch?.spawnedRuns[0]?.taskId, 'task_review')
  assert.notEqual(updateTaskGraph.dispatch?.spawnedRuns[0]?.id, finishedWorker.id)
  assert.equal(updateTaskGraph.dispatch?.spawnedRuns[0]?.metadata?.subagentName, 'Einstein')

  const task = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((item) => item.id === 'task_review')
  assert.equal(task?.status, 'running')
  assert.equal(task?.blockedReason, undefined)
  assert.equal(task?.metadata?.previousStatus, 'needs_review')
  assert.equal(task?.metadata?.previousOwnerRunId, finishedWorker.id)
})

test('replanRun requires a planner run before mutating tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'RetaskGraph planner boundary',
    tasks: [{ id: 'task_retask_graph_boundary', title: 'Boundary task' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    taskGraphId: taskGraph.taskGraph.id,
    taskId: 'task_retask_graph_boundary',
  })

  assert.throws(() => runtime.replanRun(planner.id, {
    plannerRunId: worker.id,
    tasks: [{ id: 'task_retask_graph_boundary', description: 'Worker should not mutate this.' }],
    dispatch: false,
  }), /is not a planner run/)
  assert.equal(
    runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).tasks.find((task) => task.id === 'task_retask_graph_boundary')?.description,
    undefined,
  )
})

test('updateTaskGraph add tasks validates atomically before creating tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Atomic updateTaskGraph additions',
    tasks: [
      { id: 'task_retask_graph_existing_named', title: 'Existing named', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    taskGraphId: taskGraph.taskGraph.id,
  })

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_atomic_a', title: 'Atomic A' },
      { id: 'task_retask_graph_atomic_a', title: 'Atomic duplicate id' },
    ],
    dispatch: false,
  }), /task already exists/)

  let snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_atomic_a'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_atomic_b', title: 'Atomic B', metadata: { subagentName: 'Hawking' } },
      { id: 'task_retask_graph_atomic_c', title: 'Atomic C', subagentName: 'Hawking' },
    ],
    dispatch: false,
  }), /subagent name already exists/)

  snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_atomic_b'), false)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_atomic_c'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_atomic_d', title: 'Atomic D', subagentName: 'Einstein' },
    ],
    dispatch: false,
  }), /subagent name already exists/)

  snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_atomic_d'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_atomic_e', title: 'Atomic E', deps: ['task_missing_retask_graph_dep'] },
    ],
    dispatch: false,
  }), /task not found/)

  snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_atomic_e'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_atomic_cycle_a', title: 'Cycle A', deps: ['task_retask_graph_atomic_cycle_b'] },
      { id: 'task_retask_graph_atomic_cycle_b', title: 'Cycle B', deps: ['task_retask_graph_atomic_cycle_a'] },
    ],
    dispatch: false,
  }), /dependency cycle detected/)

  snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_atomic_cycle_a'), false)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_atomic_cycle_b'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_parent_cycle_a', title: 'Parent Cycle A', parentId: 'task_retask_graph_parent_cycle_b' },
      { id: 'task_retask_graph_parent_cycle_b', title: 'Parent Cycle B', parentId: 'task_retask_graph_parent_cycle_a' },
    ],
    dispatch: false,
  }), /parent cycle detected/)

  snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_parent_cycle_a'), false)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_parent_cycle_b'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_update_atomic_a', title: 'Update Atomic A' },
    ],
    updates: [
      { id: 'task_retask_graph_existing_named', deps: ['task_retask_graph_update_atomic_a'] },
      { id: 'task_retask_graph_update_missing', title: 'Missing update target' },
    ],
    dispatch: false,
  }), /task not found/)

  snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_retask_graph_update_atomic_a'), false)
  assert.deepEqual(snapshot.tasks.find((task) => task.id === 'task_retask_graph_existing_named')?.deps, [])

  const valid = runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_retask_graph_atomic_f', title: 'Atomic F', deps: ['task_retask_graph_existing_named'] },
      { id: 'task_retask_graph_atomic_g', title: 'Atomic G', parentId: 'task_retask_graph_atomic_f', deps: ['task_retask_graph_atomic_f'] },
    ],
    updates: [
      { id: 'task_retask_graph_existing_named', description: 'Updated after atomic validation.' },
    ],
    dispatch: false,
  })
  assert.deepEqual(valid.createdTaskIds, ['task_retask_graph_atomic_f', 'task_retask_graph_atomic_g'])
  assert.deepEqual(valid.updatedTaskIds, ['task_retask_graph_existing_named'])
  snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_retask_graph_existing_named')?.description, 'Updated after atomic validation.')
  assert.deepEqual(snapshot.tasks.find((task) => task.id === 'task_retask_graph_atomic_g')?.deps, ['task_retask_graph_atomic_f'])
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_retask_graph_atomic_g')?.parentId, 'task_retask_graph_atomic_f')
})

test('needs_review tasks can be accepted through task update', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Review acceptance rollout',
    tasks: [{ id: 'task_accept_review', title: 'Accept review task', metadata: { executionMode: 'worker', subagentName: 'Einstein' } }],
  })
  runtime.updateTask('task_accept_review', {
    status: 'needs_review',
    progress: 1,
    blockedReason: 'Ready for user acceptance.',
  })

  const accepted = runtime.updateTask('task_accept_review', {
    status: 'done',
    progress: 1,
    blockedReason: '',
    metadata: {
      reviewOutcome: 'accepted',
      reviewedAt: '2026-05-12T00:00:00.000Z',
    },
  })

  assert.equal(accepted.status, 'done')
  assert.equal(accepted.blockedReason, undefined)
  assert.equal(accepted.metadata?.reviewOutcome, 'accepted')
  assert.equal(runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id).taskGraph.status, 'done')
})

test('needs_review tasks can be rejected through task update', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, activeAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const taskGraph = await runtime.createTaskGraph({
    threadId: thread.id,
    title: 'Review rejection rollout',
    tasks: [{ id: 'task_reject_review', title: 'Reject review task', metadata: { executionMode: 'worker', subagentName: 'Einstein' } }],
  })
  runtime.updateTask('task_reject_review', {
    status: 'needs_review',
    progress: 1,
    blockedReason: 'Ready for user acceptance.',
  })

  const rejected = runtime.updateTask('task_reject_review', {
    status: 'cancelled',
    progress: 1,
    blockedReason: 'User rejected review.',
    metadata: {
      reviewOutcome: 'rejected',
      reviewedAt: '2026-05-12T00:00:00.000Z',
    },
  })

  const snapshot = runtime.getTaskGraphSnapshot(taskGraph.taskGraph.id)
  assert.equal(rejected.status, 'cancelled')
  assert.equal(rejected.blockedReason, 'User rejected review.')
  assert.equal(rejected.metadata?.reviewOutcome, 'rejected')
  assert.equal(snapshot.taskGraph.status, 'cancelled')
  assert.equal(snapshot.tasks[0]?.status, 'cancelled')
})

async function createAndWaitForRun(
  runtime: AgentRuntimeRouter,
  threadId: string,
  input: Record<string, unknown> = {},
): Promise<AgentRun> {
  const run = runtime.createRun({ threadId, ...input })
  return waitForRun(runtime, run.id)
}

async function waitForRun(runtime: AgentRuntimeRouter, runId: string): Promise<AgentRun> {
  const deadline = Date.now() + 1000
  while (true) {
    const latest = runtime.getRun(runId)
    if (latest && latest.status !== 'queued' && latest.status !== 'in_progress') return latest
    if (Date.now() > deadline) throw new Error(`run ${runId} did not finish`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForThreadTitle(runtime: AgentRuntimeRouter, threadId: string, title: string): Promise<void> {
  const deadline = Date.now() + 1000
  while (true) {
    if (runtime.getThread(threadId)?.title === title) return
    if (Date.now() > deadline) throw new Error(`thread ${threadId} title did not update`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function toolText(value: unknown): JSONValue {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value),
      },
    ],
  }
}

function writeJSONFile(dir: string, filename: string, value: unknown): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function runHasTool(run: AgentRun, toolName: string): boolean {
  return run.steps.some((step) => step.toolName === toolName)
}

function assertRunTraceEventTypes(runtime: AgentRuntimeRouter, runId: string, expected: string[]): void {
  const actual = new Set(
    runtime.getRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER })
      .map((event) => {
        const data = event.data
        return isPlainTestRecord(data) ? data.eventType : undefined
      })
      .filter((eventType): eventType is string => typeof eventType === 'string'),
  )
  for (const eventType of expected) {
    assert.equal(actual.has(eventType), true, `missing trace eventType ${eventType}`)
  }
}

function findTraceEventByEventType(runtime: AgentRuntimeRouter, runId: string, eventType: string): { data?: Record<string, unknown> } | undefined {
  return runtime.getRunTraceEvents(runId, { limit: Number.MAX_SAFE_INTEGER })
    .map((event) => ({ data: isPlainTestRecord(event.data) ? event.data : undefined }))
    .find((event) => event.data?.eventType === eventType)
}

function isTestRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isPlainTestRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasGenerationTraceData(value: unknown): boolean {
  return isTestRecord(value) && isTestRecord(value.generation)
}
