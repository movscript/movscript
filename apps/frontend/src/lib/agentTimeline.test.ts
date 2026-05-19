import assert from 'node:assert/strict'
import test from 'node:test'
import { agentTimelineSummary, buildAgentRunTimeline, formatToolCallStreamDetail } from './agentTimeline'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/store/agentStore'

test('buildAgentRunTimeline creates one stable timeline for approvals inputs tools and generation events', () => {
  const activity: ChatRunActivity = {
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:05.000Z',
    approvals: [{
      id: 'approval_1',
      runId: 'run_1',
      toolName: 'movscript_publish_assets',
      reason: 'Publish reviewed asset metadata.',
      risk: 'write',
      permission: 'project.assets.write',
      status: 'approved',
      createdAt: '2026-05-17T00:00:01.000Z',
      updatedAt: '2026-05-17T00:00:02.000Z',
      approvedAt: '2026-05-17T00:00:02.000Z',
    }],
    inputs: [{
      id: 'input_1',
      runId: 'run_1',
      title: '选择方向',
      question: '继续哪个方案？',
      inputType: 'choice',
      choices: [{ id: 'a', label: 'A' }],
      allowCustomAnswer: false,
      status: 'answered',
      answer: { choiceIds: ['a'] },
      createdAt: '2026-05-17T00:00:03.000Z',
      updatedAt: '2026-05-17T00:00:04.000Z',
      answeredAt: '2026-05-17T00:00:04.000Z',
    }],
    steps: [{
      id: 'step_1',
      type: 'tool_call',
      status: 'completed',
      toolName: 'movscript_create_generation_job',
      createdAt: '2026-05-17T00:00:02.500Z',
      completedAt: '2026-05-17T00:00:03.500Z',
    }],
    events: [{
      id: 'trace_generation',
      kind: 'tool_call',
      title: 'Generation job updated',
      status: 'completed',
      data: {
        generation: {
          jobId: 42,
          status: 'succeeded',
          stage: 'completed',
          progress: 100,
          outputResourceIds: [7, 8],
        },
      },
      createdAt: '2026-05-17T00:00:05.000Z',
      completedAt: '2026-05-17T00:00:05.100Z',
    }],
  }

  const timeline = buildAgentRunTimeline({ activity })

  assert.ok(timeline)
  assert.equal(timeline.stepCount, 1)
  assert.equal(timeline.actionCount, 2)
  assert.equal(agentTimelineSummary(timeline), '1/1 个步骤 · 2 个交互')
  assert.deepEqual(timeline.items.map((item) => item.id), [
    'approval-approval_1',
    'step-step_1',
    'input-input_1',
    'event-trace_generation',
  ])
  assert.equal(timeline.items[0]?.type, 'approval')
  assert.equal(timeline.items[0]?.statusLabel, '已同意')
  assert.equal(timeline.items[1]?.title, '创建生成任务')
  assert.equal(timeline.items[2]?.summary, '选择：a')
  assert.equal(timeline.items[3]?.type, 'generation_job')
  assert.equal(timeline.items[3]?.title, '生成任务 #42')
  assert.match(timeline.items[3]?.summary ?? '', /100%/)
})

test('formatToolCallStreamDetail summarizes streamed tool call arguments', () => {
  const event: ChatRunActivityEvent = {
    id: 'trace_tool_delta',
    kind: 'tool_call',
    title: 'Model tool call delta',
    status: 'info',
    data: {
      stream: {
        toolCall: {
          name: 'movscript_read_project',
          parseStatus: 'valid_json',
          argumentsBuffer: '{"projectId":1}',
          argumentsJSON: { projectId: 1 },
        },
      },
    },
    createdAt: '2026-05-17T00:00:00.000Z',
  }

  assert.deepEqual(formatToolCallStreamDetail(event), {
    label: 'movscript_read_project',
    parseStatus: '参数已解析',
    args: '{"projectId":1}',
    parsedArgs: { projectId: 1 },
  })
})

test('buildAgentRunTimeline keeps approval and input trace events as action items', () => {
  const events: ChatRunActivityEvent[] = [
    {
      id: 'trace_approval',
      kind: 'approval',
      title: 'Tool approval resolved',
      summary: '用户已同意',
      status: 'completed',
      data: { approval: { status: 'approved' } },
      createdAt: '2026-05-17T00:00:00.000Z',
      completedAt: '2026-05-17T00:00:01.000Z',
    },
    {
      id: 'trace_input',
      kind: 'input',
      title: 'User input answered',
      summary: '用户已回答',
      status: 'completed',
      data: { input: { status: 'answered' } },
      createdAt: '2026-05-17T00:00:02.000Z',
      completedAt: '2026-05-17T00:00:03.000Z',
    },
  ]

  const timeline = buildAgentRunTimeline({ events })

  assert.ok(timeline)
  assert.equal(timeline.actionCount, 2)
  assert.deepEqual(timeline.items.map((item) => item.type), ['approval', 'input_request'])
  assert.equal(timeline.items[0]?.statusLabel, '已同意')
  assert.equal(timeline.items[1]?.statusLabel, '已回答')
})

test('buildAgentRunTimeline deduplicates live events already present on activity', () => {
  const activity: ChatRunActivity = {
    runId: 'run_1',
    threadId: 'thread_1',
    status: 'in_progress',
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:01.000Z',
    steps: [],
    events: [{
      id: 'trace_1',
      kind: 'tool_call',
      title: 'Tool call',
      status: 'in_progress',
      createdAt: '2026-05-17T00:00:00.000Z',
    }],
  }

  const timeline = buildAgentRunTimeline({
    activity,
    events: [{
      id: 'trace_1',
      kind: 'tool_call',
      title: 'Tool call',
      status: 'in_progress',
      createdAt: '2026-05-17T00:00:00.000Z',
    }],
  })

  assert.ok(timeline)
  assert.deepEqual(timeline.items.map((item) => item.id), ['event-trace_1'])
})
