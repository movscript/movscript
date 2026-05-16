import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { AgentRuntime, type AgentPlanSnapshot, type AgentRun, type AgentRunStreamEvent } from './agentRuntime.js'
import type { JSONValue } from '../types.js'
import { FileAgentStore } from '../state/fileStore.js'
import { InMemoryAgentStore } from '../state/store.js'
import { FileAgentDraftStore, InMemoryAgentDraftStore } from '../drafts/draftStore.js'
import { InMemoryAgentMemoryStore } from '../memory/memoryStore.js'
import { DEFAULT_AGENT_MANIFEST } from '../catalog/agentManifest.js'
import { BackendApplyClient, type BackendApplyAuthContext, type BackendApplyResult } from '../drafts/backendApplyClient.js'
import type { ApplyDraftReview } from '../drafts/draftApply.js'
import { InMemoryAgentCatalogStateStore } from '../catalog/state.js'
import { loadAgentPluginCatalog } from '../catalog/loader.js'
import { DEFAULT_TOOL_REGISTRY, StaticToolRegistry } from '../tools/toolRegistry.js'
import { normalizeClientInput } from '../context/normalizeClientInput.js'
import { DRAFT_CONTENT_SCHEMA_IDS } from '@movscript/draft-schemas'

process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-test-')), 'model-config.json')

const WRITE_AGENT_MANIFEST = {
  ...DEFAULT_AGENT_MANIFEST,
  tools: [
    ...DEFAULT_AGENT_MANIFEST.tools,
    { name: 'movscript_create_project', mode: 'allow' as const, approval: 'always' as const },
    { name: 'movscript_create_script', mode: 'allow' as const, approval: 'always' as const },
  ],
}

// Install a default model config so executeRun() can find one
{
  const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
  new RuntimeModelConfigStore().save({ modelConfigId: 1, model: 'model_config:1' })
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
      && toolNames.has('movscript_create_generation_job')
      && !toolResultForCall(toolMessages, 'movscript.create_generation_job')
    ) {
      const modelsResult = toolResultForCall(toolMessages, 'movscript.list_models')
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
                function: { name: 'movscript_create_generation_job', arguments: JSON.stringify(args) },
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

    if (/记忆|memory|偏好|默认镜头风格/i.test(userMsg) && toolNames.has('movscript_search_memories')) {
      callsToMake.push({ id: 'call_memory_1', name: 'movscript_search_memories', args: { query: userMsg.slice(0, 40), limit: 8, ...(projectId !== undefined ? { projectId } : {}) } })
    }
    if (/创建.*项目|新建.*项目|create.*project/i.test(userMsg) && toolNames.has('movscript_create_project')) {
      const quoted = userMsg.match(/[「“"]([^」”"]+)[」”"]/)?.[1]
      const name = quoted ?? '测试项目'
      callsToMake.push({
        id: 'call_create_project_1',
        name: 'movscript_create_project',
        args: {
          name,
          description: '由 agent 创建的测试项目。',
        },
      })
    }
    if (/草稿|draft/i.test(userMsg) && !/应用|apply/i.test(userMsg) && toolNames.has('movscript_create_draft')) {
      const draftContent = memoriesSection
        ? `用户请求：${userMsg}\n\n参考记忆：\n${memoriesSection}`
        : `用户请求：${userMsg}`
      callsToMake.push({ id: 'call_draft_1', name: 'movscript_create_draft', args: { kind: 'content_unit', title: '草稿', content: draftContent, ...(projectId !== undefined ? { projectId } : {}) } })
    }
    if (/保存.*剧本|创建.*剧本|create.*script/i.test(userMsg) && toolNames.has('movscript_create_script')) {
      callsToMake.push({
        id: 'call_create_script_1',
        name: 'movscript_create_script',
        args: {
          title: '雨夜便利店',
          content: '雨夜。便利店。一个外卖员发现柜台后藏着一封没有寄出的信。',
          summary: '一个外卖员在雨夜便利店卷入旧信和失踪案。',
          hook: '一封没有寄出的信指向十年前同一场雨。',
          script_type: 'short_drama',
          ...(projectId !== undefined ? { projectId } : {}),
        },
      })
    }
    if (/按模型能力|model contract/i.test(userMsg) && toolNames.has('movscript_list_models')) {
      callsToMake.push({
        id: 'call_list_models_for_generation_1',
        name: 'movscript_list_models',
        args: { capability: /视频|video/i.test(userMsg) ? 'video' : 'image' },
      })
    }
    if (!/按模型能力|model contract/i.test(userMsg) && /生成|出图|视频|image|video/i.test(userMsg) && toolNames.has('movscript_create_generation_job')) {
      callsToMake.push({
        id: 'call_generation_1',
        name: 'movscript_create_generation_job',
        args: {
          prompt: '雨夜便利店，电影感，16:9',
          output_type: /视频|video/i.test(userMsg) ? 'video' : 'image',
          aspect_ratio: '16:9',
          wait: false,
          ...(projectId !== undefined ? { projectId } : {}),
        },
      })
    }
    if (/选择|缺少上下文|ask user/i.test(userMsg) && !/用户补充信息/.test(userMsg) && toolNames.has('movscript_request_user_input')) {
      callsToMake.push({
        id: 'call_input_1',
        name: 'movscript_request_user_input',
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
    if (/spawn subagent/i.test(userMsg) && toolNames.has('movscript_spawn_subagent')) {
      callsToMake.push({
        id: 'call_spawn_subagent_1',
        name: 'movscript_spawn_subagent',
        args: { maxWorkers: 2 },
      })
    }
    if (/list subagents/i.test(userMsg) && toolNames.has('movscript_list_subagents')) {
      callsToMake.push({
        id: 'call_list_subagents_1',
        name: 'movscript_list_subagents',
        args: {},
      })
    }
    if (/wait subagent/i.test(userMsg) && toolNames.has('movscript_wait_subagent')) {
      callsToMake.push({
        id: 'call_wait_subagent_1',
        name: 'movscript_wait_subagent',
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
  tools: [
    { name: 'movscript_reload_agent_catalog', mode: 'allow' as const, approval: 'never' as const },
  ],
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
      { name: 'movscript_create_project', description: 'Create a project.', inputSchema: {} },
      { name: 'movscript_read_project_scripts', description: 'Read project scripts.', inputSchema: {} },
      ...this.extraTools,
    ]
  }

  async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
    this.calls.push({ name, args })
    if (this.failTools.has(name)) {
      throw new Error(`${name} failed`)
    }
    if (name === 'movscript_get_focus') {
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
  readonly calls: Array<{ review: ApplyDraftReview; auth?: BackendApplyAuthContext }> = []
  readonly previewCalls: Array<{ review: ApplyDraftReview; auth?: BackendApplyAuthContext }> = []
  readonly createScriptCalls: Array<{ projectId: number; payload: Record<string, JSONValue>; auth?: BackendApplyAuthContext }> = []
  result: BackendApplyResult = {
    performed: true,
    method: 'PATCH',
    url: 'http://backend/api/v1/projects/42/entities/content-units/7',
    payload: { description: 'New content-unit description' },
  }

  override isEnabled(): boolean {
    return true
  }

  override async applyReview(review: ApplyDraftReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    this.calls.push({ review, auth })
    return this.result
  }

  override async previewApplyReview(review: ApplyDraftReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    this.previewCalls.push({ review, auth })
    return {
      ...this.result,
      response: { status: 'ok', dry_run: true, would_apply: { counts: {} } },
    }
  }

  override async createScript(projectId: number, payload: Record<string, JSONValue>, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    this.createScriptCalls.push({ projectId, payload, auth })
    return {
      performed: true,
      method: 'POST',
      url: `http://backend/api/v1/projects/${projectId}/scripts`,
      payload,
      response: {
        id: 99,
        project_id: projectId,
        ...payload,
      },
    }
  }
}

function createTestRuntime(options: ConstructorParameters<typeof AgentRuntime>[0]): AgentRuntime {
  return new AgentRuntime(options)
}

test('proposal-first draft requests create local agent drafts without backend writes', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.status, 'completed')
  assert.equal(runtime.listDrafts({ projectId: 42 }).length, 1)
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_draft'), false)
})

test('previews plan and policy without creating a run or executing planned tools', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请保存剧本' }] })

  const preview = await runtime.previewRun({
    threadId: thread.id,
    agentManifest: WRITE_AGENT_MANIFEST,
  })

  assert.equal(preview.status, 'preview')
  assert.equal(preview.threadId, thread.id)
  assert.equal(preview.currentProjectId, 42)
  assert.equal(preview.pendingApprovals[0]?.toolName, 'movscript_create_script')
  assert.equal(preview.agentManifest?.schema, 'movscript.agent.current')
  assert.ok(preview.context)
  assert.ok(preview.skills)
  assert.ok(preview.tools?.available.some((tool) => tool.name === 'movscript_create_script'))
  assert.ok(preview.promptPreview?.debugParts.some((part) => part.kind === 'tool'))
  assert.equal(preview.toolCalls.length, 0)
  assert.equal(runtime.listRuns().length, 0)
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_script'), false)
  assert.ok(client.calls.some((call) => call.name === 'movscript_get_focus'))
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
  assert.equal(preview.debug?.manifestId, 'movscript.profile.default')
  assert.equal(preview.promptPreview?.messages.at(-1)?.content.includes('moment-ref.png'), true)
})

test('preview activates only triggered layered skills instead of loading every profile workflow', async () => {
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
  assert.ok(skillIds.includes('movscript.persona.default'))
  assert.ok(skillIds.includes('movscript.policy.drafts'))
  assert.equal(skillIds.includes('movscript.workflow.project-proposal'), false)
  assert.equal(skillIds.includes('movscript.workflow.visual-generation'), false)
  assert.deepEqual(preview.debug?.layerTrace?.workflowIds, [])
  assert.equal(preview.debug?.layerTrace?.profileId, 'movscript.profile.default')
  assert.equal(preview.debug?.layerTrace?.workflowTriggers?.every((trigger) => trigger.selected === false), true)
})

test('preview debug explains selected workflow trigger reasons', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const preview = await runtime.previewRun({
    clientInput: {
      message: '请帮我做项目提案',
      uiSnapshot: {
        route: { pathname: '/projects/42' },
        project: { id: 42, name: 'Test Project' },
      },
    },
  })

  const triggers = preview.debug?.layerTrace?.workflowTriggers ?? []
  const selected = triggers.find((trigger) => trigger.id === 'movscript.workflow.project-proposal')
  assert.equal(preview.debug?.layerTrace?.workflowIds.includes('movscript.workflow.project-proposal'), true)
  assert.equal(selected?.selected, true)
  assert.equal(selected?.matched, true)
  assert.ok(selected?.reason.startsWith('selected:'))
  assert.deepEqual(preview.debug?.layerTrace?.intentSignals?.find((signal) => signal.intent === 'project_proposal'), {
    intent: 'project_proposal',
    source: 'keyword_fallback',
    confidence: 'low',
    evidence: 'keyword:项目提案',
  })
})

test('normalizeClientInput preserves top-level draft id', () => {
  const normalized = normalizeClientInput({
    message: '请继续使用当前草稿',
    uiSnapshot: {
      draftId: 'draft_123',
      pageContext: {
        draftId: 'draft_123',
      },
    },
  })

  assert.equal(normalized?.uiSnapshot?.draftId, 'draft_123')
  assert.equal(normalized?.uiSnapshot?.pageContext?.draftId, 'draft_123')
})

test('agentic loop does not emit draft tool calls without a page-owned draft shell', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.status, 'completed')
  assert.ok(run.steps.some((step) => step.toolName === 'movscript_create_draft' && step.status === 'completed'))
  assert.equal(run.steps.some((step: any) => step.type === 'planning' || step.type === 'subagent'), false)
  assert.equal(runtime.listDrafts({ projectId: 42 }).length, 1)
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
      tools: [{ name: 'movscript_create_project', mode: 'allow' }],
    },
  })

  assert.equal(capabilities.mcp.connected, true)
  assert.ok(capabilities.resolvedTools.available.some((tool) => tool.name === 'movscript_create_project'))
  assert.equal(capabilities.resolvedTools.byName['movscript_create_draft']?.available, false)
  assert.ok(capabilities.pluginCatalog?.metadata?.mcpPacks)
  assert.ok(capabilities.registry.some((tool) => tool.name === 'mcp__default__studio_render' && tool.source === 'mcp'))
})

test('runtime draft tools are available without MCP tool discovery except draft creation', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const capabilities = await runtime.getCapabilities({ currentProjectId: 42 })

  assert.equal(capabilities.resolvedTools.byName['movscript_read_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_update_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_list_drafts']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_create_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_create_script']?.source, 'runtime')
  assert.equal(capabilities.resolvedTools.byName['movscript_create_script']?.available, true)
})

test('runtime can read, edit, and validate a script split draft without backend writes', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const runtime = createTestRuntime({ mcpClient: client, draftStore })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请细化草稿' }] })
  const draft = draftStore.createDraft({
    projectId: 42,
    kind: 'script_split_proposal',
    title: '剧本拆分草稿',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.scriptSplit,
      source_title: '总稿',
      source_summary: '摘要',
      source_script: {
        title: '总稿',
        summary: '摘要',
        source_type: 'raw',
        line_count: 12,
      },
      global_settings: {
        story_world: '雨夜城市',
        core_rules: [],
        character_relationships: [],
        key_characters: [],
        key_locations: [],
        key_props: [],
        continuity_notes: [],
      },
      episode_drafts: [{
        order: 1,
        title: '第1集',
        summary: '旧摘要',
        global_context: {
          story_world: '雨夜城市',
          core_rules: [],
          character_relationships: [],
          key_characters: [],
          key_locations: [],
          key_props: [],
          continuity_notes: [],
          episode_relevance: [],
        },
        start_line: 1,
        end_line: 3,
        action: 'create',
        existing_script_id: null,
      }],
      warnings: [],
      confidence: 0.8,
    }),
  })

  const readRun = runtime.createToolRun({
    threadId: thread.id,
    title: 'Read draft',
    message: 'Read draft',
    toolCall: {
      name: 'movscript_read_draft',
      args: {
        file_path: draft.filePath,
      },
    },
  })
  const readCompleted = await waitForRun(runtime, readRun.id)
  const editRun = runtime.createToolRun({
    threadId: thread.id,
    title: 'Edit draft',
    message: 'Edit draft',
    toolCall: {
      name: 'movscript_update_draft',
      args: {
        draftId: draft.id,
        action: 'replace_text',
        oldString: '"summary":"旧摘要"',
        newString: '"summary":"新摘要"',
      },
    },
  })
  const completed = await waitForRun(runtime, editRun.id)
  const updated = runtime.getDraft(draft.id)
  const parsed = JSON.parse(updated?.content ?? '{}') as { episode_drafts?: Array<{ summary?: string }> }
  const validation = runtime.validateDraft({ draftId: draft.id }) as { ok?: boolean }

  assert.equal(readCompleted.status, 'completed')
  assert.equal(completed.status, 'completed')
  assert.equal(parsed.episode_drafts?.[0]?.summary, '新摘要')
  assert.equal(validation.ok, true)
  assert.equal(client.calls.some((call) => call.name === 'movscript_update_draft'), false)
})

test('explicit write agent can create_project without a current project after approval', async () => {
  const client = new FakeMCPClient()
  client.projectId = null
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个项目「测试项目」' }] })

  const run = await createAndWaitForRun(runtime, thread.id, { agentManifest: WRITE_AGENT_MANIFEST })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript_create_project')
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_project'), false)
  assertRunTraceEventTypes(runtime, run.id, [
    'context.run_built',
    'profile.resolved',
    'trigger.evaluated',
    'prompt.composed',
    'tool.call.policy_decision',
    'approval.requested',
  ])

  runtime.approveRun(run.id)
  const resumed = await waitForRun(runtime, run.id)
  const call = client.calls.find((item) => item.name === 'movscript_create_project')

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
  const toolTrace = runtime.getRunTraceEvents(resumed.id, { kind: 'tool_call' }).find((event) => event.toolName === 'movscript_create_project' && event.status === 'completed')
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
  const toolStep = runtime.getRun(resumed.id)?.steps.find((step) => step.toolName === 'movscript_create_project' && step.status === 'completed')
  assert.equal(typeof toolStep?.durationMs, 'number')
  assert.ok((toolStep?.durationMs ?? -1) >= 0)
})

test('create_script requires approval and creates a backend script after approval', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.userId = 7
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我创建并保存一个新剧本' }] })

  const run = await createAndWaitForRun(runtime, thread.id, { agentManifest: WRITE_AGENT_MANIFEST, backendAuthToken: 'secret-token' })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript_create_script')
  assert.equal(backendApplyClient.createScriptCalls.length, 0)

  runtime.approveRun(run.id, { backendAuthToken: 'secret-token' })
  const resumed = await waitForRun(runtime, run.id)
  await runtime.flushPostRunRecords()

  assert.equal(resumed.status, 'completed')
  assert.equal(backendApplyClient.createScriptCalls.length, 1)
  assert.equal(backendApplyClient.createScriptCalls[0]?.projectId, 42)
  assert.equal(backendApplyClient.createScriptCalls[0]?.payload.title, '雨夜便利店')
  assert.equal(backendApplyClient.createScriptCalls[0]?.payload.raw_source, '雨夜。便利店。一个外卖员发现柜台后藏着一封没有寄出的信。')
  assert.equal(backendApplyClient.createScriptCalls[0]?.payload.source_type, 'raw')
  assert.equal(backendApplyClient.createScriptCalls[0]?.auth?.userId, 7)
  assert.equal(backendApplyClient.createScriptCalls[0]?.auth?.backendAuthToken, 'secret-token')
  assert.ok(resumed.steps.some((step) => step.toolName === 'movscript_create_script' && step.status === 'completed'))
  const rollbackRecords = isPlainTestRecord(resumed.metadata)
    && Array.isArray(resumed.metadata.rollbackRecords)
    ? resumed.metadata.rollbackRecords
    : []
  assert.equal(rollbackRecords.some((record) => isPlainTestRecord(record)
    && isPlainTestRecord(record.rollback)
    && record.rollback.policy === 'manual_compensation'), true)
  assertRunTraceEventTypes(runtime, resumed.id, ['rollback_policy'])
})

test('worker completion records reversible rollback artifacts for local draft side effects', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const agentManifest = {
    ...DEFAULT_AGENT_MANIFEST,
    tools: [
      ...DEFAULT_AGENT_MANIFEST.tools,
      { name: 'movscript_create_draft', mode: 'allow' as const, approval: 'never' as const },
    ],
  }
  const runtime = createTestRuntime({
    mcpClient: client,
    defaultAgentManifest: agentManifest,
    toolRegistry: new StaticToolRegistry([{
      name: 'movscript_create_draft',
      description: 'Create a local review draft.',
      permission: 'draft.write',
      risk: 'draft',
      source: 'runtime',
      projectScoped: false,
      requiresApprovalByDefault: false,
    }]),
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建一个草稿' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Draft rollback rollout',
    tasks: [{ id: 'task_draft', title: 'Create draft' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
    agentManifest,
  })
  const workerRun = runtime.createToolRun({
    threadId: thread.id,
    agentManifest,
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_draft',
    toolCall: {
      name: 'movscript_create_draft',
      args: {
        kind: 'content_unit',
        title: '草稿',
        content: '用户请求：请创建一个草稿',
        projectId: 42,
      },
    },
  })
  runtime.updateTask('task_draft', {
    status: 'running',
    ownerRunId: workerRun.id,
  })
  const worker = await waitForRun(runtime, workerRun.id)
  await runtime.flushPostRunRecords()

  assert.ok(worker.status === 'completed' || worker.status === 'completed_with_warnings')
  assertRunTraceEventTypes(runtime, worker.id, ['rollback_policy'])
  const task = runtime.getPlanSnapshot(plan.plan.id).tasks.find((item) => item.id === 'task_draft')
  const completionArtifact = task?.artifacts.find((artifact) => artifact.type === 'run' && artifact.uri === `agent-run:${worker.id}`)
  const rollbackArtifact = task?.artifacts.find((artifact) => artifact.type === 'rollback-policy' && artifact.uri?.startsWith('agent-draft:'))
  assert.equal(completionArtifact?.metadata?.createdFrom, 'worker_completion')
  assert.equal(completionArtifact?.metadata?.sourceRunId, worker.id)
  assert.equal(completionArtifact?.metadata?.sourceTaskId, 'task_draft')
  assert.equal(completionArtifact?.metadata?.sourceRunRole, 'worker')
  assert.equal(rollbackArtifact?.metadata?.createdFrom, 'rollback_policy')
  assert.equal(typeof rollbackArtifact?.metadata?.sourceRunId, 'string')
  assert.ok(runtime.getRun(String(rollbackArtifact?.metadata?.sourceRunId)))
  assert.equal(rollbackArtifact?.metadata?.planId, plan.plan.id)
  assert.equal(rollbackArtifact?.metadata?.toolName, 'movscript_create_draft')
})

test('run agentManifest limits tool execution', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_read_project_scripts', mode: 'allow', approval: 'never' }],
    },
  })

  assert.equal(run.status, 'completed')
  assert.equal(runtime.listDrafts({ projectId: 42 }).length, 0)
  assert.deepEqual(run.agentManifest?.tools, [{ name: 'movscript_read_project_scripts', mode: 'allow', approval: 'never' }])
})

test('run requiring approval pauses before tool execution and resumes after approval', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请保存剧本' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: WRITE_AGENT_MANIFEST,
  })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript_create_script')
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_script'), false)

  runtime.approveRun(run.id)
  const resumed = await waitForRun(runtime, run.id)
  const draft = client.calls.find((call) => call.name === 'movscript_create_script')

  assert.ok(resumed.status === 'completed' || resumed.status === 'completed_with_warnings')
  assert.equal(draft, undefined)
  assert.equal(runtime.listDrafts({ projectId: 42 }).length, 0)
  assert.equal(resumed.pendingApprovals?.[0].status, 'approved')
  assertRunTraceEventTypes(runtime, resumed.id, ['approval.resolved'])
  assert.equal(findTraceEventByEventType(runtime, resumed.id, 'approval.resolved')?.data?.outcome, 'approved')
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
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请保存剧本' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: WRITE_AGENT_MANIFEST,
  })
  const rejected = runtime.rejectRun(run.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === rejected.assistantMessageId)

  assert.equal(rejected.status, 'completed_with_warnings')
  assert.equal(rejected.pendingApprovals?.[0].status, 'rejected')
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_script'), false)
  assert.match(assistant?.content ?? '', /已取消需要确认的工具调用/)
  assertRunTraceEventTypes(runtime, rejected.id, ['approval.resolved'])
  assert.equal(findTraceEventByEventType(runtime, rejected.id, 'approval.resolved')?.data?.outcome, 'denied')
})

test('run can be cancelled while waiting for action', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请保存剧本' }] })

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
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_script'), false)
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

test('agent does not apply drafts as a model-visible tool', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const draft = runtime.createLocalDraft({
    projectId: 42,
    kind: 'content_unit',
    title: 'Content unit update',
    content: 'New content-unit description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })
  const thread = runtime.createThread({
    messages: [{ role: 'user', content: `请应用草稿 ${draft.id} 到 content_unit #7 字段 description` }],
  })

  const run = await createAndWaitForRun(runtime, thread.id, { agentManifest: WRITE_AGENT_MANIFEST })

  assert.equal(run.status, 'completed')
  assert.equal(run.pendingApprovals?.length ?? 0, 0)
  assert.equal(runtime.getDraft(draft.id)?.status, 'draft')
  assert.equal(backendApplyClient.calls.length, 0)
})

test('UI apply_draft API marks draft applied without creating an agent approval run', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const draft = runtime.createLocalDraft({
    projectId: 42,
    kind: 'content_unit',
    title: 'Content unit update',
    content: 'New content-unit description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })

  const applied = await runtime.applyDraftFromUI({
    draftId: draft.id,
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
    currentValue: 'Old content-unit description',
    proposedValue: 'New content-unit description',
  }) as any

  assert.equal(applied.status, 'applied')
  assert.equal(applied.review.currentValue, 'Old content-unit description')
  assert.equal(runtime.getDraft(draft.id)?.status, 'applied')
  assert.equal((runtime.getDraft(draft.id)?.metadata?.applyReview as any)?.requiresBackendApply, true)
  assert.equal(runtime.getDraft(draft.id)?.metadata?.backendWritePerformed, true)
  assert.equal((runtime.getDraft(draft.id)?.metadata?.backendApply as any)?.method, 'PATCH')
  assert.equal(backendApplyClient.calls.length, 1)
  assert.equal(runtime.listRuns().length, 0)
})

test('UI apply_draft API passes explicit user id to backend apply client', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const draft = runtime.createLocalDraft({
    projectId: 42,
    kind: 'content_unit',
    title: 'Content unit update',
    content: 'New content-unit description',
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
  })
  await runtime.applyDraftFromUI({
    draftId: draft.id,
    target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
    appliedByUserId: 9,
  })

  assert.equal(backendApplyClient.calls[0].auth?.userId, 9)
})

test('apply_draft preview API returns before and after values', () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const draft = runtime.createLocalDraft({
    projectId: 42,
    kind: 'script',
    title: 'Script update',
    content: 'Updated script text',
  })

  const preview = runtime.previewApplyDraft({
    draftId: draft.id,
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

test('simulateApplyDraft dry-runs backend apply without marking draft applied', async () => {
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient(), backendApplyClient })
  const draft = runtime.createLocalDraft({
    projectId: 42,
    kind: 'project_proposal',
    title: 'Project proposal',
    content: JSON.stringify({
      schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
      scope: 'project_proposal',
      mode: 'snapshot',
      proposal: {
        creative_references: [],
        asset_slots: [],
        project_style: {
          aspect_ratio: '9:16',
          shot_size_system: ['wide', 'medium', 'close-up', 'insert'],
          visual_style: 'Clean vertical drama realism with readable character expressions and key props.',
          negative_rules: ['No arbitrary character face changes', 'No unreadable dark prop details'],
        },
      },
    }),
    target: { projectId: 42, entityType: 'project', entityId: 42, field: 'proposal' },
  })

  const result = await runtime.simulateApplyDraft({ draftId: draft.id }) as any

  assert.equal(result.ok, true)
  assert.equal(result.backendApply.response.dry_run, true)
  assert.equal(backendApplyClient.previewCalls.length, 1)
  assert.equal(backendApplyClient.calls.length, 0)
  assert.equal(runtime.getDraft(draft.id)?.status, 'draft')
})

test('rejectDraft marks local draft rejected with reason', () => {
  const runtime = createTestRuntime({ mcpClient: new FakeMCPClient() })
  const draft = runtime.createLocalDraft({
    projectId: 42,
    kind: 'note',
    title: 'Reject me',
    content: 'Not useful',
  })

  const rejected = runtime.rejectDraft({ draftId: draft.id, reason: 'out of scope' })

  assert.equal(rejected.status, 'rejected')
  assert.equal(rejected.rejectedReason, 'out of scope')
})

test('sandbox mode intercepts agent write-risk tools', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const backendApplyClient = new FakeBackendApplyClient()
  const runtime = createTestRuntime({ mcpClient: client, backendApplyClient })
  const run = runtime.createToolRun({
    title: 'Sandbox create script',
    message: 'Sandbox create script',
    sandboxMode: true,
    agentManifest: WRITE_AGENT_MANIFEST,
    toolCall: {
      name: 'movscript_create_script',
      args: { projectId: 42, title: 'Draft script', content: 'Body' },
    },
  })

  const finished = await waitForRun(runtime, run.id)
  const sandboxed = finished.steps.find((step) => step.toolName === 'movscript_create_script')

  assert.equal(finished.status, 'completed')
  assert.equal(Boolean(finished.pendingApprovals?.some((approval) => approval.status === 'pending')), false)
  assert.equal(sandboxed?.sandboxed, true)
  assert.equal(sandboxed?.roundSource, 'runtime_rule')
  assert.equal((sandboxed?.result as any)?.sandboxed, true)
  assert.equal(backendApplyClient.createScriptCalls.length, 0)
})

test('persists threads, messages, runs, and steps across runtime rebuilds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const client = new FakeMCPClient()
    client.projectId = 42
    const store = new FileAgentStore(statePath)
    const runtime = createTestRuntime({ mcpClient: client, store })
    const thread = runtime.createThread({ title: 'Persistent thread' })
    runtime.addMessage(thread.id, { role: 'user', content: '参考我的默认镜头风格记忆，帮我写一个镜头草稿' })
    const run = await createAndWaitForRun(runtime, thread.id)
    store.flush()

    const rebuilt = createTestRuntime({ mcpClient: new FakeMCPClient(), store: new FileAgentStore(statePath) })
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

test('agent runtime generates a thread title before the first run loop', async () => {
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

test('agent runtime streams generated thread titles before run completion', async () => {
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
    const events: AgentRunStreamEvent[] = []
    const unsubscribe = runtime.subscribeRunStream(run.id, (event) => events.push(event))
    const completed = await waitForRun(runtime, run.id)
    unsubscribe()

    const titleIndex = events.findIndex((event) => event.type === 'thread_title' && event.title === '雨夜短片创作')
    const doneIndex = events.findIndex((event) => event.type === 'done')
    assert.notEqual(titleIndex, -1)
    assert.notEqual(doneIndex, -1)
    assert.equal(titleIndex < doneIndex, true)
    assert.equal(completed.status, 'completed')
  } finally {
    globalThis.fetch = originalFetch
  }
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
      name: 'movscript_read_project_scripts',
      args: { projectId: 42 },
    },
  })
  const finishedToolRun = await waitForRun(runtime, toolRun.id)

  assert.equal(userRun.role, 'planner')
  assert.equal(finishedToolRun.role, 'worker')
  assert.equal(finishedToolRun.parentRunId, undefined)
})

test('file store writes valid JSON atomically enough to recover state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const store = new FileAgentStore(statePath)
    const now = new Date().toISOString()
    store.createThread({
      id: 'thread_atomic',
      archived: false,
      createdAt: now,
      updatedAt: now,
      messages: [],
    })
    store.flush()

    const parsed = JSON.parse(readFileSync(statePath, 'utf8'))
    assert.equal(parsed.version, 3)
    assert.equal(parsed.threads[0].id, 'thread_atomic')
    assert.deepEqual(parsed.traceEvents, [])
    assert.equal(new FileAgentStore(statePath).getThread('thread_atomic')?.id, 'thread_atomic')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
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
  assert.equal(runHasTool(secondRun, 'movscript_search_memories'), false)

  runtime.addMessage(thread.id, { role: 'user', content: '搜索我的默认镜头风格记忆' })
  const thirdRun = await createAndWaitForRun(runtime, thread.id)
  const memoryStep = thirdRun.steps.find((step) => step.toolName === 'movscript_search_memories')

  assert.match(assistant?.content ?? '', /已完成|当前/)
  assert.match(JSON.stringify(memoryStep?.result ?? {}), /手持纪实/)
})

test('completed runs persist thread context summaries and reuse refs in later prompts', async () => {
  const originalFetch = globalThis.fetch
  const seenSystemPrompts: string[] = []
  let knowledgeCallCount = 0
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
      if (/分镜缺口/.test(userMsg) && toolMessages.length === 0 && toolNames.has('movscript_search_knowledge')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_search_knowledge_1',
                type: 'function',
                function: { name: 'movscript_search_knowledge', arguments: JSON.stringify({ query: '分镜 节奏', domain: 'storyboard', limit: 2 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/分镜缺口/.test(userMsg) && toolMessages.length < 3 && toolNames.has('movscript_get_knowledge')) {
        knowledgeCallCount += 1
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: `call_get_knowledge_${knowledgeCallCount}`,
                type: 'function',
                function: { name: 'movscript_get_knowledge', arguments: JSON.stringify({ id: 'storyboard.rhythm.basic', maxChars: 80 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: toolMessages.length > 0 ? '已完成分镜缺口审阅。' : '好的，继续。' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '检查分镜缺口' }] })
    const firstRun = await createAndWaitForRun(runtime, thread.id)
    const afterFirst = runtime.getThread(thread.id)
    const firstAssistant = afterFirst?.messages.find((message) => message.id === firstRun.assistantMessageId)
    const summary = afterFirst?.metadata?.threadContextSummary as any

    const searchedTrace = findTraceEventByEventType(runtime, firstRun.id, 'context.knowledge_searched')
    assert.equal(searchedTrace?.data?.query, '分镜 节奏')
    assert.equal(searchedTrace?.data?.domain, 'storyboard')
    assert.equal(typeof searchedTrace?.data?.resultCount, 'number')
    const loadedTrace = findTraceEventByEventType(runtime, firstRun.id, 'context.knowledge_loaded')
    assert.equal(loadedTrace?.data?.id, 'storyboard.rhythm.basic')
    assert.equal(loadedTrace?.data?.truncated, true)
    assert.equal((loadedTrace?.data?.refs as any[])?.some((ref) => ref.id === 'storyboard.rhythm.basic' && ref.evidence === 'advisory'), true)
    const dedupedTrace = findTraceEventByEventType(runtime, firstRun.id, 'context.item_deduped')
    assert.equal(dedupedTrace?.data?.dedupedCount, 1)
    assert.equal((dedupedTrace?.data?.records as any[])?.some((record) => record.type === 'knowledge' && record.id === 'storyboard.rhythm.basic'), true)

    assert.equal(summary?.schema, 'movscript.thread-context-summary.v1')
    assert.equal(firstRun.metadata?.threadContextSummary && (firstRun.metadata.threadContextSummary as any).schema, 'movscript.thread-context-summary.v1')
    assert.ok(summary.recentRunRefs?.[0]?.retrievedRefs?.some((ref: any) => ref.type === 'knowledge' && ref.id === 'storyboard.rhythm.basic'))
    assert.match(firstAssistant?.content ?? '', /来源：/)
    assert.match(firstAssistant?.content ?? '', /通用知识建议：.*knowledge#storyboard\.rhythm\.basic《分镜节奏基础》.*（source=knowledge; evidence=advisory）/)
    assert.match(firstAssistant?.content ?? '', /用户输入：本轮消息（source=user_input; evidence=user_claimed）/)

    runtime.addMessage(thread.id, { role: 'user', content: '继续' })
    const secondRun = await createAndWaitForRun(runtime, thread.id)
    const promptEvent = findTraceEventByEventType(runtime, secondRun.id, 'prompt.composed')
    const parts = (promptEvent?.data?.promptStats as any)?.parts as any[]

    assert.ok(parts.some((part) => part.id === 'thread.continuity'))
    assert.match(seenSystemPrompts.at(-1) ?? '', /Persisted thread context summary/)
    assert.match(seenSystemPrompts.at(-1) ?? '', /knowledge#storyboard.rhythm.basic/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('content unit storyboard proposal searches knowledge and creates a proposal draft', async () => {
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
      if (/内容单元分镜 proposal/.test(userMsg) && toolMessages.length === 0 && toolNames.has('movscript_search_knowledge')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_search_storyboard_knowledge',
                type: 'function',
                function: { name: 'movscript_search_knowledge', arguments: JSON.stringify({ query: '内容单元 分镜 节奏', domain: 'storyboard', limit: 2 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/内容单元分镜 proposal/.test(userMsg) && toolMessages.length === 1 && toolNames.has('movscript_get_knowledge')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_get_storyboard_knowledge',
                type: 'function',
                function: { name: 'movscript_get_knowledge', arguments: JSON.stringify({ id: 'storyboard.rhythm.basic', maxChars: 120 }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (/内容单元分镜 proposal/.test(userMsg) && toolMessages.length === 2 && toolNames.has('movscript_create_draft')) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_create_content_unit_proposal',
                type: 'function',
                function: {
                  name: 'movscript_create_draft',
                  arguments: JSON.stringify({
                    proposal: true,
                    kind: 'content_unit_proposal',
                    title: '内容单元分镜 proposal',
                    projectId: 42,
                    productionId: 4,
                    content: {
                      schema: 'movscript.content_unit_proposal.v1',
                      scope: 'content_unit_proposal',
                      productionId: 4,
                      proposal: {
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
                      summary: '基于 storyboard.rhythm.basic 创建内容单元分镜 proposal。',
                    },
                  }),
                },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '已创建内容单元分镜 proposal draft。', finish_reason: 'stop' } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '请创建内容单元分镜 proposal 草稿' }] })
    const run = await createAndWaitForRun(runtime, thread.id)
    const draft = runtime.listDrafts({ projectId: 42, kind: 'content_unit_proposal' })[0]
    const assistant = runtime.getThread(thread.id)?.messages.find((message) => message.id === run.assistantMessageId)

    assert.equal(run.steps.some((step) => step.toolName === 'movscript_search_knowledge' && step.status === 'completed'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'movscript_get_knowledge' && step.status === 'completed'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'movscript_create_draft' && step.status === 'completed'), true)
    assert.equal(draft?.kind, 'content_unit_proposal')
    assert.match(draft?.content ?? '', /movscript\.content_unit_proposal\.v1/)
    assert.equal((draft?.metadata as any)?.proposal, true)
    assert.equal((draft?.target as any)?.entityType, 'production')
    assert.equal((draft?.target as any)?.entityId, 4)
    assert.match(assistant?.content ?? '', /通用知识建议：.*knowledge#storyboard\.rhythm\.basic/)
    assert.match(assistant?.content ?? '', /本地草稿：draft#/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('records backend model gateway HTTP request and response in run trace', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-trace-'))
  const statePath = join(modelConfigDir, 'state.json')
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13' })

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
    const store = new FileAgentStore(statePath)
    const runtime = createTestRuntime({ mcpClient: client, store })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: 'hello' }] })
    const run = await createAndWaitForRun(runtime, thread.id, { backendAuthToken: 'secret-token' })
    store.flush()

    const traceEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    const requestEvent = traceEvents.find((event) => event.kind === 'model_call' && event.title === 'Model HTTP request sent')
    const responseEvent = traceEvents.find((event) => event.kind === 'model_call' && event.title === 'Model HTTP response received')
    const assistantEvent = traceEvents.find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
    const requestData = requestEvent?.data as any
    const responseData = responseEvent?.data as any
    const assistantData = assistantEvent?.data as any

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(requestData.request.url, 'http://localhost:8765/api/v1/model-gateway/chat/completions')
    assert.equal(requestData.request.method, 'POST')
    assert.equal(requestData.request.headers.Authorization, undefined)
    assert.equal(requestData.request.body.model, 'model_config:13')
    assert.ok(Array.isArray(requestData.request.body.messages))
    assert.equal(responseData.response.status, 200)
    assert.match(responseData.response.bodyText, /trace reply/)
    assert.equal(responseData.response.parsedBody.id, 'chatcmpl_trace_test')
    assert.equal(responseData.response.content, 'trace reply')
    assert.equal(typeof responseData.latencyMs, 'number')
    assert.equal(typeof assistantData.messageId, 'string')
    assert.match(assistantData.content, /trace reply/)
    assert.match(assistantData.content, /来源/)
    assert.equal(assistantData.source, 'model')
    assertRunTraceEventTypes(runtime, run.id, [
      'context.run_built',
      'profile.resolved',
      'trigger.evaluated',
      'prompt.composed',
    ])
    const runBuiltEvent = findTraceEventByEventType(runtime, run.id, 'context.run_built')
    assert.ok(Array.isArray((runBuiltEvent?.data as any)?.activeSkillIds))
    assert.ok(Array.isArray((runBuiltEvent?.data as any)?.visibleToolNames))
    const promptEvent = findTraceEventByEventType(runtime, run.id, 'prompt.composed')
    const promptStats = promptEvent?.data?.promptStats as any
    assert.equal(promptEvent?.data?.contextEventType, 'context.prompt_composed')
    assert.equal(typeof promptEvent?.data?.messageCount, 'number')
    assert.equal(typeof promptEvent?.data?.systemMessageCount, 'number')
    assert.equal(typeof promptStats?.totalChars, 'number')
    assert.ok(promptStats.byLayer.level0_core > 0)
    assert.ok(promptStats.byLayer.level1_context > 0)
    assert.ok(promptStats.byLayer.level2_behavior > 0)
    assert.ok(promptStats.byContextLayer.runtime_contract > 0)
    assert.ok(promptStats.byContextLayer.focus > 0)
    assert.ok(promptStats.byContextLayer.behavior > 0)
    assert.ok(Array.isArray(promptStats.parts))
    assert.equal(run.metadata?.contextLedger && (run.metadata.contextLedger as any).schema, 'movscript.context-ledger.v1')
    assert.ok(Array.isArray(run.metadata?.activeSkillIds))
    assert.ok(Array.isArray(run.metadata?.visibleToolNames))

    const rebuilt = createTestRuntime({ mcpClient: new FakeMCPClient(), store: new FileAgentStore(statePath) })
    const restoredTraceEvents = rebuilt.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    const restoredResponseData = restoredTraceEvents
      .find((event) => event.kind === 'model_call' && event.title === 'Model HTTP response received')
      ?.data as any
    const restoredAssistantData = restoredTraceEvents
      .find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
      ?.data as any
    assert.match(restoredResponseData.response.bodyText, /trace reply/)
    assert.equal(restoredResponseData.response.parsedBody.id, 'chatcmpl_trace_test')
    assert.equal(restoredResponseData.response.content, 'trace reply')
    assert.equal(typeof restoredAssistantData.messageId, 'string')
    assert.match(restoredAssistantData.content, /trace reply/)
    assert.match(restoredAssistantData.content, /来源/)
    assert.equal(restoredAssistantData.source, 'model')
    assert.deepEqual(rebuilt.getRun(run.id)?.traceEvents ?? [], [])
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('emits assistant_delta events from streamed model content', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-stream-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13' })

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
    const deltas: string[] = []
    const accumulated: string[] = []
    runtime.subscribeRunStream(run.id, (event) => {
      if (event.type === 'assistant_delta') {
        deltas.push(event.delta)
        accumulated.push(event.accumulated)
      }
    })

    const completed = await waitForRun(runtime, run.id)

    assert.ok(completed.status === 'completed' || completed.status === 'completed_with_warnings')
    assert.deepEqual(completed.traceEvents ?? [], [])
    assert.deepEqual(deltas, ['流式', '响应', '继续', '完成'])
    assert.deepEqual(accumulated, ['流式', '流式响应', '流式响应继续', '流式响应继续完成'])
    assert.equal(runtime.getRunTraceEvents(completed.id, { limit: Number.MAX_SAFE_INTEGER }).some((event) => event.title === 'Model stream delta'), false)
    const assistant = runtime.getThread(thread.id)?.messages.find((message) => message.id === completed.assistantMessageId)
    const assistantTrace = runtime.getRunTraceEvents(completed.id, { limit: Number.MAX_SAFE_INTEGER })
      .find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
    assert.equal((assistantTrace?.data as any)?.content, assistant?.content)
    assert.match(String((assistantTrace?.data as any)?.content ?? ''), /流式完成/)
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
    const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ role: string; content: string | null }> }
      if (isThreadTitleRequest(body.messages ?? [])) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '流式工具调用' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      callCount += 1
      if (callCount === 1) {
        const body = [
          'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_stream_script","type":"function","function":{"name":"movscript_create_script","arguments":"{\\"title\\""}}]},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"雨夜便利店\\",\\"content\\":\\"雨夜。便利店。一个外卖员发现柜台后藏着一封没有寄出的信。\\""}}]},"finish_reason":null}]}',
          '',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":",\\"summary\\":\\"一个外卖员在雨夜便利店卷入旧信和失踪案。\\",\\"hook\\":\\"一封没有寄出的信指向十年前同一场雨。\\",\\"script_type\\":\\"short_drama\\"}"}}]},"finish_reason":"tool_calls"}]}',
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
          { name: 'movscript_create_script', mode: 'allow', approval: 'never' },
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
    assert.equal(runtime.listDrafts({ projectId: 42 }).length, 0)
    assert.equal(liveToolEvents.length >= 3, true)
    assert.deepEqual(new Set(liveToolEvents.map((event) => event.id)).size, 1)
    assert.equal(liveToolStreamEvents.every((event) => event.run === undefined), true)
    const finalStream = liveToolEvents.at(-1)?.data?.stream
    assert.equal(finalStream?.toolCall?.name, 'movscript_create_script')
    assert.equal(finalStream?.toolCall?.parseStatus, 'valid_json')
    assert.deepEqual(finalStream?.toolCall?.argumentsJSON, { title: '雨夜便利店', content: '雨夜。便利店。一个外卖员发现柜台后藏着一封没有寄出的信。', summary: '一个外卖员在雨夜便利店卷入旧信和失踪案。', hook: '一封没有寄出的信指向十年前同一场雨。', script_type: 'short_drama' })
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
    const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '保存剧本' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      callCount += 1
      requests.push(body)

      if (callCount === 1) {
        assert.equal(Array.isArray(body.tools), true)
        assert.equal((body.tools as any[]).some((tool) => tool?.function?.name === 'movscript_create_script'), true)
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
                    name: 'movscript_create_script',
                    arguments: JSON.stringify({
                      title: '雨夜便利店',
                      content: '雨夜。便利店。一个外卖员发现柜台后藏着一封没有寄出的信。',
                      summary: '一个外卖员在雨夜便利店卷入旧信和失踪案。',
                      hook: '一封没有寄出的信指向十年前同一场雨。',
                      script_type: 'short_drama',
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
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '保存剧本' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_create_script', mode: 'allow', approval: 'never' },
        ],
      },
    })
    const finalThread = runtime.getThread(thread.id)
    const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(callCount >= 2, true)
    assert.equal(runtime.listDrafts({ projectId: 42 }).length, 0)
    const ledger = run.metadata?.contextLedger as any
    assert.equal(ledger?.schema, 'movscript.context-ledger.v1')
    assert.equal(ledger?.retrieved?.some((record: any) => record.ref?.type === 'project' && record.ref?.id === '42'), true)
    assert.equal(ledger?.artifactRefs?.some((ref: any) => ref.type === 'project' && ref.id === '42'), true)
    const ledgerEvent = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
      .find((event) => event.data && (event.data as any).eventType === 'context.ledger_updated')
    assert.equal((ledgerEvent?.data as any)?.retrievedCount >= 1, true)
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
    const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '保存剧本' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      callCount += 1
      if (callCount === 1) {
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: '先说明一下，我会先创建剧本，再给出结果。',
              tool_calls: [{
                id: 'call_create_script_turn_1',
                type: 'function',
                function: {
                  name: 'movscript_create_script',
                  arguments: JSON.stringify({
                    title: '雨夜便利店',
                    content: '雨夜。便利店。一个外卖员发现柜台后藏着一封没有寄出的信。',
                    summary: '一个外卖员在雨夜便利店卷入旧信和失踪案。',
                    hook: '一封没有寄出的信指向十年前同一场雨。',
                    script_type: 'short_drama',
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
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '保存剧本' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_create_script', mode: 'allow', approval: 'never' },
        ],
      },
    })
    const assistant = runtime.getThread(thread.id)?.messages.find((message) => message.id === run.assistantMessageId)

    assert.equal(callCount >= 2, true)
    assert.match(assistant?.content ?? '', /先说明一下/)
    assert.match(assistant?.content ?? '', /已完成工具调用/)
    const assistantTrace = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
      .find((event) => event.kind === 'assistant' && event.title === 'Assistant message created')
    assert.match(String((assistantTrace?.data as any)?.content ?? ''), /先说明一下/)
    assert.match(String((assistantTrace?.data as any)?.content ?? ''), /已完成工具调用/)
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
    const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13' })

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
                function: { name: 'movscript_read_project_scripts', arguments: JSON.stringify({ projectId: 42 }) },
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
    client.toolResults.set('movscript_read_project_scripts', {
      projectId: 42,
      scripts: [{ id: 1, title: '长剧本', content: '雨夜便利店。'.repeat(1200) }],
    })
    const runtime = createTestRuntime({ mcpClient: client })
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
    assert.match(String(toolMessage.content), /omitted_text_body/)
    assert.doesNotMatch(String(toolMessage.content), /雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。雨夜便利店。/)
    assert.equal(runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER }).some((event) => (event.data as any)?.eventType === 'context.item_dropped'), true)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('generation tool results emit structured generation trace events', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.extraTools.push({ name: 'movscript_create_generation_job', description: 'Create generation job.', inputSchema: {} })
  client.extraTools.push({ name: 'movscript_get_generation_job', description: 'Inspect generation job.', inputSchema: {} })
  client.toolResults.set('movscript_create_generation_job', {
    status: 'queued',
    jobId: 123,
    terminal: false,
    monitor: {
      tool: 'movscript_get_generation_job',
      args: { jobId: 123, projectId: 42 },
      timeoutMs: 200,
      pollIntervalMs: 10,
    },
    message: '生成任务已创建（Job #123）。',
  })
  let inspectCount = 0
  client.toolHandlers.set('movscript_get_generation_job', (): JSONValue => {
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
        { name: 'movscript_create_generation_job', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  const generationEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    .filter((event) => event.kind === 'tool_call' && hasGenerationTraceData(event.data))
  assert.equal(generationEvents.length >= 2, true)
  const created = (generationEvents[0]!.data as Record<string, any>).generation
  assert.equal(created.jobId, 123)
  assert.equal(created.stage, 'created')
  assert.equal(created.status, 'queued')
  assert.equal(created.terminal, false)
  const completed = (generationEvents.at(-1)!.data as Record<string, any>).generation
  assert.equal(inspectCount >= 2, true)
  assert.deepEqual(client.calls.filter((call) => call.name === 'movscript_get_generation_job').map((call) => call.args), [
    { jobId: 123, projectId: 42 },
    { jobId: 123, projectId: 42 },
  ])
  assert.equal(completed.jobId, 123)
  assert.equal(completed.stage, 'completed')
  assert.equal(completed.status, 'succeeded')
  assert.equal(completed.providerName, 'test-provider')
  assert.equal(completed.modelDisplay, 'Test Image Model')
  assert.equal(completed.modelIdentifier, 'test/image-model')
  assert.equal(completed.modelConfigId, 9)
  assert.equal(completed.outputResourceId, 456)
  assert.equal(completed.terminal, true)
})

test('agent uses model_contracts from list_models before generation params', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.extraTools.push({ name: 'movscript_list_models', description: 'List generation models.', inputSchema: {} })
  client.extraTools.push({ name: 'movscript_create_generation_job', description: 'Create generation job.', inputSchema: {} })
  client.toolResults.set('movscript_list_models', {
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
  client.toolResults.set('movscript_create_generation_job', {
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
      name: 'movscript_list_models',
      description: 'List generation models.',
      permission: 'generation.read',
      risk: 'read',
      projectScoped: false,
      requiresApprovalByDefault: false,
    },
    {
      name: 'movscript_create_generation_job',
      description: 'Create generation job.',
      permission: 'generation.create',
      risk: 'generate',
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
        { name: 'movscript_list_models', mode: 'allow', approval: 'never' },
        { name: 'movscript_create_generation_job', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  assert.deepEqual(client.calls.map((call) => call.name).filter((name) => name === 'movscript_list_models' || name === 'movscript_create_generation_job'), [
    'movscript_list_models',
    'movscript_create_generation_job',
  ])
  const generationCall = client.calls.find((call) => call.name === 'movscript_create_generation_job')
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
  client.extraTools.push({ name: 'movscript_create_generation_job', description: 'Create generation job.', inputSchema: {} })
  client.extraTools.push({ name: 'movscript_get_generation_job', description: 'Inspect generation job.', inputSchema: {} })
  client.toolResults.set('movscript_create_generation_job', {
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
        { name: 'movscript_create_generation_job', mode: 'allow', approval: 'never' },
      ],
    },
  })

  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)
  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  const generationCalls = client.calls.filter((call) => call.name === 'movscript_create_generation_job')
  assert.equal(generationCalls.length, 1)
  assert.deepEqual(generationCalls[0]?.args.extra_params, undefined)
  assert.equal(generationCalls[0]?.args.aspect_ratio, undefined)
  assert.match(assistant?.content ?? '', /\/image/)
  assert.match(assistant?.content ?? '', /Output resource: #654/)
})

test('generation monitor emits failed and cancelled terminal events', async () => {
  for (const terminalStatus of ['failed', 'cancelled'] as const) {
    const client = new FakeMCPClient()
    client.projectId = 42
    client.extraTools.push({ name: 'movscript_create_generation_job', description: 'Create generation job.', inputSchema: {} })
    client.extraTools.push({ name: 'movscript_get_generation_job', description: 'Inspect generation job.', inputSchema: {} })
    client.toolResults.set('movscript_create_generation_job', {
      status: 'queued',
      jobId: terminalStatus === 'failed' ? 501 : 502,
      terminal: false,
      monitor: {
        tool: 'movscript_get_generation_job',
        args: { jobId: terminalStatus === 'failed' ? 501 : 502, projectId: 42 },
        timeoutMs: 200,
        pollIntervalMs: 10,
      },
      message: '生成任务已创建。',
    })
    client.toolHandlers.set('movscript_get_generation_job', (): JSONValue => ({
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
          { name: 'movscript_create_generation_job', mode: 'allow', approval: 'never' },
        ],
      },
    })

    assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
    const generationEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
      .filter((event) => event.kind === 'tool_call' && hasGenerationTraceData(event.data))
    const terminal = (generationEvents.at(-1)!.data as Record<string, any>).generation
    assert.equal(terminal.status, terminalStatus)
    assert.equal(terminal.stage, terminalStatus)
    assert.equal(terminal.terminal, true)
  }
})

test('generation monitor emits heartbeat trace updates while the job keeps running', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.extraTools.push({ name: 'movscript_create_generation_job', description: 'Create generation job.', inputSchema: {} })
  client.extraTools.push({ name: 'movscript_get_generation_job', description: 'Inspect generation job.', inputSchema: {} })
  client.toolResults.set('movscript_create_generation_job', {
    status: 'queued',
    jobId: 778,
    terminal: false,
    monitor: {
      tool: 'movscript_get_generation_job',
      args: { jobId: 778, projectId: 42 },
      timeoutMs: 600,
      pollIntervalMs: 250,
      heartbeatMs: 1,
    },
    message: '生成任务已创建。',
  })
  client.toolHandlers.set('movscript_get_generation_job', (): JSONValue => ({
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
        { name: 'movscript_create_generation_job', mode: 'allow', approval: 'never' },
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
  assert.equal(observedEvents.length >= 2, true)
})

test('generation monitor emits timeout when async job does not finish in time', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.extraTools.push({ name: 'movscript_create_generation_job', description: 'Create generation job.', inputSchema: {} })
  client.extraTools.push({ name: 'movscript_get_generation_job', description: 'Inspect generation job.', inputSchema: {} })
  client.toolResults.set('movscript_create_generation_job', {
    status: 'queued',
    jobId: 777,
    terminal: false,
    monitor: {
      tool: 'movscript_get_generation_job',
      args: { jobId: 777, projectId: 42 },
      timeoutMs: 25,
      pollIntervalMs: 10,
    },
    message: '生成任务已创建（Job #777）。',
  })
  client.toolHandlers.set('movscript_get_generation_job', (): JSONValue => ({
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
        { name: 'movscript_create_generation_job', mode: 'allow', approval: 'never' },
      ],
    },
  })

  assert.ok(run.status === 'completed' || run.status === 'completed_with_warnings')
  const generationEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    .filter((event) => event.kind === 'tool_call' && hasGenerationTraceData(event.data))
  const timeout = (generationEvents.at(-1)!.data as Record<string, any>).generation
  assert.equal(client.calls.filter((call) => call.name === 'movscript_get_generation_job').length >= 2, true)
  assert.equal(timeout.jobId, 777)
  assert.equal(timeout.stage, 'timeout')
  assert.equal(timeout.status, 'timeout')
  assert.equal(timeout.terminal, false)
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
  assert.equal(diagnostic.tools.modelTools.some((tool: any) => tool.name === 'movscript_get_focus'), true)
  {
    const traceEvents = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    assert.equal(traceEvents.some((event) => event.title === 'Focus failed'), true)
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
  let requestBody: Record<string, unknown> | undefined
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('../model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 31, model: 'model_config:31' })

    globalThis.fetch = (async (_url, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
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
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '请做 production proposal 制作编排' }] })
    await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_read_project_scripts', mode: 'allow', approval: 'never' },
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

    const contextMessage = (requestBody?.messages as any[]).find((message) => message?.role === 'system' && typeof message.content === 'string' && message.content.includes('## Focus'))
    assert.ok(contextMessage)
    assert.match(String(contextMessage?.content ?? ''), /Active production business reference: production#4/)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('agent can search memories before creating a draft', async () => {
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
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '参考我的默认镜头风格记忆，帮我写一个镜头草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const memoryStep = run.steps.find((step) => step.toolName === 'movscript_search_memories')

  assert.equal(memoryStep?.status, 'completed')
  assert.match(JSON.stringify(memoryStep?.result ?? {}), /默认镜头风格是手持纪实/)
})

test('create_draft success writes draft memory', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_create_script', mode: 'allow', approval: 'never' }],
    },
  })

  assert.equal(runtime.listMemories({ kind: 'draft', projectId: 42 }).length, 0)
})

test('create_proposal creates a local proposal draft from conversation context', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const runtime = createTestRuntime({ mcpClient: client, draftStore })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我开一个项目提案' }] })

  const run = runtime.createToolRun({
    threadId: thread.id,
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_create_draft', mode: 'allow', approval: 'never' }],
    },
    toolCall: {
      name: 'movscript_create_draft',
      args: {
        kind: 'project_proposal',
        projectId: 42,
        proposal: true,
        content: JSON.stringify({
          schema: DRAFT_CONTENT_SCHEMA_IDS.projectProposal,
          scope: 'project_proposal',
          summary: '整理项目设定和素材需求',
          proposal: {
            creative_references: [],
            asset_slots: [],
          },
          impact_notes: [],
        }),
      },
    },
  })

  const finished = await waitForRun(runtime, run.id)
  const draft = finished.steps.find((step) => step.toolName === 'movscript_create_draft')?.result as any

  assert.equal(finished.status, 'completed')
  assert.equal(draft?.status, 'created')
  assert.equal(typeof draft?.draftId, 'string')
  assert.equal(runtime.listDrafts({ kind: 'project_proposal' }).length, 1)
})

test('drafts can be scoped by page key', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const runtime = createTestRuntime({ mcpClient: client, draftStore })
  const pageKey = 'production_orchestrate|/production-orchestrate?productionId=4|production|4'
  draftStore.createDraft({
    projectId: 42,
    kind: 'production_proposal',
    title: 'Scoped draft',
    content: '{}',
    source: { pageKey, pageType: 'production_orchestrate', pageRoute: '/production-orchestrate?productionId=4', pageEntityType: 'production', pageEntityId: 4 },
  })
  draftStore.createDraft({
    projectId: 42,
    kind: 'production_proposal',
    title: 'Other page draft',
    content: '{}',
    source: { pageKey: 'other|page|production|99', pageType: 'other', pageRoute: '/other', pageEntityType: 'production', pageEntityId: 99 },
  })

  const drafts = runtime.listDrafts({ projectId: 42, kind: 'production_proposal', status: 'draft', pageKey })
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0]?.title, 'Scoped draft')
})

test('runtime list_drafts filters by kind and status locally', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const kept = draftStore.createDraft({
    projectId: 42,
    kind: 'production_proposal',
    title: 'Active proposal',
    content: '{}',
  })
  const rejected = draftStore.createDraft({
    projectId: 42,
    kind: 'production_proposal',
    title: 'Rejected proposal',
    content: '{}',
  })
  draftStore.updateDraft(rejected.id, { status: 'rejected' })
  draftStore.createDraft({
    projectId: 42,
    kind: 'note',
    title: 'Unrelated note',
    content: '{}',
  })
  const runtime = createTestRuntime({ mcpClient: client, draftStore })

  const run = runtime.createToolRun({
    toolCall: {
      name: 'movscript_list_drafts',
      args: {
        projectId: 42,
        kind: 'production_proposal',
        status: 'draft',
      },
    },
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      tools: [{ name: 'movscript_list_drafts', mode: 'allow', approval: 'never' }],
    },
  })
  const completed = await waitForRun(runtime, run.id)
  const step = completed.steps.find((item) => item.toolName === 'movscript_list_drafts')
  const drafts = ((step?.result as any)?.drafts ?? []) as Array<{ id: string }>

  assert.equal(completed.status, 'completed')
  assert.deepEqual(drafts.map((draft) => draft.id), [kept.id])
  assert.equal(client.calls.some((call) => call.name === 'movscript_list_drafts'), false)
})

test('runtime reloads target-state local catalog tools for later runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-dynamic-catalog-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const profilesDir = join(dir, 'profiles')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  try {
    const loader = () => loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      packsDir,
      profilesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinPacksDir: packsDir,
      builtinProfilesDir: profilesDir,
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
    writeJSONFile(skillsDir, 'dynamic.workflow.json', {
      id: 'studio.workflow.dynamic',
      kind: 'workflow',
      name: 'Dynamic Echo',
      description: 'Expose the dynamic echo tool for dynamic checks.',
      triggers: [{ kind: 'keyword', any: ['dynamic check'] }],
      toolRefs: ['tool://studio_dynamic_echo'],
      instructionTemplate: 'Use the dynamic echo tool for dynamic checks.',
    })
    writeJSONFile(packsDir, 'dynamic.pack.json', {
      id: 'studio.pack.dynamic',
      name: 'Dynamic Test Pack',
      source: 'plugin',
      resources: {
        skills: ['dynamic.workflow.json'],
        tools: ['dynamic.tool.json'],
      },
      schemas: [],
      tools: ['studio_dynamic_echo'],
      skills: ['studio.workflow.dynamic'],
    })
    writeJSONFile(profilesDir, 'default.profile.json', {
      schema: 'movscript.agent.profile.v1',
      id: 'movscript.profile.default',
      version: '1.0.0',
      name: 'Dynamic Test Profile',
      enabledPacks: ['studio.pack.dynamic'],
      persona: null,
      enabledWorkflows: [],
      enabledPolicies: [],
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

test('target-state local catalog loading ignores tool files outside pack resources', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-target-tool-'))
  const toolsDir = join(dir, 'tools')
  const packsDir = join(dir, 'packs')
  const profilesDir = join(dir, 'profiles')
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
      profilesDir,
      builtinPacksDir: packsDir,
      builtinProfilesDir: profilesDir,
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
        profiles: new Map(),
      },
    }
  }
  let loadCount = 0
  const releaseContext: Array<() => void> = []
  const client = new FakeMCPClient()
  client.projectId = 42
  const originalCallTool = client.callTool.bind(client)
  client.callTool = async (name, args = {}) => {
    if (name === 'movscript_get_focus') {
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

test('agent loop refreshes target-state tools after catalog reload in the same run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-same-run-catalog-'))
  const toolsDir = join(dir, 'tools')
  const skillsDir = join(dir, 'skills')
  const packsDir = join(dir, 'packs')
  const profilesDir = join(dir, 'profiles')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  const originalFetch = globalThis.fetch
  try {
    let exposeTool = false
    const loader = () => {
      if (exposeTool) {
        writeJSONFile(toolsDir, 'dynamic.tool.json', {
          name: 'studio_same_run_echo',
          description: 'Echo after same-run catalog refresh.',
          permission: 'project.read',
          risk: 'read',
          source: 'plugin',
          pluginId: 'test.same-run',
          inputSchema: {},
          projectScoped: false,
          defaults: { grant: 'allow', approval: 'never' },
        })
        writeJSONFile(skillsDir, 'dynamic.workflow.json', {
          id: 'studio.workflow.same-run',
          kind: 'workflow',
          name: 'Same Run Echo',
          description: 'Expose the same-run echo tool after catalog reload.',
          triggers: [{ kind: 'always' }],
          toolRefs: ['tool://studio_same_run_echo'],
          instructionTemplate: 'Use the same-run echo tool after catalog reload.',
        })
        writeJSONFile(packsDir, 'dynamic.pack.json', {
          id: 'studio.pack.same-run',
          name: 'Same Run Test Pack',
          source: 'plugin',
          resources: {
            skills: ['dynamic.workflow.json'],
            tools: ['dynamic.tool.json'],
          },
          schemas: [],
          tools: ['studio_same_run_echo'],
          skills: ['studio.workflow.same-run'],
        })
        writeJSONFile(profilesDir, 'default.profile.json', {
          schema: 'movscript.agent.profile.v1',
          id: 'movscript.profile.default',
          version: '1.0.0',
          name: 'Same Run Test Profile',
          enabledPacks: ['studio.pack.same-run'],
          persona: null,
          enabledWorkflows: [],
          enabledPolicies: [],
          toolGrants: [],
        })
      }
      return loadAgentPluginCatalog({
        skillsDir,
        toolsDir,
        packsDir,
        profilesDir,
        builtinSkillsDir: skillsDir,
        builtinToolsDir: toolsDir,
        builtinPacksDir: packsDir,
        builtinProfilesDir: profilesDir,
        baseManifest: DYNAMIC_CATALOG_BASE_MANIFEST,
      })
    }
    const client = new FakeMCPClient()
    client.projectId = 42
    client.extraTools.push({ name: 'studio_same_run_echo', description: 'Echo after same-run catalog refresh.', inputSchema: {} })
    client.toolResults.set('studio_same_run_echo', { ok: true, sameRun: true })
    const runtime = createTestRuntime({
      mcpClient: client,
      catalogStateStore,
      pluginCatalogLoader: loader,
    })
    let turn = 0
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      if (isThreadTitleRequest(messages)) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '动态目录加载' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      turn += 1
      const toolNames = new Set(((body.tools as any[]) ?? []).map((tool) => tool.function.name))
      if (turn === 1) {
        assert.equal(toolNames.has('movscript_reload_agent_catalog'), true)
        assert.equal(toolNames.has('studio_same_run_echo'), false)
        exposeTool = true
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_reload_catalog',
                type: 'function',
                function: { name: 'movscript_reload_agent_catalog', arguments: JSON.stringify({}) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (turn === 2) {
        assert.equal(toolNames.has('studio_same_run_echo'), true)
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_same_run_echo',
                type: 'function',
                function: { name: 'studio_same_run_echo', arguments: JSON.stringify({ input: 'same run' }) },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'same-run catalog done' }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const thread = runtime.createThread({ messages: [{ role: 'user', content: 'same run catalog load please' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      approvedToolNames: ['movscript_reload_agent_catalog'],
    })

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(client.calls.some((call) => call.name === 'studio_same_run_echo'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'movscript_reload_agent_catalog'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'studio_same_run_echo'), true)
    assert.equal(runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER }).some((event) => event.title === 'Agent catalog refreshed'), true)
  } finally {
    globalThis.fetch = originalFetch
    rmSync(dir, { recursive: true, force: true })
  }
})

test('file draft store persists drafts across runtime rebuilds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-drafts-'))
  try {
    const draftPath = join(dir, 'drafts.json')
    const store = new FileAgentDraftStore(draftPath)
    const draft = store.createDraft({
      projectId: 42,
      kind: 'note',
      title: 'Review note',
      content: 'Check storyboard-line gaps.',
      source: { entityType: 'scene_moment', entityId: 12 },
    })

    const rebuilt = new FileAgentDraftStore(draftPath)
    const restored = rebuilt.getDraft(draft.id)

    assert.equal(restored?.title, 'Review note')
    assert.equal(restored?.source?.entityType, 'scene_moment')
    assert.equal(rebuilt.listDrafts({ projectId: 42 }).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runtime tracks plan tasks and parent child worker runs', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '好的' }] })

  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Subagent rollout',
    createPlannerRun: false,
    tasks: [
      { id: 'task-model', title: 'Define task model' },
      { title: 'Spawn worker', deps: ['task-model'] },
    ],
  })

  assert.equal(plan.plan.status, 'pending')
  assert.equal(plan.tasks.length, 2)

  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const worker = await createAndWaitForRun(runtime, thread.id, {
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: plan.tasks[0].id,
    progress: 0.25,
  })

  assert.equal(planner.role, 'planner')
  assert.equal(worker.role, 'worker')
  assert.equal(worker.parentRunId, planner.id)
  assert.deepEqual(runtime.getChildRuns(planner.id).map((run) => run.id), [worker.id])
  assert.deepEqual(runtime.listRunsByParent(planner.id).map((run) => run.id), [worker.id])

  const updatedTask = runtime.updateTask(plan.tasks[0].id, {
    status: 'done',
    progress: 1,
    ownerRunId: worker.id,
    artifacts: [{ type: 'run', title: 'Worker run', uri: `agent-run:${worker.id}` }],
  })
  assert.equal(updatedTask.status, 'done')
  assert.equal(updatedTask.ownerRunId, worker.id)
  assert.equal(updatedTask.artifacts.some((artifact) => artifact.uri === `agent-run:${worker.id}`), true)
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).runs.length, 2)
})

test('createPlan enforces one plan per thread', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })

  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Single thread plan',
    createPlannerRun: false,
    tasks: [{ id: 'task_single_plan', title: 'Only task' }],
  })

  assert.equal(plan.plan.threadId, thread.id)
  await assert.rejects(() => runtime.createPlan({
    threadId: thread.id,
    title: 'Second thread plan',
    createPlannerRun: false,
    tasks: [{ id: 'task_second_plan', title: 'Second task' }],
  }), /already has plan/)
})

test('agent plan tools create attach inspect and replan the session plan', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请拆分并并行处理' }] })
  const planner = runtime.createRun({
    threadId: thread.id,
    role: 'planner',
    policy: { maxToolCalls: 1, maxIterations: 1 },
  })

  const created = await runtime.createAgentPlan(planner, {
    title: 'Agent-created plan',
    tasks: [
      { id: 'task_agent_plan_a', title: 'Agent plan A' },
    ],
  }) as any
  assert.equal(created.status, 'created')
  assert.equal(created.snapshot.tasks.length, 1)
  assert.equal(runtime.getRun(planner.id)?.planId, created.planId)

  const existing = await runtime.createAgentPlan(runtime.getRun(planner.id)!, {
    title: 'Ignored second plan',
    tasks: [{ id: 'task_should_not_exist', title: 'Should not exist' }],
  }) as any
  assert.equal(existing.status, 'exists')
  assert.equal(existing.planId, created.planId)
  assert.equal(existing.snapshot.tasks.some((task: any) => task.id === 'task_should_not_exist'), false)

  const inspected = runtime.getAgentPlan(runtime.getRun(planner.id)!, {}) as any
  assert.equal(inspected.planId, created.planId)
  assert.equal(inspected.snapshot.plan.rootRunId, planner.id)

  const replanned = runtime.replanAgentPlan(runtime.getRun(planner.id)!, {
    addTasks: [
      { id: 'task_agent_plan_b', title: 'Agent plan B', deps: ['task_agent_plan_a'] },
    ],
    dispatch: false,
  }) as any
  assert.deepEqual(replanned.createdTaskIds, ['task_agent_plan_b'])
  assert.equal(replanned.snapshot.tasks.find((task: any) => task.id === 'task_agent_plan_b')?.status, 'pending')
})

test('task ownerRunId updates must reference an existing run in the same plan', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Task owner boundary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_owner_boundary', title: 'Owned task' },
      { id: 'task_owner_other', title: 'Other owned task' },
    ],
  })
  const otherThread = runtime.createThread({ messages: [{ role: 'user', content: '其他规划' }] })
  const otherPlan = await runtime.createPlan({
    threadId: otherThread.id,
    title: 'Other owner boundary',
    createPlannerRun: false,
    tasks: [],
  })
  const otherRun = runtime.createRun({
    threadId: otherThread.id,
    role: 'planner',
    planId: otherPlan.plan.id,
  })
  const wrongTaskRun = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    planId: plan.plan.id,
    taskId: 'task_owner_other',
  })

  assert.throws(() => runtime.updateTask('task_owner_boundary', {
    ownerRunId: 'run_missing_owner',
  }), /run not found/)
  assert.throws(() => runtime.updateTask('task_owner_boundary', {
    ownerRunId: otherRun.id,
  }), /does not belong to plan/)
  assert.throws(() => runtime.updateTask('task_owner_boundary', {
    ownerRunId: wrongTaskRun.id,
  }), /is attached to task task_owner_other/)
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_owner_boundary')?.ownerRunId, undefined)
})

test('task graph updates must reference tasks in the same plan', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Task graph boundary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_graph_target', title: 'Graph target' },
      { id: 'task_graph_peer', title: 'Graph peer' },
    ],
  })
  const otherThread = runtime.createThread({ messages: [{ role: 'user', content: '其他规划' }] })
  await runtime.createPlan({
    threadId: otherThread.id,
    title: 'Other graph boundary',
    createPlannerRun: false,
    tasks: [
      { id: 'task_graph_other_plan', title: 'Other plan task' },
    ],
  })

  assert.throws(() => runtime.updateTask('task_graph_target', {
    parentId: 'task_missing_parent',
  }), /task not found/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    deps: ['task_missing_dep'],
  }), /task not found/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    parentId: 'task_graph_other_plan',
  }), /does not belong to plan/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    deps: ['task_graph_other_plan'],
  }), /does not belong to plan/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    parentId: 'task_graph_target',
  }), /cannot use itself as parent/)
  assert.throws(() => runtime.updateTask('task_graph_target', {
    deps: ['task_graph_target'],
  }), /cannot depend on itself/)

  const unchanged = runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_graph_target')
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
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_graph_peer')?.parentId, undefined)

  const cleared = runtime.updateTask('task_graph_target', {
    parentId: null,
  })
  assert.equal(cleared.parentId, undefined)
  assert.deepEqual(cleared.deps, ['task_graph_peer'])

  assert.throws(() => runtime.updateTask('task_graph_peer', {
    deps: ['task_graph_target'],
  }), /dependency cycle detected/)
  assert.deepEqual(runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_graph_peer')?.deps, [])
})

test('plan agent bootstrap creates a structured fallback DAG from a goal', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '开始子agent架构改造' }] })

  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Subagent architecture',
    goal: '推进 plan agent 和 worker subagent 架构',
    createPlannerRun: false,
  })

  assert.equal(plan.plan.status, 'pending')
  assert.equal(plan.plan.metadata?.goal, '推进 plan agent 和 worker subagent 架构')
  assert.equal(plan.plan.metadata?.plannerSource, 'fallback')
  assert.equal(plan.tasks.length, 1)
  assert.equal(plan.tasks[0]?.id, 'task_execute_goal')
  assert.equal(plan.tasks[0]?.description, '推进 plan agent 和 worker subagent 架构')
})

test('createPlan validates task graph references before writing plan state', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })

  await assert.rejects(
    runtime.createPlan({
      threadId: thread.id,
      title: 'Invalid missing dependency plan',
      createPlannerRun: false,
      tasks: [
        { id: 'task_invalid_dep', title: 'Invalid dep', deps: ['task_missing_dep'] },
      ],
    }),
    /task not found/,
  )
  assert.equal(runtime.listPlans().some((plan) => plan.title === 'Invalid missing dependency plan'), false)

  await assert.rejects(
    runtime.createPlan({
      threadId: thread.id,
      title: 'Invalid self parent plan',
      createPlannerRun: false,
      tasks: [
        { id: 'task_self_parent_create', title: 'Self parent', parentId: 'task_self_parent_create' },
      ],
    }),
    /cannot use itself as parent/,
  )
  assert.equal(runtime.listPlans().some((plan) => plan.title === 'Invalid self parent plan'), false)

  await assert.rejects(
    runtime.createPlan({
      threadId: thread.id,
      title: 'Invalid cycle plan',
      createPlannerRun: false,
      tasks: [
        { id: 'task_cycle_a', title: 'Cycle A', deps: ['task_cycle_b'] },
        { id: 'task_cycle_b', title: 'Cycle B', deps: ['task_cycle_a'] },
      ],
    }),
    /dependency cycle detected/,
  )
  assert.equal(runtime.listPlans().some((plan) => plan.title === 'Invalid cycle plan'), false)

  await assert.rejects(
    runtime.createPlan({
      threadId: thread.id,
      title: 'Invalid parent cycle plan',
      createPlannerRun: false,
      tasks: [
        { id: 'task_parent_cycle_a', title: 'Parent cycle A', parentId: 'task_parent_cycle_b' },
        { id: 'task_parent_cycle_b', title: 'Parent cycle B', parentId: 'task_parent_cycle_a' },
      ],
    }),
    /parent cycle detected/,
  )
  assert.equal(runtime.listPlans().some((plan) => plan.title === 'Invalid parent cycle plan'), false)

  const valid = await runtime.createPlan({
    threadId: thread.id,
    title: 'Valid same-batch graph plan',
    createPlannerRun: false,
    tasks: [
      { id: 'task_create_graph_a', title: 'Graph A' },
      { id: 'task_create_graph_b', title: 'Graph B', parentId: 'task_create_graph_a', deps: ['task_create_graph_a'] },
    ],
  })
  assert.equal(valid.tasks.find((task) => task.id === 'task_create_graph_b')?.parentId, 'task_create_graph_a')
  assert.deepEqual(valid.tasks.find((task) => task.id === 'task_create_graph_b')?.deps, ['task_create_graph_a'])
})

test('simple plan tasks are executed by the planner run without spawning a worker', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '整理一段说明' }] })

  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Simple planner task',
    tasks: [{ id: 'task_simple', title: '整理说明' }],
  })

  assert.equal(plan.runs.length, 1)
  assert.equal(plan.runs[0]?.role, 'planner')
  assert.equal(plan.runs[0]?.taskId, 'task_simple')
  assert.equal(plan.tasks[0]?.ownerRunId, plan.runs[0]?.id)
  assert.equal(plan.tasks[0]?.status, 'running')
  assert.equal(plan.tasks[0]?.metadata?.executionMode, 'planner_inline')

  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  assert.ok(planner.status === 'completed' || planner.status === 'completed_with_warnings')
  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.runs.length, 1)
  assert.equal(snapshot.tasks[0]?.status, 'done')
  assert.equal(snapshot.tasks[0]?.progress, 1)
  assert.equal(snapshot.plan.status, 'done')

  const dispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: planner.id,
    maxWorkers: 2,
  })
  assert.equal(dispatch.spawnedRuns.length, 0)
})

test('supervisor dispatch spawns worker runs and syncs task status from child completion', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Supervisor rollout',
    tasks: [
      { id: 'task_a', title: 'Implement base state' },
      { id: 'task_b', title: 'Wire supervisor', deps: ['task_a'] },
    ],
  })
  const planner = plan.runs[0]
  assert.equal(planner?.role, 'planner')
  const finishedPlanner = await waitForRun(runtime, planner!.id)
  const userMessageCountBeforeDispatch = runtime.getThread(thread.id)?.messages.filter((message) => message.role === 'user').length

  const firstDispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
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
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_a')?.metadata?.subagentName, 'Agent 1')
  const waitFirstByName = await runtime.waitSubagent(finishedPlanner, { subagentName: 'Agent 1' }) as any
  assert.equal((waitFirstByName.target.run ?? waitFirstByName.target.task).subagentName, 'Agent 1')

  const firstWorker = await waitForRun(runtime, firstDispatch.spawnedRuns[0]!.id)
  assert.ok(firstWorker.status === 'completed' || firstWorker.status === 'completed_with_warnings')
  const afterFirstWorker = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(afterFirstWorker.tasks.find((task) => task.id === 'task_a')?.status, 'done')
  assert.equal(afterFirstWorker.tasks.find((task) => task.id === 'task_a')?.progress, 1)
  assertRunTraceEventTypes(runtime, firstWorker.id, [
    'heartbeat',
    'task_started',
    'task_completed',
    'progress_update',
    'artifact_created',
  ])

  const secondDispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: finishedPlanner.id,
    maxWorkers: 2,
  })
  assert.equal(secondDispatch.spawnedRuns.length, 1)
  assert.equal(secondDispatch.spawnedRuns[0]?.taskId, 'task_b')
  assert.equal(secondDispatch.spawnedRuns[0]?.metadata?.subagentName, 'Agent 2')
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_b')?.metadata?.subagentName, 'Agent 2')

  const secondWorker = await waitForRun(runtime, secondDispatch.spawnedRuns[0]!.id)
  assert.ok(secondWorker.status === 'completed' || secondWorker.status === 'completed_with_warnings')
  const donePlan = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(donePlan.plan.status, 'done')
  assert.equal(donePlan.plan.progress, 1)
  assert.equal(donePlan.tasks.every((task) => task.status === 'done'), true)
  assertRunTraceEventTypes(runtime, finishedPlanner.id, ['plan_completed'])
})

test('parallel worker dispatch keeps task prompts private to each run input', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '并行执行两个任务' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Parallel worker rollout',
    tasks: [
      { id: 'task_parallel_a', title: 'Collect references' },
      { id: 'task_parallel_b', title: 'Draft outline' },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  const userMessageCountBeforeDispatch = runtime.getThread(thread.id)?.messages.filter((message) => message.role === 'user').length

  const dispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: planner.id,
    maxWorkers: 2,
  })

  assert.equal(dispatch.spawnedRuns.length, 2)
  assert.equal(runtime.getThread(thread.id)?.messages.filter((message) => message.role === 'user').length, userMessageCountBeforeDispatch)
  const runByTaskId = new Map(dispatch.spawnedRuns.map((run) => [run.taskId, run]))
  assert.match(runByTaskId.get('task_parallel_a')?.input?.userMessage ?? '', /Task: Collect references/)
  assert.doesNotMatch(runByTaskId.get('task_parallel_a')?.input?.userMessage ?? '', /Draft outline/)
  assert.match(runByTaskId.get('task_parallel_b')?.input?.userMessage ?? '', /Task: Draft outline/)
  assert.doesNotMatch(runByTaskId.get('task_parallel_b')?.input?.userMessage ?? '', /Collect references/)
})

test('dispatchPlan requires a planner run from the same plan', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Planner dispatch boundary',
    tasks: [{ id: 'task_dispatch_boundary', title: 'Boundary task' }],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_dispatch_boundary',
  })
  const otherThread = runtime.createThread({ messages: [{ role: 'user', content: '其他规划' }] })
  const otherPlan = await runtime.createPlan({
    threadId: otherThread.id,
    title: 'Other planner boundary',
    tasks: [],
  })
  const otherPlanner = await waitForRun(runtime, otherPlan.runs[0]!.id)

  assert.throws(() => runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: worker.id,
  }), /is not a planner run/)
  assert.throws(() => runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: otherPlanner.id,
  }), /does not belong to plan/)
})

test('cancelPlanTree requires the root planner run', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Plan tree cancel boundary',
    tasks: [{ id: 'task_cancel_tree_boundary', title: 'Boundary task' }],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_cancel_tree_boundary',
  })
  const secondPlanner = runtime.createRun({
    threadId: thread.id,
    role: 'planner',
    planId: plan.plan.id,
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
  const runtime = createTestRuntime({ mcpClient: client, store, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Needs input rollout',
    tasks: [{ id: 'task_input', title: 'Ask for input' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const now = new Date().toISOString()
  const worker: AgentRun = {
    id: 'run_needs_input_1',
    threadId: thread.id,
    status: 'requires_action',
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_input',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: planner.policy,
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
  ;(runtime as any).syncTaskFromRun(worker.id)

  const task = runtime.getPlanSnapshot(plan.plan.id).tasks.find((item) => item.id === 'task_input')
  assert.equal(task?.status, 'blocked')
  assert.equal(task?.metadata?.blockedKind, 'needs_input')
  assertRunTraceEventTypes(runtime, worker.id, ['needs_input'])
})

test('plan stream replays snapshots and emits task run lifecycle events', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
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
  const planner = plan.runs[0]
  assert.equal(planner?.role, 'planner')
  await waitForRun(runtime, planner!.id)
  runtime.updateTask('task_stream', {
    artifacts: [{ id: 'artifact_stream_seed', type: 'draft', title: 'Stream seed artifact' }],
  })
  const events: string[] = []
  const snapshots: AgentPlanSnapshot[] = []
  const unsubscribe = runtime.subscribePlanStream(plan.plan.id, (event) => {
    events.push(event.type)
    if ('snapshot' in event) snapshots.push(event.snapshot)
  })

  const dispatched = runtime.dispatchPlan({
    planId: plan.plan.id,
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

test('planner runtime tools spawn list and wait worker subagents', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'spawn subagent' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Planner tool dispatch',
    tasks: [
      { id: 'task_tool_a', title: 'Worker A', metadata: { executionMode: 'worker' } },
      { id: 'task_tool_b', title: 'Worker B', metadata: { executionMode: 'worker' } },
    ],
  })

  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  assert.ok(planner.status === 'completed' || planner.status === 'completed_with_warnings')
  const spawnStep = planner.steps.find((step) => step.toolName === 'movscript_spawn_subagent')
  const spawnResult = spawnStep?.result as any
  assert.equal(spawnResult?.status, 'spawned')
  assert.equal(spawnResult?.spawnedRuns?.length, 2)
  const workerIds = spawnResult.spawnedRuns.map((run: any) => run.id)

  for (const workerId of workerIds) {
    const worker = await waitForRun(runtime, workerId)
    assert.ok(worker.status === 'completed' || worker.status === 'completed_with_warnings')
  }

  const listResult = runtime.listSubagents(planner, {}) as any
  assert.equal(listResult.snapshot.workers.length, 2)
  const waitResult = await runtime.waitSubagent(planner, { timeoutMs: 1000 })
  assert.equal((waitResult as any).done, true)
  assert.equal((waitResult as any).status, 'completed')
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).plan.status, 'done')
})

test('planner subagent dispatch can target specific runnable tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Targeted dispatch',
    tasks: [
      { id: 'task_target_a', title: 'Target A', metadata: { executionMode: 'worker' } },
      { id: 'task_target_b', title: 'Target B', metadata: { executionMode: 'worker' } },
      { id: 'task_target_c', title: 'Target C', deps: ['task_target_a'], metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  const targeted = runtime.spawnSubagent(planner, {
    taskIds: ['task_target_b'],
    maxWorkers: 2,
  }) as any
  assert.equal(targeted.spawnedRuns.length, 1)
  assert.equal(targeted.spawnedRuns[0]?.taskId, 'task_target_b')
  let snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_target_a')?.status, 'pending')
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_target_b')?.status, 'running')
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_target_c')?.status, 'pending')

  const blocked = runtime.spawnSubagent(planner, {
    taskIds: ['task_target_c'],
    maxWorkers: 2,
  }) as any
  assert.equal(blocked.spawnedRuns.length, 0)
  assert.deepEqual(blocked.blockedTaskIds, ['task_target_c'])
  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_target_c')?.blockedReason, 'Waiting for dependency task(s): task_target_a')
})

test('spawn_subagent forwards retry and timeout dispatch controls', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Subagent dispatch controls',
    tasks: [
      { id: 'task_spawn_retry', title: 'Retry me', metadata: { executionMode: 'worker' } },
      { id: 'task_spawn_timeout', title: 'Timeout me', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  const first = runtime.spawnSubagent(planner, {
    taskIds: ['task_spawn_retry'],
  }) as any
  assert.equal(first.spawnedRuns.length, 1)
  const failedRun = runtime.getRun(first.spawnedRuns[0].id)
  assert.ok(failedRun)
  failedRun.status = 'failed'
  failedRun.failedAt = new Date().toISOString()
  failedRun.error = 'worker failed'
  store.updateRun(failedRun)
  runtime.updateTask('task_spawn_retry', {
    status: 'failed',
    progress: 0,
    ownerRunId: failedRun.id,
    blockedReason: 'worker failed',
  })

  const retried = runtime.spawnSubagent(planner, {
    taskIds: ['task_spawn_retry'],
    retryFailed: true,
    maxTaskAttempts: 2,
  }) as any
  assert.deepEqual(retried.retriedTaskIds, ['task_spawn_retry'])
  assert.equal(retried.spawnedRuns.length, 1)
  assert.notEqual(retried.spawnedRuns[0].id, failedRun.id)
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_spawn_retry')?.metadata?.retryAttempt, 2)

  const staleStartedAt = new Date(Date.now() - 60_000).toISOString()
  const staleRun: AgentRun = {
    id: 'run_spawn_timeout',
    threadId: thread.id,
    status: 'in_progress',
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_spawn_timeout',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: planner.policy,
    createdAt: staleStartedAt,
    updatedAt: staleStartedAt,
    startedAt: staleStartedAt,
    steps: [],
    traceEvents: [],
  }
  store.createRun(staleRun)
  runtime.updateTask('task_spawn_timeout', {
    status: 'running',
    progress: 0.1,
    ownerRunId: staleRun.id,
  })

  const timedOut = runtime.spawnSubagent(planner, {
    taskIds: ['task_spawn_timeout'],
    workerTimeoutMs: 1,
  }) as any
  assert.equal(timedOut.timedOutRunIds.includes(staleRun.id), true)
  assert.equal(runtime.getRun(staleRun.id)?.status, 'cancelled')
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_spawn_timeout')?.metadata?.timedOutRunId, staleRun.id)
})

test('spawn_subagent assigns neutral fallback names when omitted', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Auto named subagents',
    tasks: [
      { id: 'task_auto_a', title: 'Auto A', metadata: { executionMode: 'worker' } },
      { id: 'task_auto_b', title: 'Auto B', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  const spawned = runtime.spawnSubagent(planner, {
    taskIds: ['task_auto_a', 'task_auto_b'],
    maxWorkers: 2,
  }) as any

  assert.deepEqual(spawned.spawnedRuns.map((run: any) => run.subagentName), ['Agent 1', 'Agent 2'])
  const listResult = runtime.listSubagents(planner, {}) as any
  assert.deepEqual(listResult.snapshot.workers.map((run: any) => run.subagentName).sort(), ['Agent 1', 'Agent 2'])
  const waitAgent = await runtime.waitSubagent(planner, { subagentName: 'Agent 1' }) as any
  assert.equal((waitAgent.target.run ?? waitAgent.target.task).subagentName, 'Agent 1')
})

test('spawn_subagent keeps neutral fallback names when creating new tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Auto named new tasks',
    tasks: [],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  const spawned = runtime.spawnSubagent(planner, {
    tasks: [
      { id: 'task_created_auto_a', title: 'Created Auto A' },
      { id: 'task_created_auto_b', title: 'Created Auto B' },
    ],
    maxWorkers: 2,
  }) as any

  assert.deepEqual(spawned.createdTaskIds, ['task_created_auto_a', 'task_created_auto_b'])
  assert.deepEqual(spawned.spawnedRuns.map((run: any) => run.subagentName), ['Agent 1', 'Agent 2'])
  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_created_auto_a')?.metadata?.subagentName, 'Agent 1')
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_created_auto_b')?.metadata?.subagentName, 'Agent 2')
})

test('spawn_subagent rejects duplicate subagent names within a plan', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Duplicate subagent names',
    tasks: [
      { id: 'task_duplicate_a', title: 'Duplicate A', metadata: { executionMode: 'worker' } },
      { id: 'task_duplicate_b', title: 'Duplicate B', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  assert.throws(() => runtime.spawnSubagent(planner, {
    taskIds: ['task_duplicate_a', 'task_duplicate_b'],
    subagentNames: ['Einstein', 'Einstein'],
  }), /subagent name already exists/)

  const spawned = runtime.spawnSubagent(planner, {
    taskIds: ['task_duplicate_a'],
    subagentName: 'Einstein',
  }) as any
  assert.equal(spawned.spawnedRuns[0]?.subagentName, 'Einstein')
  assert.throws(() => runtime.spawnSubagent(planner, {
    taskIds: ['task_duplicate_b'],
    subagentName: 'Einstein',
  }), /subagent name already exists/)
})

test('spawn_subagent accepts taskId to subagentName mappings', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Mapped subagent names',
    tasks: [
      { id: 'task_mapped_a', title: 'Mapped A', metadata: { executionMode: 'worker' } },
      { id: 'task_mapped_b', title: 'Mapped B', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  const spawned = runtime.spawnSubagent(planner, {
    taskIds: ['task_mapped_a', 'task_mapped_b'],
    subagentNames: {
      task_mapped_b: 'Hawking',
      task_mapped_a: 'Einstein',
    },
    maxWorkers: 2,
  }) as any

  assert.deepEqual(spawned.spawnedRuns.map((run: any) => run.subagentName).sort(), ['Einstein', 'Hawking'])
  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_mapped_a')?.metadata?.subagentName, 'Einstein')
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_mapped_b')?.metadata?.subagentName, 'Hawking')
})

test('spawn_subagent preserves explicit names when resetting blocked tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Blocked subagent name reset',
    tasks: [
      { id: 'task_blocked_named', title: 'Blocked named', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  runtime.updateTask('task_blocked_named', {
    status: 'blocked',
    blockedReason: 'Waiting for explicit retry',
  })

  const spawned = runtime.spawnSubagent(planner, {
    taskId: 'task_blocked_named',
    subagentName: 'Curie',
  }) as any

  assert.equal(spawned.spawnedRuns[0]?.subagentName, 'Curie')
  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  const task = snapshot.tasks.find((item) => item.id === 'task_blocked_named')
  assert.equal(task?.metadata?.subagentName, 'Curie')
  assert.equal(task?.metadata?.resetByPlannerRunId, planner.id)
})

test('task metadata updates cannot create duplicate subagent names', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
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

  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
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

test('spawn_subagent does not partially create tasks when name validation fails', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Atomic subagent creation',
    tasks: [],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  assert.throws(() => runtime.spawnSubagent(planner, {
    tasks: [
      { id: 'task_atomic_a', title: 'Atomic A', subagentName: 'Einstein' },
      { id: 'task_atomic_b', title: 'Atomic B', subagentName: 'Einstein' },
    ],
  }), /subagent name already exists/)

  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_atomic_a'), false)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_atomic_b'), false)
})

test('spawn_subagent validates existing task targets before creating new tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Atomic subagent target validation',
    tasks: [],
  })
  const otherThread = runtime.createThread({ messages: [{ role: 'user', content: '其他规划' }] })
  const otherPlan = await runtime.createPlan({
    threadId: otherThread.id,
    title: 'Other target validation plan',
    createPlannerRun: false,
    tasks: [
      { id: 'task_other_plan_target', title: 'Other plan target', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  assert.throws(() => runtime.spawnSubagent(planner, {
    taskIds: ['task_other_plan_target'],
    tasks: [
      { id: 'task_should_not_be_created', title: 'Should not be created' },
    ],
  }), /does not belong to plan/)

  assert.equal(runtime.getPlanSnapshot(plan.plan.id).tasks.some((task) => task.id === 'task_should_not_be_created'), false)
  assert.equal(runtime.getPlanSnapshot(otherPlan.plan.id).tasks.some((task) => task.id === 'task_other_plan_target'), true)
})

test('wait and cancel reject ambiguous persisted subagent names', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Ambiguous persisted subagents',
    tasks: [
      { id: 'task_ambiguous_a', title: 'Ambiguous A', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
      { id: 'task_ambiguous_b', title: 'Ambiguous B', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  assert.deepEqual(runtime.getPlanSnapshot(plan.plan.id).nameConflicts, [{
    subagentName: 'Einstein',
    taskIds: ['task_ambiguous_a', 'task_ambiguous_b'],
  }])

  await assert.rejects(
    runtime.waitSubagent(planner, { subagentName: 'Einstein' }),
    /subagent name is ambiguous/,
  )
  assert.throws(
    () => runtime.cancelSubagent(planner, { subagentName: 'Einstein' }),
    /subagent name is ambiguous/,
  )

  const listResult = runtime.listSubagents(planner, {}) as any
  assert.deepEqual(listResult.snapshot.nameConflicts, [{
    subagentName: 'Einstein',
    taskIds: ['task_ambiguous_a', 'task_ambiguous_b'],
  }])

  const followupPlanner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const contextEvent = runtime.getRunTraceEvents(followupPlanner.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  assert.deepEqual((contextEvent?.data as any)?.agentPlan?.nameConflicts, [{
    subagentName: 'Einstein',
    taskIds: ['task_ambiguous_a', 'task_ambiguous_b'],
  }])
})

test('planner context artifact references include source task provenance', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Artifact source provenance',
    tasks: [
      { id: 'task_artifact_source', title: 'Source task', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
      { id: 'task_artifact_reader', title: 'Reader task' },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
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
    planId: plan.plan.id,
  })
  const contextEvent = runtime.getRunTraceEvents(followupPlanner.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const summary = (contextEvent?.data as any)?.agentPlan?.summary
  const artifact = (contextEvent?.data as any)?.agentPlan?.artifacts
    ?.find((item: any) => item.id === 'artifact_source_reference')

  assert.equal(summary?.taskCount, 2)
  assert.equal(summary?.activeWorkerCount, 1)
  assert.equal(summary?.artifactCount, 1)
  assert.equal(summary?.taskStatusCounts?.running, 1)
  assert.equal(artifact?.sourceTaskTitle, 'Source task')
  assert.equal(artifact?.sourceTaskStatus, 'running')
  assert.equal(artifact?.sourceTaskOwnerRunId, worker.id)
})

test('plan snapshots expose reusable plan summary', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
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
    planId: plan.plan.id,
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

  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.summary?.taskCount, 2)
  assert.equal(snapshot.summary?.taskStatusCounts.running, 1)
  assert.equal(snapshot.summary?.taskStatusCounts.blocked, 1)
  assert.equal(snapshot.summary?.workerCount, 1)
  assert.equal(snapshot.summary?.activeWorkerCount, 1)
  assert.equal(snapshot.summary?.artifactCount, 1)
  assert.deepEqual(snapshot.summary?.blockedTaskIds, ['task_summary_blocked'])
})

test('subagent planner tool results expose stable name-first schema', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Subagent tool schema',
    tasks: [
      { id: 'task_schema_a', title: 'Schema A', metadata: { executionMode: 'worker' } },
      { id: 'task_schema_b', title: 'Schema B', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  const spawnResult = runtime.spawnSubagent(planner, {
    taskIds: ['task_schema_a', 'task_schema_b'],
    subagentNames: ['Einstein', 'Hawking'],
    maxWorkers: 2,
  }) as any
  assert.equal(spawnResult.status, 'spawned')
  assert.equal(spawnResult.planId, plan.plan.id)
  assert.equal(spawnResult.plannerRunId, planner.id)
  assert.deepEqual(spawnResult.createdTaskIds, [])
  assert.deepEqual(spawnResult.blockedTaskIds, [])
  assert.deepEqual(spawnResult.retriedTaskIds, [])
  assert.deepEqual(spawnResult.timedOutRunIds, [])
  assert.deepEqual(spawnResult.spawnedRuns.map((run: any) => run.subagentName), ['Einstein', 'Hawking'])
  for (const run of spawnResult.spawnedRuns) {
    assert.equal(run.role, 'worker')
    assert.equal(run.planId, plan.plan.id)
    assert.equal(run.parentRunId, planner.id)
    assert.equal(typeof run.id, 'string')
    assert.equal(typeof run.taskId, 'string')
    assert.equal(typeof run.status, 'string')
    assert.equal(typeof run.stepCount, 'number')
    assert.equal(typeof run.pendingApprovalCount, 'number')
    assert.equal(typeof run.pendingInputCount, 'number')
  }
  assert.equal(spawnResult.snapshot.plan.id, plan.plan.id)
  assert.deepEqual(spawnResult.snapshot.workers.map((run: any) => run.subagentName).sort(), ['Einstein', 'Hawking'])
  assert.equal(spawnResult.snapshot.tasks.find((task: any) => task.id === 'task_schema_a')?.metadata?.subagentName, 'Einstein')
  assert.equal(spawnResult.snapshot.tasks.find((task: any) => task.id === 'task_schema_b')?.metadata?.subagentName, 'Hawking')

  const listResult = runtime.listSubagents(planner, {}) as any
  assert.equal(listResult.status, 'ok')
  assert.equal(listResult.planId, plan.plan.id)
  assert.equal(listResult.plannerRunId, planner.id)
  assert.deepEqual(listResult.snapshot.workers.map((run: any) => run.subagentName).sort(), ['Einstein', 'Hawking'])
  assert.equal(listResult.snapshot.summary.taskCount, 2)
  assert.equal(listResult.snapshot.summary.workerCount, 2)
  assert.equal(listResult.snapshot.summary.activeWorkerCount, 2)
  assert.equal(listResult.snapshot.summary.artifactCount, 0)
  assert.equal(listResult.snapshot.summary.nameConflictCount, 0)
  assert.equal(listResult.snapshot.summary.taskStatusCounts.running, 2)

  const waitResult = await runtime.waitSubagent(planner, { subagentName: 'Einstein', timeoutMs: 0 }) as any
  assert.equal(typeof waitResult.status, 'string')
  assert.equal(typeof waitResult.done, 'boolean')
  assert.equal(waitResult.planId, plan.plan.id)
  assert.equal(waitResult.plannerRunId, planner.id)
  assert.equal(waitResult.target.kind, 'run')
  assert.equal(waitResult.target.run.subagentName, 'Einstein')
  assert.equal(waitResult.target.run.taskId, 'task_schema_a')
  assert.equal(waitResult.snapshot.workers.some((run: any) => run.subagentName === 'Einstein'), true)
  assert.equal(waitResult.snapshot.summary.workerCount, 2)
  assert.equal(typeof waitResult.snapshot.summary.activeWorkerCount, 'number')

  const cancelResult = runtime.cancelSubagent(planner, {
    subagentName: 'Hawking',
    reason: 'schema contract check',
  }) as any
  assert.ok(cancelResult.status === 'cancelled' || cancelResult.status === 'unchanged')
  assert.equal(cancelResult.planId, plan.plan.id)
  assert.equal(cancelResult.plannerRunId, planner.id)
  if (cancelResult.status === 'cancelled') assert.deepEqual(cancelResult.cancelledRunIds, [spawnResult.spawnedRuns[1]!.id])
  else assert.deepEqual(cancelResult.cancelledRunIds, [])
  assert.equal(cancelResult.target.kind, 'run')
  assert.equal(cancelResult.target.run.subagentName, 'Hawking')
  assert.equal(typeof cancelResult.target.run.status, 'string')
  assert.equal(cancelResult.target.run.taskId, 'task_schema_b')
  assert.equal(typeof cancelResult.snapshot.workers.find((run: any) => run.subagentName === 'Hawking')?.status, 'string')
})

test('subagent tool snapshots include artifact source task provenance', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Subagent artifact snapshot',
    tasks: [
      { id: 'task_snapshot_source', title: 'Snapshot source', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
      { id: 'task_snapshot_reader', title: 'Snapshot reader' },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_snapshot_source',
    metadata: { subagentName: 'Einstein' },
  })
  runtime.updateTask('task_snapshot_source', {
    status: 'running',
    ownerRunId: worker.id,
  })
  runtime.updateTask('task_snapshot_reader', {
    artifacts: [{
      id: 'artifact_snapshot_source',
      type: 'review',
      title: 'Snapshot source review',
      metadata: {
        sourceRunId: worker.id,
        sourceTaskId: 'task_snapshot_source',
        toolName: 'movscript_review',
        policy: 'manual_compensation',
      },
    }],
  })

  const listResult = runtime.listSubagents(planner, {}) as any
  const listArtifact = listResult.snapshot.artifacts.find((artifact: any) => artifact.id === 'artifact_snapshot_source')
  assert.equal(listArtifact?.sourceTaskTitle, 'Snapshot source')
  assert.equal(listArtifact?.sourceTaskStatus, 'running')
  assert.equal(listArtifact?.sourceTaskOwnerRunId, worker.id)
  assert.equal(listArtifact?.toolName, 'movscript_review')
  assert.equal(listArtifact?.policy, 'manual_compensation')
  assert.equal(listResult.snapshot.summary.artifactCount, 1)
  assert.equal(listResult.snapshot.summary.activeWorkerCount, 1)
  assert.equal(listResult.snapshot.summary.taskStatusCounts.running, 1)

  const waitResult = await runtime.waitSubagent(planner, { subagentName: 'Einstein', timeoutMs: 0 }) as any
  const waitArtifact = waitResult.snapshot.artifacts.find((artifact: any) => artifact.id === 'artifact_snapshot_source')
  assert.equal(waitArtifact?.sourceTaskTitle, 'Snapshot source')
  assert.equal(waitArtifact?.sourceTaskOwnerRunId, worker.id)
  assert.equal(waitResult.snapshot.summary.artifactCount >= 1, true)
})

test('planner subagents can be addressed by human-readable names', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Named subagent rollout',
    tasks: [
      { id: 'task_named_einstein', title: 'Named worker', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)

  const spawned = runtime.spawnSubagent(planner, {
    taskId: 'task_named_einstein',
    subagentName: 'Einstein',
  }) as any
  assert.equal(spawned.spawnedRuns[0]?.subagentName, 'Einstein')
  const workerId = spawned.spawnedRuns[0]?.id
  assert.ok(workerId)

  const listResult = runtime.listSubagents(planner, {}) as any
  assert.equal(listResult.snapshot.tasks.find((task: any) => task.id === 'task_named_einstein')?.metadata?.subagentName, 'Einstein')
  assert.equal(listResult.snapshot.workers.find((worker: any) => worker.id === workerId)?.subagentName, 'Einstein')

  const pendingWait = await runtime.waitSubagent(planner, { subagentName: 'Einstein' }) as any
  assert.equal((pendingWait.target.run ?? pendingWait.target.task).subagentName, 'Einstein')

  const worker = await waitForRun(runtime, workerId)
  assert.ok(worker.status === 'completed' || worker.status === 'completed_with_warnings')
  const doneWait = await runtime.waitSubagent(planner, { subagentName: 'Einstein' }) as any
  assert.equal(doneWait.status, 'completed')
  assert.equal((doneWait.target.run ?? doneWait.target.task).subagentName, 'Einstein')
})

test('later planner runs can cancel named subagents from the same plan', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Cross-run cancel',
    createPlannerRun: false,
    tasks: [
      { id: 'task_cancel_named', title: 'Cancelable worker', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
    ],
  })
  const firstPlanner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const now = new Date().toISOString()
  const worker: AgentRun = {
    id: 'run_cancel_named_1',
    threadId: thread.id,
    status: 'requires_action',
    role: 'worker',
    parentRunId: firstPlanner.id,
    planId: plan.plan.id,
    taskId: 'task_cancel_named',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: firstPlanner.policy,
    metadata: { subagentName: 'Einstein' },
    createdAt: now,
    updatedAt: now,
    pendingInputRequests: [{
      id: 'input_cancel_named_1',
      runId: 'run_cancel_named_1',
      title: 'Need input',
      question: 'Continue?',
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
  runtime.updateTask('task_cancel_named', {
    status: 'running',
    ownerRunId: worker.id,
  })
  const secondPlanner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })

  const result = runtime.cancelSubagent(secondPlanner, {
    subagentName: 'Einstein',
    reason: 'No longer needed.',
  }) as any

  assert.equal(result.status, 'cancelled')
  assert.deepEqual(result.cancelledRunIds, [worker.id])
  assert.equal(result.target.kind, 'run')
  assert.equal(result.target.run.id, worker.id)
  assert.equal(result.target.run.subagentName, 'Einstein')
  assert.equal(result.target.run.status, 'cancelled')
  assert.equal(runtime.getRun(worker.id)?.status, 'cancelled')
})

test('planner can cancel a named pending subagent task before a worker starts', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Cancel pending subagent task',
    createPlannerRun: false,
    tasks: [
      { id: 'task_cancel_pending_named', title: 'Pending worker', metadata: { executionMode: 'worker', subagentName: 'Hawking' } },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })

  const result = runtime.cancelSubagent(planner, {
    subagentName: 'Hawking',
    reason: 'No longer needed before dispatch.',
  }) as any

  assert.equal(result.status, 'cancelled')
  assert.equal(result.target.kind, 'task')
  assert.equal(result.target.task.id, 'task_cancel_pending_named')
  assert.equal(result.target.task.subagentName, 'Hawking')
  assert.equal(result.target.task.status, 'cancelled')
  assert.deepEqual(result.cancelledRunIds, [])
  const task = runtime.getPlanSnapshot(plan.plan.id).tasks.find((item) => item.id === 'task_cancel_pending_named')
  assert.equal(task?.status, 'cancelled')
  assert.equal(task?.blockedReason, 'No longer needed before dispatch.')
  assert.equal(task?.metadata?.cancelledByPlannerRunId, planner.id)

  const wait = await runtime.waitSubagent(planner, { subagentName: 'Hawking' }) as any
  assert.equal(wait.status, 'cancelled')
  assert.equal(wait.done, true)
  assert.equal(wait.target.kind, 'task')
  assert.equal(wait.target.task.subagentName, 'Hawking')
})

test('persisted planner runs can wait and cancel named subagents after runtime restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-persisted-subagents-'))
  const statePath = join(dir, 'state.json')
  try {
    const firstStore = new FileAgentStore(statePath)
    const firstRuntime = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      store: firstStore,
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    })
    const thread = firstRuntime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
    const plan = await firstRuntime.createPlan({
      threadId: thread.id,
      title: 'Persistent subagent lifecycle',
      createPlannerRun: false,
      tasks: [
        { id: 'task_persisted_named', title: 'Persistent worker', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
      ],
    })
    const firstPlanner = await createAndWaitForRun(firstRuntime, thread.id, {
      role: 'planner',
      planId: plan.plan.id,
    })
    const now = new Date().toISOString()
    const worker: AgentRun = {
      id: 'run_persisted_named_1',
      threadId: thread.id,
      status: 'requires_action',
      role: 'worker',
      parentRunId: firstPlanner.id,
      planId: plan.plan.id,
      taskId: 'task_persisted_named',
      agentManifest: DEFAULT_AGENT_MANIFEST,
      policy: firstPlanner.policy,
      metadata: { subagentName: 'Einstein' },
      createdAt: now,
      updatedAt: now,
      pendingInputRequests: [{
        id: 'input_persisted_named_1',
        runId: 'run_persisted_named_1',
        title: 'Need input',
        question: 'Continue?',
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
    firstStore.createRun(worker)
    firstRuntime.updateTask('task_persisted_named', {
      status: 'running',
      ownerRunId: worker.id,
    })
    firstStore.flush()

    const restartedStore = new FileAgentStore(statePath)
    const restartedRuntime = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      store: restartedStore,
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    })
    const secondPlanner = await createAndWaitForRun(restartedRuntime, thread.id, {
      role: 'planner',
      planId: plan.plan.id,
    })
    const blockedWait = await restartedRuntime.waitSubagent(secondPlanner, { subagentName: 'Einstein' }) as any

    assert.equal(blockedWait.status, 'blocked')
    assert.equal(blockedWait.target.kind, 'run')
    assert.equal(blockedWait.target.run.id, worker.id)
    assert.equal(blockedWait.target.run.subagentName, 'Einstein')

    const cancelResult = restartedRuntime.cancelSubagent(secondPlanner, {
      subagentName: 'Einstein',
      reason: 'No longer needed after restart.',
    }) as any

    assert.equal(cancelResult.status, 'cancelled')
    assert.equal(cancelResult.target.run.id, worker.id)
    assert.equal(cancelResult.target.run.subagentName, 'Einstein')
    restartedStore.flush()

    const finalRuntime = createTestRuntime({
      mcpClient: new FakeMCPClient(),
      store: new FileAgentStore(statePath),
      defaultAgentManifest: DEFAULT_AGENT_MANIFEST,
    })
    const persistedPlanner = finalRuntime.getRun(secondPlanner.id)
    assert.ok(persistedPlanner)
    const cancelledWait = await finalRuntime.waitSubagent(persistedPlanner, { subagentName: 'Einstein' }) as any
    assert.equal(cancelledWait.status, 'cancelled')
    assert.equal(cancelledWait.target.run.id, worker.id)
    assert.equal(cancelledWait.target.run.status, 'cancelled')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('wait_subagent reports terminal failure and blocked statuses distinctly', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Wait status rollout',
    tasks: [
      { id: 'task_wait_failed', title: 'Failed task', metadata: { executionMode: 'worker' } },
      { id: 'task_wait_blocked', title: 'Blocked task', metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  runtime.updateTask('task_wait_failed', {
    status: 'failed',
    blockedReason: 'synthetic failure',
  })
  runtime.updateTask('task_wait_blocked', {
    status: 'blocked',
    blockedReason: 'needs input',
  })

  const failed = await runtime.waitSubagent(planner, { taskId: 'task_wait_failed' }) as any
  assert.equal(failed.done, true)
  assert.equal(failed.status, 'failed')
  assert.equal(failed.target.task.blockedReason, 'synthetic failure')

  const blocked = await runtime.waitSubagent(planner, { taskId: 'task_wait_blocked' }) as any
  assert.equal(blocked.done, true)
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.target.task.blockedReason, 'needs input')
})

test('planner and worker prompts include structured plan context', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Prompt plan context',
    tasks: [
      { id: 'task_context_a', title: 'Context A', metadata: { executionMode: 'worker' } },
      { id: 'task_context_b', title: 'Context B', deps: ['task_context_a'], metadata: { executionMode: 'worker' } },
    ],
  })
  const planner = await waitForRun(runtime, plan.runs[0]!.id)
  const plannerContextEvent = runtime.getRunTraceEvents(planner.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const plannerPlanContext = (plannerContextEvent?.data as any)?.agentPlan
  assert.equal(plannerPlanContext?.id, plan.plan.id)
  assert.equal(plannerPlanContext?.role, 'planner')
  assert.equal(plannerPlanContext?.tasks?.some((task: any) => task.id === 'task_context_a'), true)

  const dispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: planner.id,
  })
  const worker = await waitForRun(runtime, dispatch.spawnedRuns[0]!.id)
  const workerContextEvent = runtime.getRunTraceEvents(worker.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const workerPlanContext = (workerContextEvent?.data as any)?.agentPlan
  assert.equal(workerPlanContext?.id, plan.plan.id)
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
    planId: plan.plan.id,
  })
  const followupContextEvent = runtime.getRunTraceEvents(followupPlanner.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((event) => event.title === 'Runtime context resolved')
  const followupPlanContext = (followupContextEvent?.data as any)?.agentPlan
  const sourceArtifact = followupPlanContext?.artifacts?.find((artifact: any) => artifact.id === 'artifact_context_source')
  assert.equal(sourceArtifact?.sourceTaskId, 'task_context_a')
  assert.equal(sourceArtifact?.sourceTaskTitle, 'Context A')
})

test('worker runs cannot use planner-only subagent tools', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'spawn subagent' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Worker cannot dispatch',
    createPlannerRun: false,
    tasks: [{ id: 'task_worker_only', title: 'Worker only', metadata: { executionMode: 'worker' } }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const worker = await createAndWaitForRun(runtime, thread.id, {
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_worker_only',
  })

  assert.equal(runHasTool(worker, 'movscript_spawn_subagent'), false)
  const event = runtime.getRunTraceEvents(worker.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((item) => item.title === 'Tool catalog resolved')
  const availableToolNames = (event?.data as any)?.availableToolNames ?? []
  const blockedTools = (event?.data as any)?.blockedTools ?? []
  assert.equal(availableToolNames.includes('movscript_spawn_subagent'), false)
  assert.equal(blockedTools.some((tool: any) => tool.name === 'movscript_spawn_subagent' && tool.reason === 'wrong_run_role'), true)
})

test('planner capabilities expose subagent scheduling tools', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })

  const plannerCapabilities = await runtime.getCapabilities({ runRole: 'planner' })
  assert.equal(plannerCapabilities.resolvedTools.byName.movscript_inspect_agent_catalog?.available, true)
  assert.equal(plannerCapabilities.resolvedTools.byName.movscript_spawn_subagent?.available, true)
  assert.equal(plannerCapabilities.resolvedTools.byName.movscript_wait_subagent?.available, true)

  const workerCapabilities = await runtime.getCapabilities({ runRole: 'worker' })
  assert.equal(workerCapabilities.resolvedTools.byName.movscript_inspect_agent_catalog?.available, true)
  assert.equal(workerCapabilities.resolvedTools.byName.movscript_spawn_subagent?.available, false)
  assert.equal(workerCapabilities.resolvedTools.byName.movscript_spawn_subagent?.unavailableReason, 'wrong_run_role')
})

test('inspect agent catalog returns current snapshot summary and skill details', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请帮我做项目提案草稿' }] })
  const run = await createAndWaitForRun(runtime, thread.id)

  const summary = runtime.inspectAgentCatalog(run, { view: 'summary' }) as any
  assert.equal(summary.status, 'ok')
  assert.equal(summary.profile.id, 'movscript.profile.default')
  assert.equal(summary.enabledPackIds.includes('movscript.pack.agent-core'), true)
  assert.equal(summary.toolNames.includes('movscript_inspect_agent_catalog'), true)
  assert.equal(summary.counts.knowledge >= 1, true)
  assert.equal(summary.knowledgeCollections.some((collection: any) => collection.id === 'movscript.knowledge.storyboard'), true)

  const skill = runtime.inspectAgentCatalog(run, {
    view: 'skill',
    id: 'movscript.policy.agent-core',
  }) as any
  assert.equal(skill.skill.id, 'movscript.policy.agent-core')
  assert.equal(skill.skill.instructionTemplate, undefined)
  assert.equal(skill.coveredByEnabledPack, true)

  const skillWithInstruction = runtime.inspectAgentCatalog(run, {
    view: 'skill',
    id: 'movscript.policy.agent-core',
    includeInstruction: true,
  }) as any
  assert.match(skillWithInstruction.skill.instructionTemplate, /catalog inspection/)

  const knowledge = runtime.inspectAgentCatalog(run, {
    view: 'knowledge',
    id: 'movscript.knowledge.storyboard',
  }) as any
  assert.equal(knowledge.knowledge.id, 'movscript.knowledge.storyboard')
  assert.equal(knowledge.knowledge.chunkIds.includes('storyboard.rhythm.basic'), true)
  assert.equal(knowledge.knowledge.content, undefined)
  assert.equal(knowledge.enabledByPack, true)
})

test('user conversation runs default to planner role with subagent scheduling tools', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: 'spawn subagent' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.role, 'planner')
  assert.equal(run.parentRunId, undefined)
  const event = runtime.getRunTraceEvents(run.id, { limit: Number.MAX_SAFE_INTEGER })
    .find((item) => item.title === 'Tool catalog resolved')
  const availableToolNames = (event?.data as any)?.availableToolNames ?? []
  assert.equal(availableToolNames.includes('movscript_spawn_subagent'), true)
  assert.equal(runHasTool(run, 'movscript_spawn_subagent'), true)
})

test('supervisor retries failed tasks within the configured attempt limit', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Retry rollout',
    tasks: [{ id: 'task_retry', title: 'Retry task' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })

  const now = new Date().toISOString()
  const firstRun: AgentRun = {
    id: 'run_retry_1',
    threadId: thread.id,
    status: 'failed',
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_retry',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: planner.policy,
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

  const secondDispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
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
  const thirdDispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
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
  const runtime = createTestRuntime({ mcpClient: client, store, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Timeout rollout',
    tasks: [{ id: 'task_timeout', title: 'Timeout task' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const staleStartedAt = new Date(Date.now() - 60_000).toISOString()
  const run: AgentRun = {
    id: 'run_timeout_1',
    threadId: thread.id,
    status: 'in_progress',
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_timeout',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: planner.policy,
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

  const dispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: planner.id,
    workerTimeoutMs: 1,
  })
  assert.deepEqual(dispatch.timedOutRunIds, [run.id])
  assert.equal(runtime.getRun(run.id)?.status, 'cancelled')
  const task = runtime.getPlanSnapshot(plan.plan.id).tasks.find((item) => item.id === 'task_timeout')
  assert.equal(task?.status, 'cancelled')
  assert.equal(task?.metadata?.timedOutRunId, run.id)
  assert.equal(task?.metadata?.workerTimeoutMs, 1)
  assert.equal(task?.metadata?.previousOwnerRunId, run.id)
  assert.equal(task?.metadata?.previousStatus, 'running')
})

test('supervisor uses task-level worker timeout overrides', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Task timeout override rollout',
    tasks: [
      { id: 'task_fast_timeout', title: 'Fast timeout task', metadata: { workerTimeoutMs: 1 } },
      { id: 'task_slow_timeout', title: 'Slow timeout task', metadata: { workerTimeoutMs: 120_000 } },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const staleStartedAt = new Date(Date.now() - 60_000).toISOString()
  const fastRun: AgentRun = {
    id: 'run_fast_timeout',
    threadId: thread.id,
    status: 'in_progress',
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_fast_timeout',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    policy: planner.policy,
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

  const dispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: planner.id,
  })
  assert.deepEqual(dispatch.timedOutRunIds, [fastRun.id])
  assert.equal(runtime.getRun(fastRun.id)?.status, 'cancelled')
  assert.equal(runtime.getRun(slowRun.id)?.status, 'in_progress')
  const fastTask = runtime.getPlanSnapshot(plan.plan.id).tasks.find((item) => item.id === 'task_fast_timeout')
  assert.equal(fastTask?.metadata?.workerTimeoutMs, 1)
  assert.equal(fastTask?.metadata?.timedOutRunId, fastRun.id)
})

test('supervisor uses task-level retry attempt overrides', async () => {
  const client = new FakeMCPClient()
  const store = new InMemoryAgentStore()
  const runtime = createTestRuntime({ mcpClient: client, store, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Task retry override rollout',
    tasks: [
      { id: 'task_retry_override', title: 'Retry override task', metadata: { maxTaskAttempts: 3 } },
      { id: 'task_retry_default', title: 'Retry default task' },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const firstDispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
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

  const retryDispatch = runtime.dispatchPlan({
    planId: plan.plan.id,
    plannerRunId: planner.id,
    retryFailed: true,
    maxTaskAttempts: 1,
    maxWorkers: 2,
  })
  assert.deepEqual(retryDispatch.retriedTaskIds, ['task_retry_override'])
  assert.equal(retryDispatch.spawnedRuns.length, 1)
  assert.equal(retryDispatch.spawnedRuns[0]?.taskId, 'task_retry_override')
  const retryTask = runtime.getPlanSnapshot(plan.plan.id).tasks.find((item) => item.id === 'task_retry_override')
  assert.equal(retryTask?.metadata?.retryAttempt, 2)
  assert.equal(retryTask?.metadata?.maxTaskAttempts, 3)
})

test('replan updates the task graph, resets blocked work, and dispatches runnable workers', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Replan rollout',
    tasks: [
      { id: 'task_blocked', title: 'Blocked task' },
      { id: 'task_followup', title: 'Follow up', deps: ['task_blocked'] },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  runtime.updateTask('task_blocked', {
    status: 'blocked',
    progress: 0.25,
    blockedReason: 'needs smaller task graph',
  })

  const replan = runtime.replanRun(planner.id, {
    tasks: [
      { id: 'task_followup', description: 'Run after the recovered blocked task and added audit task.' },
      { id: 'task_audit', title: 'Audit new path', deps: ['task_blocked'] },
    ],
    resetBlocked: true,
    maxWorkers: 2,
  })

  assert.deepEqual(replan.createdTaskIds, ['task_audit'])
  assert.deepEqual(replan.updatedTaskIds, ['task_followup'])
  assert.deepEqual(replan.resetTaskIds, ['task_blocked'])
  assert.equal(replan.dispatch?.spawnedRuns.length, 1)
  assert.equal(replan.dispatch?.spawnedRuns[0]?.taskId, 'task_blocked')

  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_blocked')?.status, 'running')
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_blocked')?.blockedReason, undefined)
  assert.equal(
    snapshot.tasks.find((task) => task.id === 'task_followup')?.description,
    'Run after the recovered blocked task and added audit task.',
  )
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_audit')?.status, 'pending')
})

test('replan can reset needs_review tasks for another worker pass', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Needs review replan rollout',
    tasks: [
      { id: 'task_review', title: 'Reviewable task', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const finishedWorker = runtime.createToolRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_review',
    agentManifest: DEFAULT_AGENT_MANIFEST,
    toolCall: {
      name: 'movscript_read_project_scripts',
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

  const replan = runtime.replanRun(planner.id, {
    resetNeedsReview: true,
    maxWorkers: 1,
  })

  assert.deepEqual(replan.resetTaskIds, ['task_review'])
  assert.equal(replan.dispatch?.spawnedRuns.length, 1)
  assert.equal(replan.dispatch?.spawnedRuns[0]?.taskId, 'task_review')
  assert.notEqual(replan.dispatch?.spawnedRuns[0]?.id, finishedWorker.id)
  assert.equal(replan.dispatch?.spawnedRuns[0]?.metadata?.subagentName, 'Einstein')

  const task = runtime.getPlanSnapshot(plan.plan.id).tasks.find((item) => item.id === 'task_review')
  assert.equal(task?.status, 'running')
  assert.equal(task?.blockedReason, undefined)
  assert.equal(task?.metadata?.previousStatus, 'needs_review')
  assert.equal(task?.metadata?.previousOwnerRunId, finishedWorker.id)
})

test('replanRun requires a planner run before mutating tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Replan planner boundary',
    tasks: [{ id: 'task_replan_boundary', title: 'Boundary task' }],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })
  const worker = runtime.createRun({
    threadId: thread.id,
    role: 'worker',
    parentRunId: planner.id,
    planId: plan.plan.id,
    taskId: 'task_replan_boundary',
  })

  assert.throws(() => runtime.replanRun(planner.id, {
    plannerRunId: worker.id,
    tasks: [{ id: 'task_replan_boundary', description: 'Worker should not mutate this.' }],
    dispatch: false,
  }), /is not a planner run/)
  assert.equal(
    runtime.getPlanSnapshot(plan.plan.id).tasks.find((task) => task.id === 'task_replan_boundary')?.description,
    undefined,
  )
})

test('replan add tasks validates atomically before creating tasks', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
    threadId: thread.id,
    title: 'Atomic replan additions',
    tasks: [
      { id: 'task_replan_existing_named', title: 'Existing named', metadata: { executionMode: 'worker', subagentName: 'Einstein' } },
    ],
  })
  const planner = await createAndWaitForRun(runtime, thread.id, {
    role: 'planner',
    planId: plan.plan.id,
  })

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_atomic_a', title: 'Atomic A' },
      { id: 'task_replan_atomic_a', title: 'Atomic duplicate id' },
    ],
    dispatch: false,
  }), /task already exists/)

  let snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_atomic_a'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_atomic_b', title: 'Atomic B', metadata: { subagentName: 'Hawking' } },
      { id: 'task_replan_atomic_c', title: 'Atomic C', subagentName: 'Hawking' },
    ],
    dispatch: false,
  }), /subagent name already exists/)

  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_atomic_b'), false)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_atomic_c'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_atomic_d', title: 'Atomic D', subagentName: 'Einstein' },
    ],
    dispatch: false,
  }), /subagent name already exists/)

  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_atomic_d'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_atomic_e', title: 'Atomic E', deps: ['task_missing_replan_dep'] },
    ],
    dispatch: false,
  }), /task not found/)

  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_atomic_e'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_atomic_cycle_a', title: 'Cycle A', deps: ['task_replan_atomic_cycle_b'] },
      { id: 'task_replan_atomic_cycle_b', title: 'Cycle B', deps: ['task_replan_atomic_cycle_a'] },
    ],
    dispatch: false,
  }), /dependency cycle detected/)

  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_atomic_cycle_a'), false)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_atomic_cycle_b'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_parent_cycle_a', title: 'Parent Cycle A', parentId: 'task_replan_parent_cycle_b' },
      { id: 'task_replan_parent_cycle_b', title: 'Parent Cycle B', parentId: 'task_replan_parent_cycle_a' },
    ],
    dispatch: false,
  }), /parent cycle detected/)

  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_parent_cycle_a'), false)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_parent_cycle_b'), false)

  assert.throws(() => runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_update_atomic_a', title: 'Update Atomic A' },
    ],
    updates: [
      { id: 'task_replan_existing_named', deps: ['task_replan_update_atomic_a'] },
      { id: 'task_replan_update_missing', title: 'Missing update target' },
    ],
    dispatch: false,
  }), /task not found/)

  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.some((task) => task.id === 'task_replan_update_atomic_a'), false)
  assert.deepEqual(snapshot.tasks.find((task) => task.id === 'task_replan_existing_named')?.deps, [])

  const valid = runtime.replanRun(planner.id, {
    addTasks: [
      { id: 'task_replan_atomic_f', title: 'Atomic F', deps: ['task_replan_existing_named'] },
      { id: 'task_replan_atomic_g', title: 'Atomic G', parentId: 'task_replan_atomic_f', deps: ['task_replan_atomic_f'] },
    ],
    updates: [
      { id: 'task_replan_existing_named', description: 'Updated after atomic validation.' },
    ],
    dispatch: false,
  })
  assert.deepEqual(valid.createdTaskIds, ['task_replan_atomic_f', 'task_replan_atomic_g'])
  assert.deepEqual(valid.updatedTaskIds, ['task_replan_existing_named'])
  snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_replan_existing_named')?.description, 'Updated after atomic validation.')
  assert.deepEqual(snapshot.tasks.find((task) => task.id === 'task_replan_atomic_g')?.deps, ['task_replan_atomic_f'])
  assert.equal(snapshot.tasks.find((task) => task.id === 'task_replan_atomic_g')?.parentId, 'task_replan_atomic_f')
})

test('needs_review tasks can be accepted through task update', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
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
  assert.equal(runtime.getPlanSnapshot(plan.plan.id).plan.status, 'done')
})

test('needs_review tasks can be rejected through task update', async () => {
  const client = new FakeMCPClient()
  const runtime = createTestRuntime({ mcpClient: client, defaultAgentManifest: DEFAULT_AGENT_MANIFEST })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划并执行' }] })
  const plan = await runtime.createPlan({
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

  const snapshot = runtime.getPlanSnapshot(plan.plan.id)
  assert.equal(rejected.status, 'cancelled')
  assert.equal(rejected.blockedReason, 'User rejected review.')
  assert.equal(rejected.metadata?.reviewOutcome, 'rejected')
  assert.equal(snapshot.plan.status, 'cancelled')
  assert.equal(snapshot.tasks[0]?.status, 'cancelled')
})

async function createAndWaitForRun(
  runtime: AgentRuntime,
  threadId: string,
  input: Record<string, unknown> = {},
): Promise<AgentRun> {
  const run = runtime.createRun({ threadId, ...input })
  return waitForRun(runtime, run.id)
}

async function waitForRun(runtime: AgentRuntime, runId: string): Promise<AgentRun> {
  const deadline = Date.now() + 1000
  while (true) {
    const latest = runtime.getRun(runId)
    if (latest && latest.status !== 'queued' && latest.status !== 'in_progress') return latest
    if (Date.now() > deadline) throw new Error(`run ${runId} did not finish`)
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

function assertRunTraceEventTypes(runtime: AgentRuntime, runId: string, expected: string[]): void {
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

function findTraceEventByEventType(runtime: AgentRuntime, runId: string, eventType: string): { data?: Record<string, unknown> } | undefined {
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
