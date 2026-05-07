import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { AgentRuntime, type AgentRun } from './agentRuntime.js'
import type { JSONValue } from '../types.js'
import { FileAgentStore } from './store/fileStore.js'
import { FileAgentDraftStore, InMemoryAgentDraftStore } from './store/draftStore.js'
import { InMemoryAgentMemoryStore } from './memory/memoryStore.js'
import { DEFAULT_AGENT_MANIFEST } from './manifest/agentManifest.js'
import { BackendApplyClient, type BackendApplyAuthContext, type BackendApplyResult } from './store/backendApplyClient.js'
import type { ApplyDraftReview } from './store/draftApply.js'
import {
  SCRIPT_SPLIT_RUNTIME_CONTRACT,
} from './contracts/scriptSplitContract.js'
import { StaticAgentRuntimeContractResolver } from './contracts/runtimeContract.js'
import { InMemoryAgentCatalogStateStore } from './index.js'
import { loadAgentPluginCatalog } from './pluginCatalog.js'

process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-test-')), 'model-config.json')

const WRITE_AGENT_MANIFEST = {
  ...DEFAULT_AGENT_MANIFEST,
  permissions: [...DEFAULT_AGENT_MANIFEST.permissions, 'project.write'],
  tools: [
    ...DEFAULT_AGENT_MANIFEST.tools,
    { name: 'movscript_create_project', mode: 'allow' as const, approval: 'always' as const },
    { name: 'movscript_apply_draft', mode: 'allow' as const, approval: 'always' as const },
    { name: 'movscript_create_script', mode: 'allow' as const, approval: 'always' as const },
  ],
}

// Install a default model config so executeRun() can find one
{
  const { RuntimeModelConfigStore } = await import('./model/modelConfig.js')
  new RuntimeModelConfigStore().save({ modelConfigId: 1, model: 'model_config:1' })
}

// Default model fetch: returns tool calls based on message content, then a final text reply
const _originalFetch = globalThis.fetch
function installDefaultModelFetch(): void {
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
    const userMsg = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const toolMessages = messages.filter((m) => m.role === 'tool')
    const tools = (body.tools as Array<{ function: { name: string } }>) ?? []
    const toolNames = new Set(tools.map((t) => t.function.name))

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
    if (/应用草稿|apply.*draft/i.test(userMsg) && toolNames.has('movscript_apply_draft')) {
      const draftId = userMsg.match(/\b(draft_[a-zA-Z0-9_-]+)\b/)?.[1]
      if (draftId) callsToMake.push({ id: 'call_apply_1', name: 'movscript_apply_draft', args: { draftId } })
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

type ToolCallRecord = {
  name: string
  args: Record<string, JSONValue>
}

class FakeMCPClient {
  readonly calls: ToolCallRecord[] = []
  readonly extraTools: any[] = []
  readonly toolResults = new Map<string, JSONValue>()
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
      { name: 'movscript_read_entity', description: 'Read a single project entity.', inputSchema: {} },
      { name: 'movscript_read_project_structure', description: 'Read project structure.', inputSchema: {} },
      { name: 'movscript_create_project', description: 'Create a project.', inputSchema: {} },
      { name: 'movscript_list_productions', description: 'List productions.', inputSchema: {} },
      { name: 'movscript_read_current_production', description: 'Read current production context.', inputSchema: {} },
      { name: 'movscript_check_entity_conflicts', description: 'Check entity conflicts.', inputSchema: {} },
      { name: 'movscript_open_entity', description: 'Open an entity.', inputSchema: {} },
      ...this.extraTools,
    ]
  }

  async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
    this.calls.push({ name, args })
    if (this.failTools.has(name)) {
      throw new Error(`${name} failed`)
    }
    if (name === 'movscript_get_context_pack') {
      return toolText({
        snapshot: {
          project: this.projectId === null ? null : { id: this.projectId, name: 'Test Project' },
          user: this.userId === null ? null : { id: this.userId, username: 'tester' },
        },
      })
    }
    if (this.toolResults.has(name)) {
      return toolText(this.toolResults.get(name))
    }
    if (name === 'movscript_read_project_structure') {
      return toolText({
        counts: {
          scripts: 1,
          creative_references: 0,
          segments: 1,
          scene_moments: 2,
          storyboard_lines: 1,
          content_units: 3,
          asset_slots: 2,
          pipelineNodes: 2,
        },
        segments: [],
        scene_moments: [],
        storyboard_lines: [],
        content_units: [],
        asset_slots: [],
      })
    }
    if (name === 'movscript_read_entity') {
      return toolText({ id: args.entityId, projectId: args.projectId })
    }
    return toolText({ ok: true })
  }
}

class FakeBackendApplyClient extends BackendApplyClient {
  readonly calls: Array<{ review: ApplyDraftReview; auth?: BackendApplyAuthContext }> = []
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

test('adds current projectId to draft tool calls', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.status, 'completed')
  assert.equal(runtime.listDrafts({ projectId: 42 })[0]?.projectId, 42)
})

test('previews plan and policy without creating a run or executing planned tools', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const preview = await runtime.previewRun({
    threadId: thread.id,
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['draft.write'],
      tools: [{ name: 'movscript_create_draft', mode: 'allow', approval: 'always' }],
    },
  })

  assert.equal(preview.status, 'preview')
  assert.equal(preview.threadId, thread.id)
  assert.equal(preview.currentProjectId, 42)
  assert.equal(preview.pendingApprovals[0]?.toolName, 'movscript_create_draft')
  assert.equal(preview.agentManifest?.schema, 'movscript.agent.current')
  assert.ok(preview.context)
  assert.ok(preview.skills)
  assert.ok(preview.tools?.available.some((tool) => tool.name === 'movscript_create_draft'))
  assert.ok(preview.promptPreview?.debugParts.some((part) => part.kind === 'tool'))
  assert.equal(preview.toolCalls.length, 0)
  assert.equal(runtime.listRuns().length, 0)
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_draft'), false)
  assert.deepEqual(client.calls.map((call) => call.name), ['movscript_get_context_pack'])
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
  assert.equal(preview.debug?.manifestId, runtime.getDefaultAgentManifest().id)
  assert.equal(preview.promptPreview?.messages.at(-1)?.content.includes('moment-ref.png'), true)
})

test('agentic loop records direct draft tool-call steps without planner or subagent steps', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const draft = runtime.listDrafts({ projectId: 42 })[0]

  assert.equal(run.status, 'completed')
  assert.ok(run.steps.some((step) => step.type === 'tool_call' && step.toolName === 'movscript_create_draft'))
  assert.equal(run.steps.some((step: any) => step.type === 'planning' || step.type === 'subagent'), false)
  assert.equal(draft?.projectId, 42)
})

test('capabilities distinguish available and blocked tools', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const capabilities = await runtime.getCapabilities({
    currentProjectId: 42,
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['project.read'],
      tools: [{ name: 'movscript_list_productions', mode: 'allow' }],
    },
  })

  assert.equal(capabilities.mcp.connected, true)
  assert.ok(capabilities.resolvedTools.available.some((tool) => tool.name === 'movscript_list_productions'))
  assert.equal(capabilities.resolvedTools.byName['movscript_create_draft']?.unavailableReason, 'not_granted')
})

test('runtime draft tools are available without MCP tool discovery', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const capabilities = await runtime.getCapabilities({ currentProjectId: 42 })

  assert.equal(capabilities.resolvedTools.byName['movscript_create_draft']?.source, 'runtime')
  assert.equal(capabilities.resolvedTools.byName['movscript_create_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_update_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_patch_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_validate_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_list_drafts']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript_create_script']?.source, 'runtime')
  assert.equal(capabilities.resolvedTools.byName['movscript_create_script']?.available, true)
})

test('runtime can patch and validate a script split draft without backend writes', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const runtime = createTestRuntime({ mcpClient: client, draftStore })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '请细化草稿' }] })
  const draft = draftStore.createDraft({
    projectId: 42,
    kind: 'script_split',
    title: '剧本拆分草稿',
    content: JSON.stringify({
      schema: 'movscript.script_split_analysis.v1',
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

  const run = runtime.createToolRun({
    threadId: thread.id,
    title: 'Patch draft',
    message: 'Patch draft',
    toolCall: {
      name: 'movscript_patch_draft',
      args: {
        draftId: draft.id,
        ops: [{ op: 'replace', path: '/episode_drafts/0/summary', value: '新摘要' }],
      },
    },
  })
  const completed = await waitForRun(runtime, run.id)
  const updated = runtime.getDraft(draft.id)
  const parsed = JSON.parse(updated?.content ?? '{}') as { episode_drafts?: Array<{ summary?: string }> }
  const validation = runtime.validateDraft({ draftId: draft.id }) as { ok?: boolean }

  assert.equal(completed.status, 'completed')
  assert.equal(parsed.episode_drafts?.[0]?.summary, '新摘要')
  assert.equal(validation.ok, true)
  assert.equal(client.calls.some((call) => call.name === 'movscript_patch_draft'), false)
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

  runtime.approveRun(run.id)
  const resumed = await waitForRun(runtime, run.id)
  const call = client.calls.find((item) => item.name === 'movscript_create_project')

  assert.equal(resumed.status, 'completed')
  assert.equal(call?.args.name, '测试项目')
  assert.equal(call?.args.projectId, undefined)
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

  assert.equal(resumed.status, 'completed')
  assert.equal(backendApplyClient.createScriptCalls.length, 1)
  assert.equal(backendApplyClient.createScriptCalls[0]?.projectId, 42)
  assert.equal(backendApplyClient.createScriptCalls[0]?.payload.title, '雨夜便利店')
  assert.equal(backendApplyClient.createScriptCalls[0]?.payload.raw_source, '雨夜。便利店。一个外卖员发现柜台后藏着一封没有寄出的信。')
  assert.equal(backendApplyClient.createScriptCalls[0]?.payload.source_type, 'raw')
  assert.equal(backendApplyClient.createScriptCalls[0]?.auth?.userId, 7)
  assert.equal(backendApplyClient.createScriptCalls[0]?.auth?.backendAuthToken, 'secret-token')
  assert.ok(resumed.steps.some((step) => step.toolName === 'movscript_create_script' && step.status === 'completed'))
})

test('run agentManifest limits tool execution', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['project.read'],
      tools: [{ name: 'movscript_list_productions', mode: 'allow', approval: 'never' }],
    },
  })

  assert.equal(run.status, 'completed')
  assert.equal(runtime.listDrafts({ projectId: 42 }).length, 0)
  assert.deepEqual(run.agentManifest?.permissions, ['project.read'])
})

test('run requiring approval pauses before tool execution and resumes after approval', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['draft.write'],
      tools: [{ name: 'movscript_create_draft', mode: 'allow', approval: 'always' }],
    },
  })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript_create_draft')
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_draft'), false)

  runtime.approveRun(run.id)
  const resumed = await waitForRun(runtime, run.id)
  const draft = client.calls.find((call) => call.name === 'movscript_create_draft')

  assert.ok(resumed.status === 'completed' || resumed.status === 'completed_with_warnings')
  assert.equal(draft, undefined)
  assert.equal(runtime.listDrafts({ projectId: 42 }).length, 1)
  assert.equal(resumed.pendingApprovals?.[0].status, 'approved')
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
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['draft.write'],
      tools: [{ name: 'movscript_create_draft', mode: 'allow', approval: 'always' }],
    },
  })
  const rejected = runtime.rejectRun(run.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === rejected.assistantMessageId)

  assert.equal(rejected.status, 'completed_with_warnings')
  assert.equal(rejected.pendingApprovals?.[0].status, 'rejected')
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_draft'), false)
  assert.match(assistant?.content ?? '', /已取消需要确认的工具调用/)
})

test('run can be cancelled while waiting for action', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['draft.write'],
      tools: [{ name: 'movscript_create_draft', mode: 'allow', approval: 'always' }],
    },
  })
  const cancelled = runtime.cancelRun(run.id, { reason: '用户停止了当前会话。' })
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === cancelled.assistantMessageId)

  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.pendingApprovals?.[0].status, 'rejected')
  assert.ok(cancelled.cancelledAt)
  assert.match(assistant?.content ?? '', /已停止当前会话/)
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_draft'), false)
})

test('apply_draft requires approval and marks draft applied after approval', async () => {
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

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript_apply_draft')
  assert.equal((run.pendingApprovals?.[0].preview as any)?.review?.target?.entityType, 'content_unit')
  assert.equal(runtime.getDraft(draft.id)?.status, 'draft')

  runtime.approveRun(run.id)
  const appliedRun = await waitForRun(runtime, run.id)
  const appliedDraft = runtime.getDraft(draft.id)

  assert.equal(appliedRun.status, 'completed')
  assert.equal(backendApplyClient.calls.length, 1)
  assert.equal(backendApplyClient.calls[0].review.target.entityType, 'content_unit')
  assert.equal(appliedDraft?.status, 'applied')
  assert.equal(appliedDraft?.target?.entityId, 7)
  assert.equal((appliedDraft?.metadata?.applyReview as any)?.requiresBackendApply, true)
  assert.equal(appliedDraft?.metadata?.backendWritePerformed, true)
  assert.equal((appliedDraft?.metadata?.backendApply as any)?.method, 'PATCH')
})

test('createToolRun drives apply_draft through the same approval policy', async () => {
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

  const run = runtime.createToolRun({
    title: 'Apply draft from UI',
    message: 'Apply draft from UI',
    agentManifest: WRITE_AGENT_MANIFEST,
    toolCall: {
      name: 'movscript_apply_draft',
      args: {
        draftId: draft.id,
        target: { projectId: 42, entityType: 'content_unit', entityId: 7, field: 'description' },
        currentValue: 'Old content-unit description',
        proposedValue: 'New content-unit description',
      },
    },
  })
  const waiting = await waitForRun(runtime, run.id)

  assert.equal(waiting.status, 'requires_action')
  assert.equal(waiting.pendingApprovals?.[0].toolName, 'movscript_apply_draft')
  assert.equal((waiting.pendingApprovals?.[0].preview as any)?.review?.currentValue, 'Old content-unit description')
  assert.equal(runtime.getDraft(draft.id)?.status, 'draft')

  runtime.approveRun(waiting.id, { approvalIds: [waiting.pendingApprovals![0].id] })
  const appliedRun = await waitForRun(runtime, waiting.id)

  assert.equal(appliedRun.status, 'completed')
  assert.equal(runtime.getDraft(draft.id)?.status, 'applied')
  assert.equal(backendApplyClient.calls.length, 1)
})

test('apply_draft passes current context user id to backend apply client', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.userId = 9
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

  await createAndWaitForRun(runtime, thread.id, { agentManifest: WRITE_AGENT_MANIFEST })
  const waiting = runtime.listRuns()[0]
  runtime.approveRun(waiting.id)
  await waitForRun(runtime, waiting.id)

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

test('sandbox mode intercepts write-risk tools without applying drafts', async () => {
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
  const run = runtime.createToolRun({
    title: 'Sandbox apply draft',
    message: 'Sandbox apply draft',
    sandboxMode: true,
    agentManifest: WRITE_AGENT_MANIFEST,
    toolCall: {
      name: 'movscript_apply_draft',
      args: { draftId: draft.id },
    },
  })

  const finished = await waitForRun(runtime, run.id)
  const sandboxed = finished.steps.find((step) => step.toolName === 'movscript_apply_draft')

  assert.equal(finished.status, 'completed')
  assert.equal(Boolean(finished.pendingApprovals?.some((approval) => approval.status === 'pending')), false)
  assert.equal(sandboxed?.sandboxed, true)
  assert.equal(sandboxed?.roundSource, 'runtime_rule')
  assert.equal((sandboxed?.result as any)?.sandboxed, true)
  assert.equal(runtime.getDraft(draft.id)?.status, 'draft')
  assert.equal(backendApplyClient.calls.length, 0)
})

test('persists threads, messages, runs, and steps across runtime rebuilds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client, store: new FileAgentStore(statePath) })
    const thread = runtime.createThread({ title: 'Persistent thread' })
    runtime.addMessage(thread.id, { role: 'user', content: '帮我写一个草稿' })
    const run = await createAndWaitForRun(runtime, thread.id)

    const rebuilt = createTestRuntime({ mcpClient: new FakeMCPClient(), store: new FileAgentStore(statePath) })
    const restoredThread = rebuilt.getThread(thread.id)
    const restoredRun = rebuilt.getRun(run.id)

    assert.equal(restoredThread?.title, 'Persistent thread')
    assert.equal(restoredThread?.messages.some((message) => message.role === 'user'), true)
    assert.equal(restoredRun?.status, 'completed')
    assert.ok(restoredRun?.steps.some((step) => step.type === 'tool_call'))
    assert.ok(restoredRun?.traceEvents?.some((event) => event.kind === 'context'))
    assert.ok(restoredRun?.traceEvents?.some((event) => event.kind === 'tool_call'))
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

    const parsed = JSON.parse(readFileSync(statePath, 'utf8'))
    assert.equal(parsed.version, 1)
    assert.equal(parsed.threads[0].id, 'thread_atomic')
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

test('records backend model gateway HTTP request and response in run trace', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-model-trace-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('./model/modelConfig.js')
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
    const runtime = createTestRuntime({ mcpClient: client })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: 'hello' }] })
    const run = await createAndWaitForRun(runtime, thread.id, { backendAuthToken: 'secret-token' })

    const requestEvent = run.traceEvents?.find((event) => event.kind === 'model_call' && event.title === 'Model HTTP request sent')
    const responseEvent = run.traceEvents?.find((event) => event.kind === 'model_call' && event.title === 'Model HTTP response received')
    const requestData = requestEvent?.data as any
    const responseData = responseEvent?.data as any

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
    const { RuntimeModelConfigStore } = await import('./model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 13, model: 'model_config:13' })

    globalThis.fetch = (async (_url, init) => {
      callCount += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      requests.push(body)

      if (callCount === 1) {
        assert.equal(Array.isArray(body.tools), true)
        assert.equal((body.tools as any[]).some((tool) => tool?.function?.name === 'movscript_create_draft'), true)
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
                    name: 'movscript_create_draft',
                    arguments: JSON.stringify({ kind: 'note', title: '分析草稿', content: '请分析这个任务' }),
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
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '请做 production proposal 制作编排' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        tools: [
          ...DEFAULT_AGENT_MANIFEST.tools,
          { name: 'movscript_create_draft', mode: 'allow', approval: 'never' },
        ],
      },
    })
    const finalThread = runtime.getThread(thread.id)
    const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(callCount >= 2, true)
    assert.equal(runtime.listDrafts({ projectId: 42 }).length, 1)
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

test('context command returns fallback diagnostics when MCP context pack is unavailable', async () => {
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
  assert.match(assistant?.content ?? '', /Context pack unavailable: mcp offline/)
  assert.throws(() => JSON.parse(assistant?.content ?? ''))
  assert.equal(run.traceEvents?.some((event) => event.title === 'Context pack failed'), true)
  assert.equal(run.traceEvents?.some((event) => event.kind === 'model_call'), false)
})

test('script split agent session exposes structured submit tool without forcing JSON assistant output', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-script-split-json-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  const requests: Array<Record<string, unknown>> = []
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('./model/modelConfig.js')
    new RuntimeModelConfigStore().save({ modelConfigId: 22, model: 'model_config:22' })

    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      requests.push(body)
      const messages = (body.messages as Array<{ role: string; content: string | null }>) ?? []
      const systemText = messages.filter((m) => m.role === 'system').map((m) => m.content ?? '').join('\n')
      assert.equal(body.response_format, undefined)
      assert.doesNotMatch(systemText, /movscript\.script_split_analysis\.v1/)
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: '我会通过工具或草稿把结构化数据交给 UI，聊天正文不进行 JSON 收口。',
          },
          finish_reason: 'stop',
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({
      mcpClient: client,
      contractResolver: new StaticAgentRuntimeContractResolver([
        SCRIPT_SPLIT_RUNTIME_CONTRACT,
      ]),
    })
    const thread = runtime.createThread({ messages: [{ role: 'user', content: '请拆分：第1集 雨夜\n便利店相遇。\n\n第2集 旧信\n旧信浮出水面。' }] })
    const run = await createAndWaitForRun(runtime, thread.id, {
      agentManifest: {
        ...DEFAULT_AGENT_MANIFEST,
        id: 'script-split-agent',
        name: '剧本拆分 Agent',
        soul: '通过工具或草稿把结构化结果交给 UI；assistant 正文只做简短说明。',
        permissions: ['project.read', 'draft.write'],
        tools: [
          { name: 'movscript_get_context_pack', mode: 'allow', approval: 'never' },
          { name: 'movscript_read_project_structure', mode: 'allow', approval: 'never' },
          { name: 'movscript_submit_script_split_draft', mode: 'allow', approval: 'never' },
        ],
      },
    })
    const finalThread = runtime.getThread(thread.id)
    const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(requests.length, 1)
    assert.equal(run.metadata?.runtimeContractId, 'script-split-agent')
    const tools = requests[0]?.tools as Array<{ function?: { name?: string; parameters?: Record<string, unknown> } }> | undefined
    assert.equal(requests[0]?.response_format, undefined)
    const submitTool = tools?.find((tool) => tool.function?.name === 'movscript_submit_script_split_draft')
    assert.equal(!!submitTool, true)
    assert.equal(tools?.some((tool) => tool.function?.name === 'movscript_create_draft'), false)
    const submitParameters = submitTool?.function?.parameters as Record<string, any> | undefined
    const sourceScriptSchema = submitParameters?.properties?.sourceScript as Record<string, any> | undefined
    const episodeSchema = submitParameters?.properties?.episodeDrafts?.items as Record<string, any> | undefined
    assert.equal(submitParameters?.type, 'object')
    assert.equal('content' in (sourceScriptSchema?.properties ?? {}), false)
    assert.equal('content' in (episodeSchema?.properties ?? {}), false)
    assert.equal('startLine' in (episodeSchema?.properties ?? {}), true)
    assert.match(assistant?.content ?? '', /聊天正文不进行 JSON 收口/)
  } finally {
    globalThis.fetch = originalFetch
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = originalModelConfigPath
    rmSync(modelConfigDir, { recursive: true, force: true })
  }
})

test('script split structured submit tool writes a normalized script_split draft', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const runtime = createTestRuntime({
    mcpClient: client,
    draftStore,
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '提交结构化剧本拆分草稿' }] })

  const run = runtime.createToolRun({
    threadId: thread.id,
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['project.read', 'draft.write'],
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'movscript_submit_script_split_draft', mode: 'allow', approval: 'never' },
      ],
    },
      toolCall: {
      name: 'movscript_submit_script_split_draft',
      args: {
        projectId: 42,
        draftTitle: '剧本拆分草稿 - 总稿',
        sourceTitle: '总稿',
        sourceSummary: '两个制作的总稿。',
        sourceScript: {
          title: '总稿',
          summary: '两个制作的总稿。',
          sourceType: 'raw',
          lineCount: 4,
        },
        globalSettings: {
          storyWorld: '雨夜城市',
          coreRules: ['不要编造原文没有的剧情'],
          characterRelationships: ['林夏和顾言关系紧张'],
          keyCharacters: ['林夏', '顾言'],
          keyLocations: ['便利店'],
          keyProps: ['旧信'],
          continuityNotes: ['纸条必须前后连贯'],
        },
        episodeDrafts: [{
          order: 1,
          title: '第1集 雨夜便利店',
          summary: '开场进入便利店。',
          globalContext: {
            storyWorld: '雨夜城市',
            coreRules: ['不要编造原文没有的剧情'],
            characterRelationships: ['林夏和顾言关系紧张'],
            keyCharacters: ['林夏', '顾言'],
            keyLocations: ['便利店'],
            keyProps: ['旧信'],
            continuityNotes: ['纸条必须前后连贯'],
            episodeRelevance: ['旧信在本集首次出现'],
          },
          startLine: 1,
          endLine: 2,
          action: 'create',
          existingScriptId: null,
        }],
        warnings: ['需复核'],
        confidence: 0.82,
      },
    },
  })
  const completed = await waitForRun(runtime, run.id)
  const draft = runtime.listDrafts({ projectId: 42, kind: 'script_split' })[0]
  const parsed = JSON.parse(draft?.content ?? '{}') as {
    schema?: string
    source_title?: string
    source_script?: { line_count?: number }
    global_settings?: { story_world?: string }
    episode_drafts?: Array<{ existing_script_id?: number | null; start_line?: number; end_line?: number; content?: string }>
  }

  assert.equal(completed.status, 'completed')
  assert.equal(client.calls.some((call) => call.name === 'movscript_submit_script_split_draft'), false)
  assert.equal(draft?.kind, 'script_split')
  assert.equal(draft?.title, '剧本拆分草稿 - 总稿')
  assert.equal(parsed.schema, 'movscript.script_split_analysis.v1')
  assert.equal(parsed.source_title, '总稿')
  assert.equal(parsed.global_settings?.story_world, '雨夜城市')
  assert.equal(parsed.source_script?.line_count, 4)
  assert.equal(parsed.episode_drafts?.[0]?.existing_script_id, null)
  assert.equal(parsed.episode_drafts?.[0]?.start_line, 1)
  assert.equal(parsed.episode_drafts?.[0]?.end_line, 2)
  assert.equal('content' in (parsed.episode_drafts?.[0] ?? {}), false)
})

test('script split submit tool rejects script body text in arguments', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({
    mcpClient: client,
    draftStore: new InMemoryAgentDraftStore(),
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '提交带正文的错误剧本拆分草稿' }] })

  const run = runtime.createToolRun({
    threadId: thread.id,
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['project.read', 'draft.write'],
      tools: [
        ...DEFAULT_AGENT_MANIFEST.tools,
        { name: 'movscript_submit_script_split_draft', mode: 'allow', approval: 'never' },
      ],
    },
    toolCall: {
      name: 'movscript_submit_script_split_draft',
      args: {
        projectId: 42,
        sourceTitle: '总稿',
        sourceSummary: '两个制作的总稿。',
        sourceScript: {
          title: '总稿',
          summary: '两个制作的总稿。',
          sourceType: 'raw',
          lineCount: 4,
        },
        globalSettings: {
          storyWorld: '雨夜城市',
          coreRules: [],
          characterRelationships: [],
          keyCharacters: [],
          keyLocations: [],
          keyProps: [],
          continuityNotes: [],
        },
        episodeDrafts: [{
          order: 1,
          title: '第1集',
          summary: '开场。',
          content: '第1集 雨夜\n便利店相遇。',
          globalContext: {
            storyWorld: '雨夜城市',
            coreRules: [],
            characterRelationships: [],
            keyCharacters: [],
            keyLocations: [],
            keyProps: [],
            continuityNotes: [],
            episodeRelevance: [],
          },
          startLine: 1,
          endLine: 2,
          action: 'create',
          existingScriptId: null,
        }],
      },
    },
  })
  const completed = await waitForRun(runtime, run.id)
  const step = completed.steps.find((item) => item.toolName === 'movscript_submit_script_split_draft')

  assert.equal(completed.status, 'completed_with_warnings')
  assert.equal(step?.status, 'failed')
  assert.match(step?.error ?? '', /content is not allowed; use lineCount\/startLine\/endLine/)
  assert.equal(runtime.listDrafts({ projectId: 42, kind: 'script_split' }).length, 0)
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
  assert.equal(run.traceEvents?.some((event) => event.kind === 'model_call'), false)
})

test('production orchestrate requests include productionId in runtime context', async () => {
  const modelConfigDir = mkdtempSync(join(tmpdir(), 'movscript-agent-production-context-'))
  const originalModelConfigPath = process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH
  const originalFetch = globalThis.fetch
  let requestBody: Record<string, unknown> | undefined
  try {
    process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(modelConfigDir, 'model-config.json')
    const { RuntimeModelConfigStore } = await import('./model/modelConfig.js')
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
          { name: 'movscript_read_current_production', mode: 'allow', approval: 'never' },
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

    const contextMessage = (requestBody?.messages as any[]).find((message) => message?.role === 'system' && typeof message.content === 'string' && message.content.includes('## Current context'))
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

  await createAndWaitForRun(runtime, thread.id)

  assert.equal(runtime.listMemories({ kind: 'draft', projectId: 42 }).length, 1)
})

test('create_draft writes local draft lifecycle metadata and list_drafts returns it', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const runtime = createTestRuntime({ mcpClient: client, draftStore })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个镜头草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const draft = runtime.listDrafts({ projectId: 42, kind: 'content_unit' })[0]

  assert.equal(run.status, 'completed')
  assert.ok(draft)
  assert.equal(draft.status, 'draft')
  assert.equal(draft.kind, 'content_unit')
  assert.equal(draft.createdByRunId, run.id)
  assert.equal(draft.createdByThreadId, thread.id)
  assert.equal(draft.source?.runId, run.id)
  assert.equal(client.calls.some((call) => call.name === 'movscript_create_draft'), false)

  runtime.addMessage(thread.id, { role: 'user', content: '列出当前项目已有的 Agent 草稿。' })
  await createAndWaitForRun(runtime, thread.id)
  assert.equal(client.calls.some((call) => call.name === 'movscript_list_drafts'), false)
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
      permissions: ['draft.read'],
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

test('runtime can enable a local agent bundle and use its tools in later runs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-dynamic-catalog-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const bundlesDir = join(dir, 'bundles')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  try {
    writeJSONFile(skillsDir, 'dynamic.json', {
      skills: [{
        id: 'studio.dynamic.skill',
        name: 'Dynamic Skill',
        description: 'Uses a dynamically enabled MCP tool.',
        enabled: true,
        instruction: 'When the user asks for a dynamic check, call studio_dynamic_echo.',
        appliesWhen: 'dynamic check',
        toolHints: ['studio_dynamic_echo'],
      }],
    })
    writeJSONFile(toolsDir, 'dynamic.json', {
      tools: [{
        name: 'studio_dynamic_echo',
        description: 'Echo dynamic runtime input.',
        permission: 'project.read',
        risk: 'read',
        source: 'plugin',
        projectScoped: false,
        requiresApprovalByDefault: false,
        defaultGrant: { name: 'studio_dynamic_echo', mode: 'allow', approval: 'never' },
      }],
    })
    writeJSONFile(bundlesDir, 'dynamic.json', {
      id: 'studio.bundle.dynamic',
      name: 'Dynamic Bundle',
      skills: ['studio.dynamic.skill'],
      tools: ['studio_dynamic_echo'],
    })
    const loader = (options?: { enabledBundleIds?: string[] }) => loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      bundlesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinBundlesDir: bundlesDir,
      enabledBundleIds: options?.enabledBundleIds ?? [],
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

    const listed = runtime.listAgentBundles() as any
    assert.equal(listed.bundles[0].id, 'studio.bundle.dynamic')
    assert.equal(listed.bundles[0].enabled, false)

    const enabled = runtime.enableAgentBundle({ bundleId: 'studio.bundle.dynamic' }) as any
    assert.equal(enabled.status, 'enabled')
    assert.deepEqual(catalogStateStore.load().enabledBundleIds, ['studio.bundle.dynamic'])

    capabilities = await runtime.getCapabilities({ currentProjectId: 42 })
    assert.equal(capabilities.resolvedTools.byName.studio_dynamic_echo?.available, true)
    assert.equal(runtime.listSkillCatalog().some((skill) => skill.id === 'studio.dynamic.skill'), true)

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

test('agent loop refreshes tools after enabling a bundle in the same run', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-same-run-catalog-'))
  const skillsDir = join(dir, 'skills')
  const toolsDir = join(dir, 'tools')
  const bundlesDir = join(dir, 'bundles')
  const catalogStateStore = new InMemoryAgentCatalogStateStore()
  const originalFetch = globalThis.fetch
  try {
    writeJSONFile(skillsDir, 'dynamic.json', {
      skills: [{
        id: 'studio.same_run.skill',
        name: 'Same Run Dynamic Skill',
        description: 'Uses a newly enabled MCP tool in the same run.',
        enabled: true,
        priority: 100,
        instruction: 'Use studio_same_run_echo after the bundle is enabled.',
        appliesWhen: 'same run catalog',
        toolHints: ['studio_same_run_echo'],
      }],
    })
    writeJSONFile(toolsDir, 'dynamic.json', {
      tools: [{
        name: 'studio_same_run_echo',
        description: 'Echo after same-run catalog refresh.',
        permission: 'project.read',
        risk: 'read',
        source: 'plugin',
        projectScoped: false,
        requiresApprovalByDefault: false,
        defaultGrant: { name: 'studio_same_run_echo', mode: 'allow', approval: 'never' },
      }],
    })
    writeJSONFile(bundlesDir, 'dynamic.json', {
      id: 'studio.bundle.same-run',
      name: 'Same Run Bundle',
      skills: ['studio.same_run.skill'],
      tools: ['studio_same_run_echo'],
    })
    const loader = (options?: { enabledBundleIds?: string[] }) => loadAgentPluginCatalog({
      skillsDir,
      toolsDir,
      bundlesDir,
      builtinSkillsDir: skillsDir,
      builtinToolsDir: toolsDir,
      builtinBundlesDir: bundlesDir,
      enabledBundleIds: options?.enabledBundleIds ?? [],
    })
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
      turn += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, any>
      const toolNames = new Set(((body.tools as any[]) ?? []).map((tool) => tool.function.name))
      if (turn === 1) {
        assert.equal(toolNames.has('movscript_enable_agent_bundle'), true)
        assert.equal(toolNames.has('studio_same_run_echo'), false)
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: 'call_enable_bundle',
                type: 'function',
                function: { name: 'movscript_enable_agent_bundle', arguments: JSON.stringify({ bundleId: 'studio.bundle.same-run' }) },
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
      approvedToolNames: ['movscript_enable_agent_bundle'],
    })

    assert.equal(run.warnings?.join('\n') ?? '', '')
    assert.equal(client.calls.some((call) => call.name === 'studio_same_run_echo'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'movscript_enable_agent_bundle'), true)
    assert.equal(run.steps.some((step) => step.toolName === 'studio_same_run_echo'), true)
    assert.equal(run.traceEvents?.some((event) => event.title === 'Agent catalog refreshed'), true)
  } finally {
    globalThis.fetch = originalFetch
    rmSync(dir, { recursive: true, force: true })
  }
})

test('business production proposal tools upsert scene moments, assets, shots, and keyframes', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const draftStore = new InMemoryAgentDraftStore()
  const draft = draftStore.createDraft({
    projectId: 42,
    kind: 'production_proposal',
    title: '业务编排提案',
    content: JSON.stringify({
      productionId: 4,
      analysisScope: 'production',
      proposal: {
        segments: [{ client_id: 'segment-1', action: 'create', title: '开场', scene_moments: [] }],
      },
    }),
    source: { entityType: 'production', entityId: 4 },
  })
  const runtime = createTestRuntime({ mcpClient: client, draftStore })
  const calls = [
    {
      name: 'movscript_upsert_proposal_scene_moment',
      args: {
        draftId: draft.id,
        segment: { client_id: 'segment-1' },
        sceneMoment: { client_id: 'scene-1', action: 'create', title: '雨夜相遇' },
      },
    },
    {
      name: 'movscript_upsert_proposal_asset',
      args: {
        draftId: draft.id,
        sceneMoment: { client_id: 'scene-1' },
        asset: { client_id: 'asset-1', action: 'create', name: '雨夜街道参考图', kind: 'image' },
      },
    },
    {
      name: 'movscript_upsert_proposal_content_unit',
      args: {
        draftId: draft.id,
        sceneMoment: { client_id: 'scene-1' },
        contentUnit: { client_id: 'shot-1', action: 'create', title: '推近手机', kind: 'shot', description: '中景推近到手机屏幕' },
      },
    },
    {
      name: 'movscript_upsert_proposal_keyframe',
      args: {
        draftId: draft.id,
        shot: { client_id: 'shot-1' },
        keyframe: { client_id: 'kf-1', action: 'create', title: '手机屏幕关键帧', resource_id: 9 },
      },
    },
  ]

  for (const toolCall of calls) {
    const run = runtime.createToolRun({ message: 'production proposal 制作编排', toolCall })
    const completed = await waitForRun(runtime, run.id)
    assert.equal(completed.warnings?.join('\n') ?? '', '')
    assert.equal(completed.status, 'completed')
  }

  const inspectRun = runtime.createToolRun({
    message: 'production proposal 制作编排',
    toolCall: { name: 'movscript_inspect_production_proposal_context', args: { draftId: draft.id, includeNodes: true } },
  })
  const inspected = await waitForRun(runtime, inspectRun.id)
  const inspectResult = inspected.steps[0]?.result as any
  const content = JSON.parse(runtime.getDraft(draft.id)!.content)

  assert.equal(inspected.status, 'completed')
  assert.equal(content.proposal.segments[0].scene_moments[0].asset_slots[0].client_id, 'asset-1')
  assert.equal(content.proposal.segments[0].scene_moments[0].content_units[0].kind, 'shot')
  assert.equal(content.proposal.segments[0].scene_moments[0].content_units[0].keyframes[0].client_id, 'kf-1')
  assert.equal(inspectResult.counts.keyframes, 1)
  assert.equal(inspectResult.nodes.some((node: any) => node.nodeType === 'keyframe' && node.client_id === 'kf-1'), true)
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
