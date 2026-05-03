import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAssistantContent } from './assistantMessage.js'
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
      call: { name: 'movscript.search_entities', args: { query: '主角' } },
      result: toolText({ results: [{ id: 1 }, { id: 2 }] }),
    },
    {
      call: { name: 'movscript.create_draft', args: { kind: 'note' } },
      error: 'create failed',
    },
  ])

  assert.match(content, /找到 2 条结果/)
  assert.match(content, /movscript\.create_draft 未完成：create failed/)
})

test('assistant message returns JSON for production plan commands', () => {
  const content = buildAssistantContent('/production_plan 第一场', [
    {
      call: { name: 'movscript.read_project_structure', args: { limit: 50 } },
      result: toolText({ counts: { scripts: 1 } }),
    },
  ], [], [], makePlanRun())
  const parsed = JSON.parse(content) as Record<string, unknown>

  assert.equal(parsed.command, '/production_plan')
  assert.equal(parsed.runId, 'run_test')
  assert.equal(parsed.planner, 'rule')
  assert.equal(Array.isArray(parsed.tasks), true)
})

test('assistant message keeps project plan alias but returns canonical production plan command', () => {
  const content = buildAssistantContent('/project_plan 第一场', [], [], [], makePlanRun())
  const parsed = JSON.parse(content) as Record<string, unknown>

  assert.equal(parsed.command, '/production_plan')
})

test('assistant message returns JSON for inspect context commands', () => {
  const content = buildAssistantContent('/inspect_context', [], ['warn'], [], makeContextRun())
  const parsed = JSON.parse(content) as Record<string, any>

  assert.equal(parsed.command, '/inspect_context')
  assert.equal(parsed.context.project.id, 42)
  assert.deepEqual(parsed.labels, ['debug'])
  assert.deepEqual(parsed.warnings, ['warn'])
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

function makePlanRun(): AgentRun {
  return {
    id: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    metadata: { planner: 'rule' },
    steps: [],
    plan: {
      id: 'plan_test',
      objective: '第一场',
      strategy: 'compile production plan',
      createdAt: '2026-05-03T00:00:00.000Z',
      updatedAt: '2026-05-03T00:00:00.000Z',
      tasks: [
        {
          id: 'task_test',
          title: '编排剧本生产计划',
          description: '返回 JSON 计划',
          agentRole: 'planner',
          status: 'completed',
          toolCalls: [{ name: 'movscript.read_project_structure', args: { limit: 50 } }],
          createdAt: '2026-05-03T00:00:00.000Z',
          successCriteria: 'JSON plan',
        },
      ],
    },
  }
}

function makeContextRun(): AgentRun {
  return {
    id: 'run_context',
    threadId: 'thread_context',
    status: 'completed',
    createdAt: '2026-05-03T00:00:00.000Z',
    updatedAt: '2026-05-03T00:00:00.000Z',
    steps: [],
    envelope: {
      id: 'envelope_context',
      threadId: 'thread_context',
      runId: 'run_context',
      mode: 'run',
      message: { role: 'user', content: '/inspect_context' },
      history: [],
      context: {
        route: { pathname: '/agent/debug' },
        project: { id: 42, name: 'Demo' },
        selection: null,
        recentResources: [],
        attachments: [],
        memories: [],
        labels: ['debug'],
      },
      manifest: {
        schema: 'movscript.agent.v1',
        id: 'test',
        version: '1.0.0',
        name: 'Test',
        permissions: [],
        tools: [],
        skills: [],
      },
      skills: [],
      tools: { discovered: [], available: [], blocked: [], byName: {} },
      policy: {
        approvalMode: 'interactive',
        maxToolCalls: 5,
        maxIterations: 3,
        allowNetwork: false,
        allowFileBytes: false,
      },
      memories: [],
      debug: {
        source: 'runtime',
        warnings: [],
      },
    },
  }
}
