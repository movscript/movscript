import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { AgentRuntime, type AgentRun } from './agentRuntime.js'
import type { JSONValue } from '../types.js'
import { FileAgentStore } from './fileStore.js'
import { FileAgentDraftStore, InMemoryAgentDraftStore } from './draftStore.js'
import { InMemoryAgentMemoryStore } from './memory/memoryStore.js'
import { DEFAULT_AGENT_MANIFEST } from './agentManifest.js'
import type { AgentModelPlanner, ModelPlannerResult } from './modelPlanner.js'
import { BackendApplyClient, type BackendApplyResult } from './backendApplyClient.js'
import type { ApplyDraftReview } from './draftApply.js'

process.env.MOVSCRIPT_AGENT_MODEL_CONFIG_PATH = join(mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-test-')), 'model-config.json')

type ToolCallRecord = {
  name: string
  args: Record<string, JSONValue>
}

class FakeMCPClient {
  readonly calls: ToolCallRecord[] = []
  projectId: number | null = null
  userId: number | null = null
  failTools = new Set<string>()

  async initialize(): Promise<JSONValue> {
    return { ok: true }
  }

  async listResources(): Promise<any[]> {
    return []
  }

  async listTools(): Promise<any[]> {
    return [
      { name: 'movscript.search_entities', description: 'Search project entities by keyword.', inputSchema: {} },
      { name: 'movscript.read_entity', description: 'Read a single project entity.', inputSchema: {} },
      { name: 'movscript.read_project_structure', description: 'Read project structure.', inputSchema: {} },
      { name: 'movscript.open_entity', description: 'Open an entity.', inputSchema: {} },
    ]
  }

  async callTool(name: string, args: Record<string, JSONValue> = {}): Promise<JSONValue> {
    this.calls.push({ name, args })
    if (this.failTools.has(name)) {
      throw new Error(`${name} failed`)
    }
    if (name === 'movscript.get_context_pack') {
      return toolText({
        snapshot: {
          project: this.projectId === null ? null : { id: this.projectId, name: 'Test Project' },
          user: this.userId === null ? null : { id: this.userId, username: 'tester' },
        },
      })
    }
    if (name === 'movscript.search_entities') {
      return toolText({ results: [] })
    }
    if (name === 'movscript.read_project_structure') {
      return toolText({
        counts: {
          scripts: 1,
          settings: 0,
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
    if (name === 'movscript.read_entity') {
      return toolText({ id: args.entityId, projectId: args.projectId })
    }
    return toolText({ ok: true })
  }
}

class FakeModelPlanner implements AgentModelPlanner {
  enabled = true
  error?: Error
  calls = 0

  constructor(private readonly result: ModelPlannerResult) {}

  isEnabled(): boolean {
    return this.enabled
  }

  async plan(): Promise<ModelPlannerResult> {
    this.calls += 1
    if (this.error) throw this.error
    return this.result
  }
}

class FakeBackendApplyClient extends BackendApplyClient {
  readonly calls: Array<{ review: ApplyDraftReview; userId?: number | string }> = []
  result: BackendApplyResult = {
    performed: true,
    method: 'PATCH',
    url: 'http://backend/api/v1/projects/42/entities/content-units/7',
    payload: { description: 'New content-unit description' },
  }

  override isEnabled(): boolean {
    return true
  }

  override async applyReview(review: ApplyDraftReview, userId?: number | string): Promise<BackendApplyResult> {
    this.calls.push({ review, userId })
    return this.result
  }
}

function createTestRuntime(options: ConstructorParameters<typeof AgentRuntime>[0]): AgentRuntime {
  return new AgentRuntime({ modelPlanner: false, ...options })
}

test('does not call search_entities when no current project is selected', async () => {
  const client = new FakeMCPClient()
  client.projectId = null
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '搜索主角相关内容' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)

  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(client.calls.some((call) => call.name === 'movscript.search_entities'), false)
  assert.match(assistant?.content ?? '', /当前没有选中项目/)
})

test('adds current projectId to search and draft tool calls', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '搜索主角，并帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const search = client.calls.find((call) => call.name === 'movscript.search_entities')
  const draft = client.calls.find((call) => call.name === 'movscript.create_draft')

  assert.equal(run.status, 'completed')
  assert.equal(search?.args.projectId, 42)
  assert.equal(draft, undefined)
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
      tools: [{ name: 'movscript.create_draft', mode: 'allow', approval: 'always' }],
    },
  })

  assert.equal(preview.status, 'preview')
  assert.equal(preview.threadId, thread.id)
  assert.equal(preview.currentProjectId, 42)
  assert.equal(preview.pendingApprovals[0]?.toolName, 'movscript.create_draft')
  assert.equal(preview.agentManifest?.schema, 'movscript.agent.current')
  assert.ok(preview.context)
  assert.ok(preview.skills)
  assert.ok(preview.tools?.available.some((tool) => tool.name === 'movscript.create_draft'))
  assert.ok(preview.promptPreview?.debugParts.some((part) => part.kind === 'tool'))
  assert.equal(preview.toolCalls.length, 0)
  assert.equal(runtime.listRuns().length, 0)
  assert.equal(client.calls.some((call) => call.name === 'movscript.create_draft'), false)
  assert.deepEqual(client.calls.map((call) => call.name), ['movscript.get_context_pack'])
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

test('uses model planner when configured', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const planner = new FakeModelPlanner({
    warnings: [],
    toolCalls: [{ name: 'movscript.search_entities', args: { query: '主角', limit: 3 } }],
    plan: {
      id: 'plan_model',
      objective: '模型规划检索主角',
      strategy: 'Use model-generated search plan.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tasks: [{
        id: 'task_model',
        title: '检索主角资料',
        description: 'Search project entities for protagonist material.',
        agentRole: 'researcher',
        status: 'pending',
        toolCalls: [{ name: 'movscript.search_entities', args: { query: '主角', limit: 3 } }],
        createdAt: new Date().toISOString(),
        successCriteria: '找到相关项目实体。',
      }],
    },
  })
  const runtime = createTestRuntime({ mcpClient: client, modelPlanner: planner })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我看看主角资料' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const search = client.calls.find((call) => call.name === 'movscript.search_entities')

  assert.equal(run.status, 'completed')
  assert.equal(planner.calls, 1)
  assert.equal(run.plan?.id, 'plan_model')
  assert.equal(run.metadata?.planner, 'model')
  assert.equal(search?.args.query, '主角')
  assert.equal(search?.args.projectId, 42)
  assert.equal(run.steps.find((step) => step.type === 'planning')?.result && (run.steps.find((step) => step.type === 'planning')?.result as any).planner, 'model')
})

test('falls back to rule planner when model planner fails', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const planner = new FakeModelPlanner({
    warnings: [],
    toolCalls: [],
    plan: {
      id: 'unused',
      objective: 'unused',
      strategy: 'unused',
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })
  planner.error = new Error('planner unavailable')
  const runtime = createTestRuntime({ mcpClient: client, modelPlanner: planner })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '搜索主角' }] })

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(planner.calls, 1)
  assert.equal(run.metadata?.planner, 'rule')
  assert.match(run.warnings?.join('\n') ?? '', /model planner fallback: planner unavailable/)
  assert.equal(client.calls.some((call) => call.name === 'movscript.search_entities'), true)
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
      tools: [{ name: 'movscript.search_entities', mode: 'allow' }],
    },
  })

  assert.equal(capabilities.mcp.connected, true)
  assert.ok(capabilities.resolvedTools.available.some((tool) => tool.name === 'movscript.search_entities'))
  assert.equal(capabilities.resolvedTools.byName['movscript.create_draft']?.unavailableReason, 'not_granted')
})

test('runtime draft tools are available without MCP tool discovery', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })

  const capabilities = await runtime.getCapabilities({ currentProjectId: 42 })

  assert.equal(capabilities.resolvedTools.byName['movscript.create_draft']?.source, 'runtime')
  assert.equal(capabilities.resolvedTools.byName['movscript.create_draft']?.available, true)
  assert.equal(capabilities.resolvedTools.byName['movscript.list_drafts']?.available, true)
})

test('run agentManifest limits tool execution', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '搜索主角，并帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id, {
    agentManifest: {
      ...DEFAULT_AGENT_MANIFEST,
      permissions: ['project.read'],
      tools: [{ name: 'movscript.search_entities', mode: 'allow' }],
    },
  })
  const search = client.calls.find((call) => call.name === 'movscript.search_entities')
  const draft = client.calls.find((call) => call.name === 'movscript.create_draft')

  assert.equal(run.status, 'completed_with_warnings')
  assert.equal(search?.args.projectId, 42)
  assert.equal(draft, undefined)
  assert.deepEqual(run.agentManifest?.permissions, ['project.read'])
  assert.match(run.warnings?.join('\n') ?? '', /movscript\.create_draft 未被当前 agent manifest 授权/)
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
      tools: [{ name: 'movscript.create_draft', mode: 'allow', approval: 'always' }],
    },
  })

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript.create_draft')
  assert.equal(client.calls.some((call) => call.name === 'movscript.create_draft'), false)

  runtime.approveRun(run.id)
  const resumed = await waitForRun(runtime, run.id)
  const draft = client.calls.find((call) => call.name === 'movscript.create_draft')

  assert.equal(resumed.status, 'completed')
  assert.equal(draft, undefined)
  assert.equal(runtime.listDrafts({ projectId: 42 }).length, 1)
  assert.equal(resumed.pendingApprovals?.[0].status, 'approved')
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
      tools: [{ name: 'movscript.create_draft', mode: 'allow', approval: 'always' }],
    },
  })
  const rejected = runtime.rejectRun(run.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === rejected.assistantMessageId)

  assert.equal(rejected.status, 'completed_with_warnings')
  assert.equal(rejected.pendingApprovals?.[0].status, 'rejected')
  assert.equal(client.calls.some((call) => call.name === 'movscript.create_draft'), false)
  assert.match(assistant?.content ?? '', /已取消需要确认的工具调用/)
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

  const run = await createAndWaitForRun(runtime, thread.id)

  assert.equal(run.status, 'requires_action')
  assert.equal(run.pendingApprovals?.[0].toolName, 'movscript.apply_draft')
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
    toolCall: {
      name: 'movscript.apply_draft',
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
  assert.equal(waiting.plan?.tasks[0]?.toolCalls.length, 0)
  assert.equal(waiting.pendingApprovals?.[0].toolName, 'movscript.apply_draft')
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

  await createAndWaitForRun(runtime, thread.id)
  const waiting = runtime.listRuns()[0]
  runtime.approveRun(waiting.id)
  await waitForRun(runtime, waiting.id)

  assert.equal(backendApplyClient.calls[0].userId, 9)
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

test('creates visible planning and subagent steps during a run', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '规划一下：搜索主角，并帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const planning = run.steps.find((step) => step.type === 'planning')
  const subagents = run.steps.filter((step) => step.type === 'subagent')
  const childToolCall = run.steps.find((step) => step.type === 'tool_call' && step.parentStepId)

  assert.ok(run.plan)
  assert.ok(planning)
  assert.equal(subagents.length >= 3, true)
  assert.ok(childToolCall)
})

test('returns assistant message and failed step when one tool fails', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  client.failTools.add('movscript.search_entities')
  const runtime = createTestRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '搜索主角，并帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const finalThread = runtime.getThread(thread.id)
  const assistant = finalThread?.messages.find((message) => message.id === run.assistantMessageId)
  const failedSearch = run.steps.find((step) => (
    step.toolName === 'movscript.search_entities' && step.status === 'failed'
  ))

  assert.equal(run.status, 'completed_with_warnings')
  assert.ok(failedSearch)
  assert.match(assistant?.content ?? '', /movscript\.search_entities 未完成/)
  assert.ok(runtime.listMemories({ kind: 'warning', threadId: thread.id }).length >= 1)
})

test('persists threads, messages, runs, and steps across runtime rebuilds', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-production-runtime-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = createTestRuntime({ mcpClient: client, store: new FileAgentStore(statePath) })
    const thread = runtime.createThread({ title: 'Persistent thread' })
    runtime.addMessage(thread.id, { role: 'user', content: '搜索主角' })
    const run = await createAndWaitForRun(runtime, thread.id)

    const rebuilt = createTestRuntime({ mcpClient: new FakeMCPClient(), store: new FileAgentStore(statePath) })
    const restoredThread = rebuilt.getThread(thread.id)
    const restoredRun = rebuilt.getRun(run.id)

    assert.equal(restoredThread?.title, 'Persistent thread')
    assert.equal(restoredThread?.messages.some((message) => message.role === 'user'), true)
    assert.equal(restoredRun?.status, 'completed')
    assert.ok(restoredRun?.steps.some((step) => step.type === 'tool_call'))
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
  const dir = mkdtempSync(join(tmpdir(), 'movscript-production-runtime-state-'))
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

test('preference memories are written and loaded by the next run', async () => {
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

  assert.ok((secondRun.metadata?.memoryIds as string[]).includes(preference.id))
  assert.match(assistant?.content ?? '', /已参考 \d+ 条记忆/)
})

test('relevant memories are injected into create_draft content', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const memoryStore = new InMemoryAgentMemoryStore()
  const runtime = createTestRuntime({ mcpClient: client, memoryStore })
  memoryStore.createMemory({
    scope: 'project',
    projectId: 42,
    kind: 'preference',
    content: '默认镜头风格是手持纪实',
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个镜头草稿' }] })

  await createAndWaitForRun(runtime, thread.id)
  const draft = client.calls.find((call) => call.name === 'movscript.create_draft')

  assert.equal(draft, undefined)
  assert.match(runtime.listDrafts({ projectId: 42 })[0]?.content ?? '', /默认镜头风格是手持纪实/)
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
  assert.equal(client.calls.some((call) => call.name === 'movscript.create_draft'), false)

  runtime.addMessage(thread.id, { role: 'user', content: '列出当前项目已有的 Agent 草稿。' })
  await createAndWaitForRun(runtime, thread.id)
  assert.equal(client.calls.some((call) => call.name === 'movscript.list_drafts'), false)
})

test('file draft store persists drafts across runtime rebuilds', () => {
  const dir = mkdtempSync(join(tmpdir(), 'movscript-production-runtime-drafts-'))
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
