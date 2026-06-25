import assert from 'node:assert/strict'
import test from 'node:test'

import { agentActivityFeedMarkdown, buildAgentActivityFeed, feedTotalsLine } from '@/features/agent/presentation/agentActivityFeed'
import type { ChatRunActivity } from '@/features/agent/state/agentStore'

test('buildAgentActivityFeed renders read tools as plain lines', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_focus',
        type: 'tool_call',
        status: 'completed',
        toolName: 'movscript_focus_get',
        durationMs: 420,
        createdAt: '2026-05-22T01:00:00.000Z',
        completedAt: '2026-05-22T01:00:00.100Z',
      }],
    }),
  })

  assert.equal(feed?.items.length, 1)
  assert.equal(feed?.items[0]?.type, 'line')
  assert.equal(feed?.items[0]?.kind, 'read')
  assert.equal(feed?.items[0]?.durationMs, 420)
  assert.deepEqual(feed?.items[0]?.type === 'line' ? feed.items[0].detail : undefined, undefined)
  assert.match(feed?.items[0]?.type === 'line' ? feed.items[0].text : '', /读取数据/)
})

test('buildAgentActivityFeed omits tool debug payloads from timeline-safe rows', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_query',
        type: 'tool_call',
        status: 'completed',
        toolName: 'movscript_resource_library_query',
        args: { projectId: 2, query: '舅爷' },
        result: { count: 3 },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'line')
  assert.equal(item?.type === 'line' ? item.detail : undefined, undefined)
})

test('buildAgentActivityFeed renders core workspace tools as lightweight blocks', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_workspace',
        type: 'tool_call',
        status: 'completed',
        toolName: 'workspace_create',
        args: { kind: 'content_unit_workspace', title: '镜头描述工作区', projectId: 7 },
        result: { workspaceId: 'workspace_123' },
        createdAt: '2026-05-22T01:00:00.000Z',
        completedAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'block')
  assert.equal(item?.kind, 'workspace')
  assert.equal(item?.type === 'block' ? item.title : '', '创建本地工作区')
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [
    '项目数据尚未正式写入。',
  ])
})

test('buildAgentActivityFeed renders plan update rationale and task counts', () => {
  const planArgs = {
    explanation: '已确认素材需求，下一步提交 5 个生成任务。',
    tasks: [
      { step: '确认素材槽', status: 'completed' },
      { step: '提交生成任务', status: 'in_progress' },
      { step: '写入候选集', status: 'pending' },
    ],
  }
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_plan',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_update_plan',
        args: planArgs,
        result: { status: 'updated' },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
      events: [{
        ...modelEvent('model_decision_plan', 'Model tool calls requested', 1, 'completed', '2026-05-22T00:59:59.000Z'),
        data: {
          eventType: 'model.tool_calls.requested',
          tool_calls: [
            { id: 'call_plan', name: 'core_update_plan', args: planArgs },
          ],
        },
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => item.type === 'decision' ? item.lines : item.type === 'block' ? item.lines : []), [
    [
      '更新执行计划：已确认素材需求，下一步提交 5 个生成任务。；任务：3 项（已完成 1，进行中 1，待处理 1）',
    ],
    [],
  ])
})

test('buildAgentActivityFeed uses model content preview as round thought label', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [{
        ...modelEvent('model_response_2', 'Model HTTP response received', 2, 'completed', '2026-05-22T01:00:00.000Z'),
        data: {
          finish_reason: 'tool_calls',
          content_chars: 40,
          contentPreview: '我现在提交一个图像生成任务，并先等待结果状态。',
          tool_calls: [{ id: 'call_work', name: 'core_work_start' }],
        },
      }],
      steps: [{
        id: 'step_work',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 2,
        roundLabel: 'Model turn 2',
        roundSource: 'runtime_rule',
        toolName: 'core_work_start',
        createdAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  assert.equal(feed?.rounds[0]?.label, '第 2 轮思考：我现在提交一个图像生成任务，并先等待结果状态。')
  assert.deepEqual(feed?.rounds.map((round) => round.index), [2])
})

test('buildAgentActivityFeed renders generation work without raw request details', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_work',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_work_start',
        args: {
          kind: 'generation_job',
          request: {
            output_type: 'image',
            model_id: 'image-v1',
            output_count: 2,
          },
        },
        result: { workId: 'work_1' },
        durationMs: 1450,
        createdAt: '2026-05-22T01:00:00.000Z',
        completedAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'block')
  assert.equal(item?.kind, 'task')
  assert.equal(item?.durationMs, 1450)
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [
    '历史兼容记录；新的生成和剪辑流程使用明确的 generation_* 或 editing_task_* 工具。',
  ])
})

test('buildAgentActivityFeed keeps recorded tool order when async work timestamps are earlier', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_models',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'generation_model_list',
        createdAt: '2026-05-22T01:00:02.000Z',
      }, {
        id: 'step_work',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'core_work_start',
        args: {
          kind: 'generation_job',
          request: { output_type: 'image', model_id: 'gpt-image-2' },
        },
        result: { workId: 'work_1' },
        createdAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => {
    if (item.type === 'line') return item.text
    if (item.type === 'block' || item.type === 'decision') return item.title
    return item.id
  }), [
    '已读取数据：查看生成模型',
    '旧异步任务交接',
  ])
})

test('buildAgentActivityFeed does not duplicate work status traces as task cards', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_work',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'core_work_start',
        args: {
          kind: 'generation_job',
          request: {
            output_type: 'image',
            model_id: 'gpt-image-2',
          },
        },
        result: { workId: 'work_1' },
        durationMs: 166_000,
        createdAt: '2026-05-22T01:00:10.000Z',
        completedAt: '2026-05-22T01:02:56.000Z',
      }],
      events: [{
        id: 'trace_work',
        kind: 'tool_call',
        title: 'Provider work running: generation_job',
        status: 'info',
        roundIndex: 1,
        toolName: 'core_work_start',
        data: {
          providerWork: { id: 'work_1', kind: 'generation_job', status: 'running' },
          generation: { jobId: 10, toolName: 'generation_job_create', stage: 'queued' },
        },
        createdAt: '2026-05-22T01:00:11.000Z',
      }],
    }),
  })

  const taskItems = feed?.items.filter((item) => item.type === 'block' && item.title === '旧异步任务交接')
  assert.equal(taskItems?.length, 1)
  const item = taskItems?.[0]
  assert.equal(item?.type === 'block' ? item.durationMs : undefined, 166_000)
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [
    '历史兼容记录；新的生成和剪辑流程使用明确的 generation_* 或 editing_task_* 工具。',
  ])
})

test('buildAgentActivityFeed compacts consecutive provider work observations', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: Array.from({ length: 5 }, (_, index) => ({
        id: `step_wait_${index + 1}`,
        type: 'tool_call' as const,
        status: 'completed' as const,
        roundIndex: 1,
        toolName: 'core_work_wait',
        args: { workId: 'work_1' },
        result: { workId: 'work_1', status: 'running' },
        durationMs: 100,
        createdAt: `2026-05-22T01:00:0${index}.000Z`,
        completedAt: `2026-05-22T01:00:0${index}.100Z`,
      })),
    }),
  })

  assert.equal(feed?.items.length, 1)
  const item = feed?.items[0]
  assert.equal(item?.type, 'block')
  assert.equal(item?.type === 'block' ? item.title : '', '观察旧异步任务 ×5')
  assert.equal(item?.durationMs, 500)
})

test('buildAgentActivityFeed compacts provider work observations when the latest status changes', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_wait_1',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'core_work_wait',
        args: { workId: 'work_1' },
        result: { workId: 'work_1', status: 'running' },
        durationMs: 100,
        createdAt: '2026-05-22T01:00:00.000Z',
      }, {
        id: 'step_wait_2',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'core_work_wait',
        args: { workId: 'work_1' },
        result: { workId: 'work_1', status: 'completed' },
        durationMs: 150,
        createdAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  assert.equal(feed?.items.length, 1)
  const item = feed?.items[0]
  assert.equal(item?.type, 'block')
  assert.equal(item?.type === 'block' ? item.title : '', '观察旧异步任务 ×2')
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [])
  assert.equal(item?.durationMs, 250)
})

test('buildAgentActivityFeed omits workspace file patch payloads from chat activity', () => {
  const patch = [
    '*** Begin Patch',
    '*** Update File: content',
    '@@',
    '-旧镜头描述',
    '+新的镜头描述',
    '*** End Patch',
  ].join('\n')
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_edit',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_file_edit',
        args: {
          ref: 'agent://workspace/workspace_1/content',
          patch,
        },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'block')
  assert.equal(item?.type === 'block' ? item.code : undefined, undefined)
})

test('buildAgentActivityFeed groups tool calls by model http round', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [
        modelEvent('model_req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
        modelEvent('model_res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:01.000Z'),
        modelEvent('model_req_2', 'Model HTTP request sent', 2, 'started', '2026-05-22T01:00:03.000Z'),
        modelEvent('model_res_2', 'Model HTTP response received', 2, 'completed', '2026-05-22T01:00:04.000Z'),
      ],
      steps: [
        {
          id: 'step_focus',
          type: 'tool_call',
          status: 'completed',
          roundIndex: 1,
          roundLabel: 'Model turn 1',
          toolName: 'movscript_focus_get',
          createdAt: '2026-05-22T01:00:01.500Z',
        },
        {
          id: 'step_workspace',
          type: 'tool_call',
          status: 'completed',
          roundIndex: 1,
          roundLabel: 'Model turn 1',
          toolName: 'workspace_create',
          args: { kind: 'content_unit_workspace' },
          result: { workspaceId: 'workspace_round' },
          createdAt: '2026-05-22T01:00:02.000Z',
        },
      ],
    }),
  })

  assert.deepEqual(feed?.rounds.map((round) => ({
    label: round.label,
    status: round.status,
    itemCount: round.items.length,
  })), [
    { label: '第 1 轮思考：决定调用工具', status: 'tool_calls', itemCount: 4 },
    { label: '第 2 轮思考：形成回复', status: 'final', itemCount: 2 },
  ])
})

test('buildAgentActivityFeed renders model tool-call decisions before execution', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [
        modelEvent('model_req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
        {
          ...modelEvent('model_decision_1', 'Model tool calls requested', 1, 'completed', '2026-05-22T01:00:01.000Z'),
          data: {
            eventType: 'model.tool_calls.requested',
            tool_calls: [
              { id: 'call_1', name: 'movscript_focus_get', args: {} },
              { id: 'call_2', name: 'workspace_fetch', args: { projectId: 2 } },
              { id: 'call_3', name: 'movscript_resource_library_query', args: { projectId: 2, query: '舅爷' } },
            ],
          },
        },
      ],
    }),
  })

  const round = feed?.rounds[0]
  const item = round?.items.find((candidate) => candidate.type === 'decision')
  assert.equal(round?.label, '第 1 轮思考：决定调用工具')
  assert.equal(item?.type, 'decision')
  assert.equal(item?.type === 'decision' ? item.title : '', '模型决定调用 3 个工具')
  assert.deepEqual(item?.type === 'decision' ? item.lines : [], [
    '读取当前焦点',
    '拉取工作区：项目：#2',
    'Movscript Resource Library Query：查询：舅爷，项目：#2',
  ])
})

test('buildAgentActivityFeed labels final-response sentinel rounds without exposing round 999', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [{
        id: 'event_final_failed',
        kind: 'run',
        title: 'Run finished',
        status: 'failed',
        roundIndex: 999,
        roundLabel: 'Final response',
        roundSource: 'final',
        data: { eventType: 'runtime.recovery.interrupted' },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  assert.equal(feed?.rounds[0]?.label, '最终回复：记录失败')
  assert.doesNotMatch(feed?.rounds[0]?.label ?? '', /999/)
})

test('buildAgentActivityFeed shows model round latency and token usage', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [
        modelEvent('model_req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
        {
          ...modelEvent('model_res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:01.000Z'),
          durationMs: 1234,
          data: {
            usage: {
              input_tokens: 1200,
              output_tokens: 34,
              prompt_tokens_details: {
                cached_tokens: 900,
              },
            },
          },
        },
      ],
    }),
  })

  assert.deepEqual(feed?.rounds.map((round) => ({
    label: round.label,
    status: round.status,
    itemCount: round.items.length,
    usage: round.usage,
  })), [{
    label: '第 1 轮思考：形成回复（1.2s · 1,234 tokens，in 1,200 / out 34，cache 900）',
    status: 'final',
    itemCount: 2,
    usage: {
      inputTokens: 1200,
      outputTokens: 34,
      cachedInputTokens: 900,
      totalTokens: 1234,
    },
  }])
  assert.deepEqual(feed?.rounds[0]?.items.map((item) => item.type === 'line' ? item.text : item.id), [
    '模型 HTTP 请求已发送',
    '模型 HTTP 响应：已完成；1,234 tokens，in 1,200 / out 34，cache 900',
  ])
  assert.equal(feed ? feedTotalsLine(feed) : undefined, '累计：模型 1 次 · 2.0s · 1,234 tokens，in 1,200 / out 34，cache 900')
})

test('buildAgentActivityFeed keeps every model http response as a visible thought round', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [
        modelEvent('model_req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
        modelResponseEvent('model_res_1', 1, '2026-05-22T01:00:01.000Z', { input_tokens: 100, output_tokens: 10 }),
        modelEvent('model_req_2', 'Model HTTP request sent', 2, 'started', '2026-05-22T01:00:02.000Z'),
        modelResponseEvent('model_res_2', 2, '2026-05-22T01:00:03.000Z', { input_tokens: 120, output_tokens: 12 }),
        modelEvent('model_req_3', 'Model HTTP request sent', 3, 'started', '2026-05-22T01:00:04.000Z'),
        modelResponseEvent('model_res_3', 3, '2026-05-22T01:00:05.000Z', { input_tokens: 140, output_tokens: 14 }),
        modelEvent('model_req_4', 'Model HTTP request sent', 4, 'started', '2026-05-22T01:00:06.000Z'),
        modelResponseEvent('model_res_4', 4, '2026-05-22T01:00:07.000Z', { input_tokens: 160, output_tokens: 16 }),
      ],
    }),
  })

  assert.deepEqual(feed?.rounds.map((round) => round.index), [1, 2, 3, 4])
  assert.deepEqual(feed?.rounds.map((round) => round.label), [
    '第 1 轮思考：形成回复（1.0s · 110 tokens，in 100 / out 10）',
    '第 2 轮思考：形成回复（1.0s · 132 tokens，in 120 / out 12）',
    '第 3 轮思考：形成回复（1.0s · 154 tokens，in 140 / out 14）',
    '第 4 轮思考：形成回复（1.0s · 176 tokens，in 160 / out 16）',
  ])
  assert.equal(feed?.totals.modelCallCount, 4)
  assert.deepEqual(feed?.rounds.map((round) => round.items.length), [2, 2, 2, 2])
})

test('buildAgentActivityFeed renders provider-session status changes beside model http and tool activity', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [
        {
          id: 'run_started',
          kind: 'run',
          title: 'Run started',
          status: 'started',
          roundIndex: 0,
          roundLabel: 'Setup',
          roundSource: 'setup',
          summary: 'Thread thread_test entered the agentic loop.',
          createdAt: '2026-05-22T01:00:00.000Z',
        },
        modelEvent('model_req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:01.000Z'),
        modelResponseEvent('model_res_1', 1, '2026-05-22T01:00:02.000Z', { input_tokens: 100, output_tokens: 10 }),
        {
          id: 'runtime_status',
          kind: 'run',
          title: 'Timeline status recorded',
          status: 'completed',
          summary: '异步任务已提交',
          createdAt: '2026-05-22T01:00:03.000Z',
        },
        {
          id: 'run_finished',
          kind: 'run',
          title: 'Run finished',
          status: 'completed',
          summary: 'Run completed with 1 step(s).',
          createdAt: '2026-05-22T01:00:04.000Z',
        },
      ],
      steps: [{
        id: 'step_work',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'core_work_start',
        args: { kind: 'generation_job' },
        result: { workId: 'work_1' },
        createdAt: '2026-05-22T01:00:02.500Z',
      }],
    }),
  })

  assert.deepEqual(feed?.rounds.map((round) => ({
    label: round.label,
    status: round.status,
    items: round.items.map((item) => item.type === 'line' ? item.text : item.type === 'block' || item.type === 'decision' ? item.title : item.id),
  })), [{
    label: '运行准备：运行中',
    status: 'thinking',
    items: ['运行开始：Thread thread_test entered the agentic loop.'],
  }, {
    label: '第 1 轮思考：决定调用工具（1.0s · 110 tokens，in 100 / out 10）',
    status: 'tool_calls',
    items: [
      '模型 HTTP 请求已发送',
      '模型 HTTP 响应：已完成；110 tokens，in 100 / out 10',
      '旧异步任务交接',
      '运行状态已记录：异步任务已提交',
      '运行完成：Run completed with 1 step(s).',
    ],
  }])
})

test('buildAgentActivityFeed prefers explicit model round duration records', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [
        modelEvent('model_round_start_1', 'Model round started', 1, 'started', '2026-05-22T01:00:00.000Z'),
        {
          ...modelEvent('model_res_1', 'Model HTTP response received', 1, 'completed', '2026-05-22T01:00:01.000Z'),
          durationMs: 900,
        },
        {
          ...modelEvent('model_round_done_1', 'Model round completed', 1, 'completed', '2026-05-22T01:00:01.200Z'),
          durationMs: 1200,
          data: {
            eventType: 'model.round.completed',
            durationMs: 1200,
            usage: {
              prompt_tokens: 40,
              completion_tokens: 2,
            },
          },
        },
      ],
    }),
  })

  assert.deepEqual(feed?.rounds.map((round) => ({
    label: round.label,
    status: round.status,
    itemCount: round.items.length,
    usage: round.usage,
  })), [{
    label: '第 1 轮思考：形成回复（1.2s · 42 tokens，in 40 / out 2）',
    status: 'final',
    itemCount: 1,
    usage: {
      inputTokens: 40,
      outputTokens: 2,
      totalTokens: 42,
    },
  }])
  assert.equal(feed ? feedTotalsLine(feed) : undefined, '累计：模型 1 次 · 2.0s · 42 tokens，in 40 / out 2')
})

test('buildAgentActivityFeed renders user input requests at their activity position', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      status: 'requires_action',
      events: [{
        id: 'event_decision_input',
        kind: 'model_call',
        title: 'Model tool calls requested',
        status: 'completed',
        roundIndex: 1,
        roundLabel: 'Model turn 1',
        data: {
          tool_calls: [
            { id: 'call_input', name: 'core_user_input_request', args: { question: 'What next?' } },
          ],
        },
        createdAt: '2026-05-22T01:00:00.000Z',
      }, {
        id: 'event_input_required',
        kind: 'input',
        title: 'User input required',
        status: 'blocked',
        roundIndex: 1,
        roundLabel: 'Model turn 1',
        createdAt: '2026-05-22T01:00:01.000Z',
      }],
      inputs: [{
        id: 'input_1',
        title: '需要补充信息',
        question: '可以。请告诉我你希望我接下来处理什么任务？',
        inputType: 'text',
        choices: [],
        allowCustomAnswer: true,
        status: 'pending',
        createdAt: '2026-05-22T01:00:01.000Z',
        updatedAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => item.id), ['input-input_1'])
  assert.equal(feed?.items[0]?.type, 'input_request')
})

test('buildAgentActivityFeed shows interrupted provider-session recovery as a system boundary', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      status: 'requires_action',
      events: [{
        id: 'event_recovery_interrupted',
        kind: 'run',
        title: 'Interrupted run recovered',
        status: 'blocked',
        summary: 'Provider session restarted while this run was in progress.',
        data: {
          eventType: 'runtime.recovery.interrupted',
        },
        createdAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  assert.equal(feed?.items.length, 1)
  const item = feed?.items[0]
  assert.equal(item?.type, 'line')
  assert.equal(item?.kind, 'system')
  assert.equal(item?.type === 'line' ? item.text : '', '运行中断：runtime session 重启时这个 run 尚未结束，已暂停等待继续或取消。')
})

test('buildAgentActivityFeed shows resumed recovery without duplicating the same run history', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      status: 'in_progress',
      events: [{
        id: 'event_recovery_resumed',
        kind: 'run',
        title: 'Interrupted run resumed',
        status: 'info',
        data: {
          eventType: 'runtime.recovery.resumed',
        },
        createdAt: '2026-05-22T01:00:00.500Z',
      }, {
        ...modelEvent('model_decision_1', 'Model tool calls requested', 1, 'completed', '2026-05-22T01:00:01.000Z'),
        data: {
          tool_calls: [
            { id: 'call_1', name: 'movscript_focus_get', args: {} },
          ],
        },
      }],
      steps: [{
        id: 'step_focus',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'movscript_focus_get',
        createdAt: '2026-05-22T01:00:02.000Z',
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => {
    if (item.type === 'line') return item.text
    if (item.type === 'input_request') return item.request.title
    if (item.type === 'approval_request') return item.approval.reason
    return item.title
  }), [
    '恢复继续：沿用同一个 run 重新调度，之前已完成的步骤保留为历史。',
    '模型决定调用 1 个工具',
    '已读取数据：读取当前焦点',
  ])
})

test('buildAgentActivityFeed labels recovery cancellation as terminal history', () => {
  const providerRecoveryCancellationReason = ['Run', 'time recovery cancelled by user.'].join('')
  const feed = buildAgentActivityFeed({
    activity: activity({
      status: 'cancelled',
      events: [{
        id: 'event_recovery_cancelled',
        kind: 'run',
        title: 'Run cancelled',
        status: 'info',
        summary: providerRecoveryCancellationReason,
        data: {
          reason: providerRecoveryCancellationReason,
        },
        createdAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'line')
  assert.equal(item?.type === 'line' ? item.text : '', '恢复已取消：保留中断前的执行记录，后续可以从新消息开始。')
})

test('agentActivityFeedMarkdown copies human-readable activity instead of raw json', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      runId: 'run_1',
      steps: [{
        id: 'step_candidate',
        type: 'tool_call',
        status: 'completed',
        toolName: 'workspace_submit',
        args: { namespace: 'movscript.project:9' },
        result: { message: 'workspace submitted' },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  assert.ok(feed)
  const markdown = agentActivityFeedMarkdown(feed!)
  assert.match(markdown, /Run run_1/)
  assert.match(markdown, /提交工作区/)
  assert.doesNotMatch(markdown, /"namespace"/)
})

test('buildAgentActivityFeed renders user approvals at their activity position', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      approvals: [{
        id: 'approval_1',
        toolName: 'workspace_apply',
        reason: '需要提交工作区修改',
        permission: 'workspace.apply',
        risk: 'write',
        status: 'pending',
        createdAt: '2026-05-22T01:00:00.000Z',
        updatedAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => item.id), ['approval-approval_1'])
  assert.equal(feed?.items[0]?.type, 'approval_request')
})

test('buildAgentActivityFeed keeps approvals inline with tool results', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_candidate',
        type: 'tool_call',
        status: 'completed',
        toolName: 'asset_candidate_write',
        args: { asset_slot_id: 9, resource_id: 88 },
        result: { message: 'candidate created' },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
      approvals: [{
        id: 'approval_1',
        toolName: 'asset_candidate_write',
        reason: '需要确认写入素材候选',
        permission: 'asset_candidate.write',
        risk: 'write',
        status: 'approved',
        createdAt: '2026-05-22T01:00:00.000Z',
        updatedAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => item.type === 'block' || item.type === 'decision' ? item.title : item.id), [
    'approval-approval_1',
    'step-step_candidate',
  ])
})

test('buildAgentActivityFeed hides action items already rendered by standalone interaction cards', () => {
  const feed = buildAgentActivityFeed({
    hiddenActionItemIds: new Set(['approval-approval_1']),
    activity: activity({
      steps: [{
        id: 'step_candidate',
        type: 'tool_call',
        status: 'completed',
        toolName: 'asset_candidate_write',
        args: { asset_slot_id: 9, resource_id: 88 },
        result: { message: 'candidate created' },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
      approvals: [{
        id: 'approval_1',
        toolName: 'asset_candidate_write',
        reason: '需要确认写入素材候选',
        permission: 'asset_candidate.write',
        risk: 'write',
        status: 'approved',
        createdAt: '2026-05-22T01:00:00.000Z',
        updatedAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => item.type === 'block' || item.type === 'decision' ? item.title : item.id), [
    'step-step_candidate',
  ])
})

test('buildAgentActivityFeed keeps model round telemetry when hidden action cards move elsewhere', () => {
  const feed = buildAgentActivityFeed({
    hiddenActionItemIds: new Set(['approval-approval_1']),
    activity: activity({
      events: [
        modelEvent('model_req_1', 'Model HTTP request sent', 1, 'started', '2026-05-22T01:00:00.000Z'),
        modelResponseEvent('model_res_1', 1, '2026-05-22T01:00:01.000Z', { input_tokens: 100, output_tokens: 10 }),
      ],
      approvals: [{
        id: 'approval_1',
        toolName: 'asset_candidate_write',
        reason: '需要确认写入素材候选',
        permission: 'asset_candidate.write',
        risk: 'write',
        status: 'pending',
        createdAt: '2026-05-22T01:00:00.500Z',
        updatedAt: '2026-05-22T01:00:00.500Z',
      }],
    }),
  })

  assert.deepEqual(feed?.rounds.map((round) => ({
    label: round.label,
    status: round.status,
    itemTexts: round.items.map((item) => item.type === 'line' ? item.text : item.id),
  })), [{
    label: '第 1 轮思考：形成回复（1.0s · 110 tokens，in 100 / out 10）',
    status: 'final',
    itemTexts: [
      '模型 HTTP 请求已发送',
      '模型 HTTP 响应：已完成；110 tokens，in 100 / out 10',
    ],
  }])
})

test('buildAgentActivityFeed keeps model tool-call order with approval rows', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      events: [{
        id: 'event_decision',
        kind: 'model_call',
        title: 'Model tool calls requested',
        status: 'completed',
        roundIndex: 1,
        createdAt: '2026-05-22T01:00:00.000Z',
        data: {
          tool_calls: [
            { id: 'call_focus', name: 'movscript_focus_get', args: {} },
            { id: 'call_write', name: 'asset_candidate_write', args: { asset_slot_id: 9, resource_id: 88 } },
          ],
        },
      }],
      steps: [{
        id: 'step_focus',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'movscript_focus_get',
        createdAt: '2026-05-22T01:00:01.000Z',
      }, {
        id: 'step_candidate',
        type: 'tool_call',
        status: 'completed',
        roundIndex: 1,
        toolName: 'asset_candidate_write',
        args: { asset_slot_id: 9, resource_id: 88 },
        result: { message: 'candidate created' },
        createdAt: '2026-05-22T01:00:02.000Z',
      }],
      approvals: [{
        id: 'approval_1',
        toolName: 'asset_candidate_write',
        args: { asset_slot_id: 9, resource_id: 88 },
        reason: '需要确认写入素材候选',
        permission: 'asset_candidate.write',
        risk: 'write',
        status: 'approved',
        createdAt: '2026-05-22T01:00:00.500Z',
        updatedAt: '2026-05-22T01:00:00.500Z',
      }],
    }),
  })

  assert.deepEqual(feed?.items.map((item) => item.type === 'block' || item.type === 'decision' ? item.title : item.id), [
    '模型决定调用 2 个工具',
    'step-step_focus',
    'approval-approval_1',
    'step-step_candidate',
  ])
})

type ActivityFixtureStep = ChatRunActivity['steps'][number] & { args?: unknown; result?: unknown }
type ActivityFixtureApproval = NonNullable<ChatRunActivity['approvals']>[number] & { args?: unknown; preview?: unknown }
type ActivityFixture = Omit<Partial<ChatRunActivity>, 'steps' | 'approvals'> & {
  steps?: ActivityFixtureStep[]
  approvals?: ActivityFixtureApproval[]
}

function activity(overrides: ActivityFixture = {}): ChatRunActivity {
  const { steps, approvals, ...rest } = overrides
  return {
    runId: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    createdAt: '2026-05-22T01:00:00.000Z',
    updatedAt: '2026-05-22T01:00:02.000Z',
    steps: (steps ?? []).map(({ args: _args, result: _result, ...step }) => step),
    ...(approvals ? { approvals: approvals.map(({ args: _args, preview: _preview, ...approval }) => approval) } : {}),
    events: [],
    ...rest,
  }
}

function modelEvent(id: string, title: string, roundIndex: number, status: 'started' | 'completed' | 'failed' | 'info', createdAt: string) {
  return {
    id,
    kind: 'model_call',
    title,
    status,
    roundIndex,
    roundLabel: `Model turn ${roundIndex}`,
    createdAt,
  }
}

function modelResponseEvent(id: string, roundIndex: number, createdAt: string, usage: { input_tokens: number; output_tokens: number }) {
  return {
    ...modelEvent(id, 'Model HTTP response received', roundIndex, 'completed', createdAt),
    completedAt: createdAt,
    durationMs: 1000,
    data: { usage },
  }
}
