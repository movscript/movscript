import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentMessageFacts } from '@/features/agent/domain/agentMessageFacts'
import type { AgentAttachment, ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

test('buildAgentMessageFacts keeps user attachments compact and avoids assistant sections', () => {
  const result = buildAgentMessageFacts(message({
    role: 'user',
    attachments: [attachment({ id: 'img_1', type: 'image' })],
  }))

  assert.equal(result.isUser, true)
  assert.equal(result.messageAttachments.length, 1)
  assert.equal(result.generatedMediaAttachments.length, 0)
  assert.equal(result.displayContent, 'Message')
})

test('buildAgentMessageFacts promotes generated assistant media and hides technical summary', () => {
  const result = buildAgentMessageFacts(message({
    content: '成片已生成。\nOutput resources: #42\n技术细节：done',
    attachments: [attachment({
      id: 'generated-1',
      type: 'image',
      resourceId: 42,
      generated: { status: 'completed' },
    })],
  }))

  assert.equal(result.generatedMediaAttachments.length, 1)
  assert.equal(result.generatedMediaAttachments[0]?.resourceId, 42)
  assert.equal(result.messageAttachments.length, 1)
  assert.equal(result.displayContent.includes('Output resources'), false)
  assert.equal(result.displayContent.includes('技术细节'), true)
})

test('buildAgentMessageFacts hides technical output summaries without hydrating resources', () => {
  const result = buildAgentMessageFacts(message({
    content: 'Output resources: #7, #8',
    attachments: [attachment({ id: 'existing_7', resourceId: 7 })],
  }))

  assert.equal(result.displayContent, '')
  assert.equal(result.messageAttachments.length, 1)
})

test('buildAgentMessageFacts exposes assistant meta as view model fields', () => {
  const result = buildAgentMessageFacts(message({
    meta: {
      contextLabels: ['Project'],
      generationJobs: [{
        jobId: 42,
        status: 'running',
        terminal: false,
      }],
      generationParamAudits: [{
        stepId: 'step_1',
        jobId: 42,
        modelConfigId: 7,
        modelContractLoaded: true,
        paramsSchemaLoaded: true,
        paramsSchemaRuleCount: 1,
        inputRequirements: {
          image: { min: 0, max: 1 },
          video: { min: 0, max: 0 },
        },
        submittedInputs: {
          image: 0,
          video: 0,
        },
        supportedParams: [],
        providedExtraParams: [],
        submittedExtraParams: [],
        droppedExtraParams: [],
        droppedTopLevelParams: [],
        dropReasons: {},
        renamedExtraParams: {},
        preflightErrors: [],
        inputPreflightErrors: [],
      }],
      generationValidationErrors: [{
        stepId: 'step_1',
        code: 'INVALID_INPUT_COUNT',
        field: 'image',
        message: 'too many images',
      }],
      workspaceArtifacts: [{
        type: 'workspace',
        workspaceId: 'workspace_1',
        workspaceKind: 'content_unit_workspace',
      }],
    },
  }), { timelineActivity: runActivity('run_1') })

  assert.deepEqual(result.contextLabels, ['Project'])
  assert.equal(result.timelineActivity?.runId, 'run_1')
  assert.equal(result.generationJobs[0]?.jobId, 42)
  assert.equal(result.generationParamAudits[0]?.modelConfigId, 7)
  assert.equal(result.generationValidationErrors[0]?.code, 'INVALID_INPUT_COUNT')
  assert.equal(result.workspaceArtifacts[0]?.workspaceId, 'workspace_1')
})

test('buildAgentMessageFacts hides internal run status breadcrumbs', () => {
  const result = buildAgentMessageFacts(message({
    meta: {
      contextLabels: ['run completed', '已恢复 Runtime 会话', 'Restored Provider Session', 'Project Alpha'],
    },
  }))

  assert.deepEqual(result.contextLabels, ['Project Alpha'])
})

test('buildAgentMessageFacts hides requires-action summary text while preserving inline activity', () => {
  const result = buildAgentMessageFacts(message({
    content: '执行前需要确认：\n- workspace_apply: 需要提交工作区修改',
  }), {
    timelineActivity: {
      ...runActivity('run_action'),
      status: 'requires_action',
      approvals: [{
        id: 'approval_1',
        runId: 'run_action',
        toolName: 'workspace_apply',
        reason: '需要提交工作区修改',
        status: 'pending',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      }],
    },
  })

  assert.equal(result.displayContent, '')
  assert.equal(result.timelineActivity?.approvals?.[0]?.id, 'approval_1')
})

test('buildAgentMessageFacts hides technical final source summary blocks', () => {
  const result = buildAgentMessageFacts({
    id: 'assistant_1',
    role: 'assistant',
    content: [
      '生成完成。',
      '',
      '来源：',
      '- 生成任务状态：generation_job#19《生成完成，输出资源 #21。》（source=tool_result; evidence=runtime_state）',
      '- 用户输入：本轮消息（source=user_input; evidence=user_claimed）',
    ].join('\n'),
    timestamp: 1,
  })

  assert.equal(result.displayContent, '生成完成。')
})

test('buildAgentMessageFacts promotes async work handoff out of empty assistant text', () => {
  const result = buildAgentMessageFacts(message({
    content: '（无内容）',
  }), {
    timelineActivity: {
      ...runActivity('run_work'),
      status: 'completed',
      createdAt: '2026-05-23T00:00:00.000Z',
      updatedAt: '2026-05-23T00:00:01.000Z',
      steps: [{
        id: 'step_work',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_work_start',
        createdAt: '2026-05-23T00:00:00.000Z',
        completedAt: '2026-05-23T00:00:01.000Z',
      }],
    },
  })

  assert.equal(result.displayContent, '')
})

test('buildAgentMessageFacts hides removed local runtime placeholders through provider session compatibility', () => {
  const result = buildAgentMessageFacts(message({
    content: 'The local Agent runtime did not return an assistant message.',
  }), {
    timelineActivity: {
      ...runActivity('run_compat_placeholder'),
      status: 'completed',
      steps: [{
        id: 'step_work',
        type: 'tool_call',
        status: 'completed',
        toolName: 'core_work_start',
        createdAt: '2026-05-23T00:00:00.000Z',
        completedAt: '2026-05-23T00:00:01.000Z',
      }],
    },
  })

  assert.equal(result.displayContent, '')
})

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function attachment(overrides: Partial<AgentAttachment> = {}): AgentAttachment {
  return {
    id: 'att_1',
    name: 'asset.png',
    type: 'image',
    mimeType: 'image/png',
    size: 10,
    ...overrides,
  }
}

function runActivity(runId: string): ChatRunActivity {
  return {
    runId,
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    steps: [],
    events: [],
  }
}
