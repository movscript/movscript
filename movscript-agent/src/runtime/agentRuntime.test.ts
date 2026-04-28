import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { AgentRuntime, type AgentRun } from './agentRuntime.js'
import type { JSONValue } from '../types.js'
import { FileAgentStore } from './fileStore.js'
import { InMemoryAgentMemoryStore } from './memory/memoryStore.js'
import { DEFAULT_AGENT_MANIFEST } from './agentManifest.js'

type ToolCallRecord = {
  name: string
  args: Record<string, JSONValue>
}

class FakeMCPClient {
  readonly calls: ToolCallRecord[] = []
  projectId: number | null = null
  failTools = new Set<string>()

  async initialize(): Promise<JSONValue> {
    return { ok: true }
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
        },
      })
    }
    if (name === 'movscript.search_entities') {
      return toolText({ results: [] })
    }
    if (name === 'movscript.create_draft') {
      return toolText({ id: 'draft_test', projectId: args.projectId ?? null })
    }
    if (name === 'movscript.read_entity') {
      return toolText({ id: args.entityId, projectId: args.projectId })
    }
    return toolText({ ok: true })
  }
}

test('does not call search_entities when no current project is selected', async () => {
  const client = new FakeMCPClient()
  client.projectId = null
  const runtime = new AgentRuntime({ mcpClient: client })
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
  const runtime = new AgentRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '搜索主角，并帮我写一个草稿' }] })

  const run = await createAndWaitForRun(runtime, thread.id)
  const search = client.calls.find((call) => call.name === 'movscript.search_entities')
  const draft = client.calls.find((call) => call.name === 'movscript.create_draft')

  assert.equal(run.status, 'completed')
  assert.equal(search?.args.projectId, 42)
  assert.equal(draft?.args.projectId, 42)
})

test('run agentManifest limits tool execution', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = new AgentRuntime({ mcpClient: client })
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
  const runtime = new AgentRuntime({ mcpClient: client })
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
  assert.equal(draft?.args.projectId, 42)
  assert.equal(resumed.pendingApprovals?.[0].status, 'approved')
})

test('run requiring approval can be rejected without executing the tool', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = new AgentRuntime({ mcpClient: client })
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

test('creates visible planning and subagent steps during a run', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = new AgentRuntime({ mcpClient: client })
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
  const runtime = new AgentRuntime({ mcpClient: client })
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
  const dir = mkdtempSync(join(tmpdir(), 'movscript-agent-state-'))
  try {
    const statePath = join(dir, 'state.json')
    const client = new FakeMCPClient()
    client.projectId = 42
    const runtime = new AgentRuntime({ mcpClient: client, store: new FileAgentStore(statePath) })
    const thread = runtime.createThread({ title: 'Persistent thread' })
    runtime.addMessage(thread.id, { role: 'user', content: '搜索主角' })
    const run = await createAndWaitForRun(runtime, thread.id)

    const rebuilt = new AgentRuntime({ mcpClient: new FakeMCPClient(), store: new FileAgentStore(statePath) })
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
  const runtime = new AgentRuntime({ mcpClient: client })
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

test('preference memories are written and loaded by the next run', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const memoryStore = new InMemoryAgentMemoryStore()
  const runtime = new AgentRuntime({ mcpClient: client, memoryStore })
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
  const runtime = new AgentRuntime({ mcpClient: client, memoryStore })
  memoryStore.createMemory({
    scope: 'project',
    projectId: 42,
    kind: 'preference',
    content: '默认镜头风格是手持纪实',
  })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个镜头草稿' }] })

  await createAndWaitForRun(runtime, thread.id)
  const draft = client.calls.find((call) => call.name === 'movscript.create_draft')

  assert.match(String(draft?.args.content ?? ''), /默认镜头风格是手持纪实/)
})

test('create_draft success writes draft memory', async () => {
  const client = new FakeMCPClient()
  client.projectId = 42
  const runtime = new AgentRuntime({ mcpClient: client })
  const thread = runtime.createThread({ messages: [{ role: 'user', content: '帮我写一个草稿' }] })

  await createAndWaitForRun(runtime, thread.id)

  assert.equal(runtime.listMemories({ kind: 'draft', projectId: 42 }).length, 1)
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
