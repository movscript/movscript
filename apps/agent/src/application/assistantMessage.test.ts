import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAssistantContent, extractRequestedToolCallsFromAssistantContent } from './assistantMessage.js'
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
      call: { name: 'movscript_create_draft', args: { kind: 'note' } },
      error: 'create failed',
    },
  ])
  assert.match(content, /movscript\.create_draft 未完成：create failed/)
})

test('assistant message describes current production reads', () => {
  const content = buildAssistantContent('/production_plan 第一场', [
    {
      call: { name: 'movscript_read_current_production', args: { projectId: 42, productionId: 4 } },
      result: toolText({ counts: { segments: 1, sceneMoments: 2 } }),
    },
  ], [], [], makeRun())

  assert.throws(() => JSON.parse(content))
  assert.match(content, /read_current_production/i)
})

test('assistant message extracts tool calls from model JSON content', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_calls: [
      {
        name: 'movscript_read_current_production',
        parameters: { production_id: 4, project_id: 1 },
      },
    ],
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'movscript_read_current_production')
  assert.equal(toolCalls[0].args?.production_id, 4)
})

test('assistant message extracts a single tool call returned as JSON content', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    name: 'movscript_submit_production_proposal',
    args: {
      projectId: 1,
      productionId: 4,
      proposal: {
        segments: [{ client_id: 'segment_001', action: 'create', title: '开场' }],
      },
    },
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'movscript_submit_production_proposal')
  assert.equal(toolCalls[0].args?.projectId, 1)
  assert.equal(toolCalls[0].args?.productionId, 4)
})

test('assistant message extracts model-emitted single tool_call wrapper', () => {
  const toolCalls = extractRequestedToolCallsFromAssistantContent(JSON.stringify({
    tool_call: {
      tool_name: 'movscript_inspect_production_proposal_context',
      parameters: {
        proposalRef: 'draft_1',
        includeNodes: true,
      },
    },
  }))

  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].name, 'movscript_inspect_production_proposal_context')
  assert.equal(toolCalls[0].args?.proposalRef, 'draft_1')
  assert.equal(toolCalls[0].args?.includeNodes, true)
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
      toolName: 'movscript_read_current_production',
      args: { projectId: 42, productionId: 4 },
      createdAt: '2026-05-03T00:00:00.000Z',
      completedAt: '2026-05-03T00:00:00.000Z',
    },
    ],
  }
}
