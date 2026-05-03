import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAssistantContent, extractRequestedToolCallsFromAssistantContent } from './assistantMessage.js'
import type { JSONValue } from '../types.js'
import type { AgentRun } from './types.js'

test('assistant message surfaces missing project warning', () => {
  const content = buildAssistantContent('搜索角色', [], ['当前没有选中项目'])

  assert.match(content, /当前没有选中项目/)
  assert.match(content, /请先在 MovScript 中选中项目/)
})

test('assistant message describes successful and failed tool outcomes', () => {
  const content = buildAssistantContent('搜索并写草稿', [
    {
      call: { name: 'movscript_search_entities', args: { query: '主角' } },
      result: toolText({ results: [{ id: 1 }, { id: 2 }] }),
    },
    {
      call: { name: 'movscript_create_draft', args: { kind: 'note' } },
      error: 'create failed',
    },
  ])

  assert.match(content, /找到 2 条结果/)
  assert.match(content, /movscript\.create_draft 未完成：create failed/)
})

test('assistant message returns JSON for production plan commands from run steps', () => {
  const content = buildAssistantContent('/production_plan 第一场', [
    {
      call: { name: 'movscript_read_project_structure', args: { limit: 50 } },
      result: toolText({ counts: { scripts: 1 } }),
    },
  ], [], [], makeRun())
  const parsed = JSON.parse(content) as Record<string, any>

  assert.equal(parsed.command, '/production_plan')
  assert.equal(parsed.runId, 'run_test')
  assert.equal(parsed.strategy, 'agentic_loop')
  assert.equal(parsed.steps[0].toolName, 'movscript_read_project_structure')
})

test('assistant message returns JSON for inspect context commands', () => {
  const content = buildAssistantContent('/inspect_context', [], ['warn'], [], makeRun())
  const parsed = JSON.parse(content) as Record<string, any>

  assert.equal(parsed.command, '/inspect_context')
  assert.equal(parsed.context.project.id, 42)
  assert.deepEqual(parsed.labels, ['debug'])
  assert.deepEqual(parsed.warnings, ['warn'])
})

test('assistant message extracts tool calls from model JSON content', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_calls: [
      {
        name: 'movscript_read_production_context',
        parameters: { production_id: 4, project_id: 1 },
      },
    ],
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'movscript_read_production_context')
  assert.equal(toolCalls[0].args?.production_id, 4)
})

test('assistant message extracts a single tool call returned as JSON content', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    name: 'movscript_propose_production_entities',
    args: {
      projectId: 1,
      productionId: 4,
      candidates: {
        scene_moments: [{ client_id: 'sm_001', segment_id: 39 }],
      },
    },
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'movscript_propose_production_entities')
  assert.equal(toolCalls[0].args?.projectId, 1)
  assert.equal(toolCalls[0].args?.productionId, 4)
})

test('assistant message extracts model-emitted single tool_call wrapper', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_call: {
      tool_name: 'movscript_check_entity_conflicts',
      parameters: {
        project_id: 1,
        production_id: 4,
        candidates: {
          scene_moments: [{ client_id: 'sm_001', segment_id: 39 }],
        },
      },
    },
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'movscript_check_entity_conflicts')
  assert.equal(toolCalls[0].args?.projectId, 1)
  assert.equal(toolCalls[0].args?.productionId, 4)
  assert.deepEqual((toolCalls[0].args?.candidates as any)?.scene_moments, [{ client_id: 'sm_001', segment_id: 39 }])
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
        toolName: 'movscript_read_project_structure',
        args: { limit: 50 },
        createdAt: '2026-05-03T00:00:00.000Z',
        completedAt: '2026-05-03T00:00:00.000Z',
      },
    ],
  }
}
