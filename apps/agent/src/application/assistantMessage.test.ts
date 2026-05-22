import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAssistantContent,
  buildAssistantMessages,
  buildFinalAssistantContent,
  combineAssistantTurnContents,
  extractRequestedToolCallsFromAssistantContent,
  isMessageRole,
} from './assistantMessage.js'
import type { JSONValue } from '../types.js'
import type { AgentRun } from '../state/types.js'

test('assistant message surfaces missing project warning', () => {
  const content = buildAssistantContent('搜索角色', [], ['当前没有选中项目'])

  assert.match(content, /当前没有选中项目/)
  assert.match(content, /请先在 MovScript 中选中项目/)
})

test('assistant message describes successful and failed tool outcomes', () => {
  const content = buildAssistantContent('搜索并写草稿', [
    {
      call: { name: 'draft_create', args: { kind: 'project_standards_proposal' } },
      error: 'create failed',
    },
  ])
  assert.match(content, /draft_create 未完成：create failed/)
})

test('assistant message describes tool reads', () => {
  const content = buildAssistantContent('/taskGraph 第一场', [
    {
      call: { name: 'movscript_script_locate', args: { projectId: 42 } },
      result: toolText({ counts: { scripts: 3 } }),
    },
  ], [], [], makeRun())

  assert.throws(() => JSON.parse(content))
  assert.match(content, /movscript_script_locate/i)
})

test('assistant message extracts tool calls from model JSON content', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_calls: [
      {
        name: 'movscript_script_locate',
        parameters: { project_id: 1 },
      },
    ],
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'movscript_script_locate')
  assert.equal(toolCalls[0].args?.project_id, 1)
  assert.equal(toolCalls[0].args?.projectId, 1)
})

test('assistant message ignores invalid model-emitted project and production ids', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_calls: [
      {
        name: 'draft_create',
        parameters: {
          project_id: '42',
          production_id: 7.5,
          projectId: 0,
          productionId: Number.NaN,
          kind: 'project_standards_proposal',
        },
      },
    ],
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'draft_create')
  assert.equal(toolCalls[0].args?.project_id, undefined)
  assert.equal(toolCalls[0].args?.projectId, undefined)
  assert.equal(toolCalls[0].args?.production_id, undefined)
  assert.equal(toolCalls[0].args?.productionId, undefined)
  assert.equal(toolCalls[0].args?.kind, 'note')
})

test('configured assistant messages prefer resolved skill instructions from run metadata', () => {
  const run = makeRun()
  run.metadata = {
    ...(run.metadata ?? {}),
    skills: [{
      id: 'core.policy.runtime',
      name: 'Agent Core Capability Policy',
      instruction: 'Core skill instruction from catalog.',
    }],
  }

  const messages = buildAssistantMessages('总结结果', [], [], [], run)
  const systemText = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')

  assert.match(systemText, /Agent Core Capability Policy/)
  assert.match(systemText, /Core skill instruction from catalog/)
  assert.doesNotMatch(systemText, /You are MovScript Agent/)
  assert.doesNotMatch(systemText, /Final responses must leave durable handoff anchors/)
})

test('configured assistant messages ignore non-plain skill metadata records', () => {
  class RuntimeSkill {
    name = 'Runtime Skill'
    instruction = 'Do not trust prototype skill records.'
  }

  const run = makeRun()
  run.metadata = {
    ...(run.metadata ?? {}),
    skills: [
      new RuntimeSkill(),
      {
        id: 'core.policy.runtime',
        instruction: 'Core skill instruction from catalog.',
      },
    ] as never,
  }

  const messages = buildAssistantMessages('总结结果', [], [], [], run)
  const systemText = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n')

  assert.doesNotMatch(systemText, /Runtime Skill/)
  assert.doesNotMatch(systemText, /Do not trust prototype skill records/)
  assert.match(systemText, /core\.policy\.runtime/)
  assert.match(systemText, /Core skill instruction from catalog/)
})

test('assistant message extracts a single tool call returned as JSON content', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    name: 'draft_create',
    args: {
      projectId: 1,
      kind: 'production_proposal',
      proposal: true,
      content: JSON.stringify({ proposal: { segments: [] } }),
    },
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'draft_create')
  assert.equal(toolCalls[0].args?.projectId, 1)
  assert.equal(toolCalls[0].args?.kind, 'production_proposal')
})

test('assistant message extracts model-emitted single tool_call wrapper', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_call: {
      tool_name: 'core_file_read',
      parameters: {
        ref: 'agent://draft/draft_1/content',
      },
    },
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'core_file_read')
  assert.equal(toolCalls[0].args?.ref, 'agent://draft/draft_1/content')
})

test('isMessageRole accepts only thread-visible message roles', () => {
  assert.equal(isMessageRole('system'), true)
  assert.equal(isMessageRole('user'), true)
  assert.equal(isMessageRole('assistant'), true)
  assert.equal(isMessageRole('tool'), false)
})

test('combineAssistantTurnContents trims empty turns and avoids adjacent duplicates', () => {
  assert.equal(combineAssistantTurnContents([' first ', 'first', '', 'second'], 'second'), 'first\n\nsecond')
  assert.equal(combineAssistantTurnContents([], ' fallback '), 'fallback')
})

test('combineAssistantTurnContents avoids repeated final text across non-adjacent model turns', () => {
  assert.equal(
    combineAssistantTurnContents(['Final answer', 'Tool preface', 'Final answer'], 'Final   answer'),
    'Final answer\n\nTool preface',
  )
})

test('buildFinalAssistantContent keeps normal final replies free of technical source summaries', () => {
  const content = buildFinalAssistantContent({
    userMessage: '总结一下',
    modelContent: '这是最终回答。',
    toolResults: [],
    warnings: [],
    memories: [],
    run: makeRun(),
  })

  assert.match(content, /这是最终回答。/)
  assert.doesNotMatch(content, /来源：/)
  assert.doesNotMatch(content, /source=user_input/)
})

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

function makeRun(): AgentRun {
  return {
    id: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    metadata: {
      context: {
        route: { pathname: '/agent/debug' },
        projects: [{ id: 42, name: 'Demo' }],
        project: { id: 42, name: 'Demo' },
        selection: null,
        recentResources: [],
        attachments: [],
        memories: [],
        labels: ['debug'],
      },
    },
    steps: [
      {
        id: 'step_tool',
        runId: 'run_test',
      type: 'tool_call',
      status: 'completed',
      toolName: 'movscript_script_locate',
      args: { projectId: 42 },
      createdAt: '2026-05-03T00:00:00.000Z',
      completedAt: '2026-05-03T00:00:00.000Z',
    },
    ],
  }
}
