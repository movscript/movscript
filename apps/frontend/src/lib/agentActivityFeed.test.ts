import assert from 'node:assert/strict'
import test from 'node:test'

import { agentActivityFeedMarkdown, buildAgentActivityFeed, feedTotalsLine } from './agentActivityFeed'
import type { ChatRunActivity } from '@/store/agentStore'

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
  assert.equal(feed?.items[0]?.tone, 'read')
  assert.equal(feed?.items[0]?.durationMs, 420)
  assert.deepEqual(feed?.items[0]?.type === 'line' ? feed.items[0].detail : undefined, undefined)
  assert.match(feed?.items[0]?.type === 'line' ? feed.items[0].text : '', /读取数据/)
})

test('buildAgentActivityFeed keeps tool debug args and result for expandable rows', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_query',
        type: 'tool_call',
        status: 'completed',
        toolName: 'movscript_creative_reference_query',
        args: { projectId: 2, query: '舅爷' },
        result: { count: 3 },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'line')
  assert.deepEqual(item?.type === 'line' ? item.detail : undefined, {
    args: { projectId: 2, query: '舅爷' },
    result: { count: 3 },
  })
})

test('buildAgentActivityFeed renders core draft tools as lightweight blocks', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      steps: [{
        id: 'step_draft',
        type: 'tool_call',
        status: 'completed',
        toolName: 'draft_create',
        args: { kind: 'content_unit_proposal', title: '镜头描述草稿', projectId: 7 },
        result: { draftId: 'draft_123' },
        createdAt: '2026-05-22T01:00:00.000Z',
        completedAt: '2026-05-22T01:00:01.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'block')
  assert.equal(item?.tone, 'draft')
  assert.equal(item?.type === 'block' ? item.title : '', '创建本地草稿')
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [
    '草稿：draft_123',
    '标题：镜头描述草稿',
    '类型：content_unit_proposal',
    '项目：#7',
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
    [
      '说明：已确认素材需求，下一步提交 5 个生成任务。',
      '任务：3 项（已完成 1，进行中 1，待处理 1）',
    ],
  ])
})

test('buildAgentActivityFeed renders generation work details from args and result', () => {
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
  assert.equal(item?.tone, 'task')
  assert.equal(item?.durationMs, 1450)
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [
    '类型：生成任务',
    '任务：work_1',
    '类型：image，模型：image-v1，数量：2',
    '任务已提交，后续结果会从 runtime work 返回。',
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
        title: 'Runtime work running: generation_job',
        status: 'info',
        roundIndex: 1,
        toolName: 'core_work_start',
        data: {
          runtimeWork: { id: 'work_1', kind: 'generation_job', status: 'running' },
          generation: { jobId: 10, toolName: 'generation_job_create', stage: 'queued' },
        },
        createdAt: '2026-05-22T01:00:11.000Z',
      }],
    }),
  })

  const taskItems = feed?.items.filter((item) => item.type === 'block' && item.title === '提交异步任务')
  assert.equal(taskItems?.length, 1)
  const item = taskItems?.[0]
  assert.equal(item?.type === 'block' ? item.durationMs : undefined, 166_000)
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [
    '类型：生成任务',
    '任务：work_1',
    '类型：image，模型：gpt-image-2',
    '任务已提交，后续结果会从 runtime work 返回。',
  ])
})

test('buildAgentActivityFeed compacts consecutive runtime work observations', () => {
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
  assert.equal(item?.type === 'block' ? item.title : '', '观察异步任务 ×5')
  assert.equal(item?.durationMs, 500)
})

test('buildAgentActivityFeed compacts runtime work observations when the latest status changes', () => {
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
  assert.equal(item?.type === 'block' ? item.title : '', '观察异步任务 ×2')
  assert.deepEqual(item?.type === 'block' ? item.lines : [], [
    '任务：work_1',
    '状态：completed',
  ])
  assert.equal(item?.durationMs, 250)
})

test('buildAgentActivityFeed exposes draft file patch as plain text code', () => {
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
          ref: 'agent://draft/draft_1/content',
          patch,
        },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  const item = feed?.items[0]
  assert.equal(item?.type, 'block')
  assert.equal(item?.type === 'block' ? item.code?.label : undefined, 'Patch')
  assert.equal(item?.type === 'block' ? item.code?.text : undefined, patch)
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
          id: 'step_draft',
          type: 'tool_call',
          status: 'completed',
          roundIndex: 1,
          roundLabel: 'Model turn 1',
          toolName: 'draft_create',
          args: { kind: 'content_unit_proposal' },
          result: { draftId: 'draft_round' },
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
    { label: '第 1 轮思考：决定调用工具', status: 'tool_calls', itemCount: 2 },
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
              { id: 'call_2', name: 'movscript_script_locate', args: { projectId: 2, contentLimit: 50000 } },
              { id: 'call_3', name: 'movscript_creative_reference_query', args: { projectId: 2, query: '舅爷' } },
            ],
          },
        },
      ],
    }),
  })

  const round = feed?.rounds[0]
  const item = round?.items[0]
  assert.equal(round?.label, '第 1 轮思考：决定调用工具')
  assert.equal(item?.type, 'decision')
  assert.equal(item?.type === 'decision' ? item.title : '', '模型决定调用 3 个工具')
  assert.deepEqual(item?.type === 'decision' ? item.lines : [], [
    '读取当前焦点',
    '读取项目剧本：项目：#2，内容上限：50000',
    '查询创意参考：查询：舅爷，项目：#2',
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
            },
          },
        },
      ],
    }),
  })

  assert.deepEqual(feed?.rounds, [])
  assert.equal(feed ? feedTotalsLine(feed) : undefined, '累计：模型 1 次 · 2.0s · 1,234 tokens，in 1,200 / out 34')
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

  assert.deepEqual(feed?.rounds, [])
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

test('buildAgentActivityFeed shows interrupted runtime recovery as a system boundary', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      status: 'requires_action',
      events: [{
        id: 'event_recovery_interrupted',
        kind: 'run',
        title: 'Interrupted run recovered',
        status: 'blocked',
        summary: 'Runtime restarted while this run was in progress.',
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
  assert.equal(item?.tone, 'system')
  assert.equal(item?.type === 'line' ? item.text : '', '运行中断：runtime 重启时这个 run 尚未结束，已暂停等待继续或取消。')
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
  const feed = buildAgentActivityFeed({
    activity: activity({
      status: 'cancelled',
      events: [{
        id: 'event_recovery_cancelled',
        kind: 'run',
        title: 'Run cancelled',
        status: 'info',
        summary: 'Runtime recovery cancelled by user.',
        data: {
          reason: 'Runtime recovery cancelled by user.',
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
        toolName: 'candidate_asset_slot_attach',
        args: { asset_slot_id: 9, resource_id: 88 },
        result: { message: 'candidate created' },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
    }),
  })

  assert.ok(feed)
  const markdown = agentActivityFeedMarkdown(feed!)
  assert.match(markdown, /Run run_1/)
  assert.match(markdown, /写入素材候选/)
  assert.match(markdown, /素材槽：#9/)
  assert.doesNotMatch(markdown, /"asset_slot_id"/)
})

test('buildAgentActivityFeed renders user approvals at their activity position', () => {
  const feed = buildAgentActivityFeed({
    activity: activity({
      approvals: [{
        id: 'approval_1',
        toolName: 'draft_apply',
        reason: '需要正式写入项目数据',
        permission: 'draft.apply',
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
        toolName: 'candidate_asset_slot_attach',
        args: { asset_slot_id: 9, resource_id: 88 },
        result: { message: 'candidate created' },
        createdAt: '2026-05-22T01:00:00.000Z',
      }],
      approvals: [{
        id: 'approval_1',
        toolName: 'candidate_asset_slot_attach',
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
    '写入素材候选',
  ])
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
            { id: 'call_write', name: 'candidate_asset_slot_attach', args: { asset_slot_id: 9, resource_id: 88 } },
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
        toolName: 'candidate_asset_slot_attach',
        args: { asset_slot_id: 9, resource_id: 88 },
        result: { message: 'candidate created' },
        createdAt: '2026-05-22T01:00:02.000Z',
      }],
      approvals: [{
        id: 'approval_1',
        toolName: 'candidate_asset_slot_attach',
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
    'approval-approval_1',
    'step-step_focus',
    '写入素材候选',
  ])
})

function activity(overrides: Partial<ChatRunActivity> = {}): ChatRunActivity {
  return {
    runId: 'run_test',
    threadId: 'thread_test',
    status: 'completed',
    createdAt: '2026-05-22T01:00:00.000Z',
    updatedAt: '2026-05-22T01:00:02.000Z',
    steps: [],
    events: [],
    ...overrides,
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
