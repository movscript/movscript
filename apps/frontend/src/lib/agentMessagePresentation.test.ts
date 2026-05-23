import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentMessagePresentation } from './agentMessagePresentation'
import type { AgentAttachment, ChatMessage } from '@/store/agentStore'

test('buildAgentMessagePresentation keeps user attachments compact and avoids assistant sections', () => {
  const result = buildAgentMessagePresentation(message({
    role: 'user',
    attachments: [attachment({ id: 'img_1', type: 'image' })],
  }))

  assert.equal(result.isUser, true)
  assert.equal(result.showLargeMedia, false)
  assert.equal(result.hasResultSection, false)
  assert.equal(result.compactAttachments.length, 1)
  assert.equal(result.displayContent, 'Message')
})

test('buildAgentMessagePresentation promotes generated assistant media and hides technical summary', () => {
  const result = buildAgentMessagePresentation(message({
    content: '成片已生成。\nOutput resources: #42\n技术细节：done',
    attachments: [attachment({
      id: 'generated-1',
      type: 'image',
      resourceId: 42,
      generated: { status: 'completed' },
    })],
  }))

  assert.equal(result.showLargeMedia, true)
  assert.equal(result.hasUsableGeneratedResource, true)
  assert.equal(result.generatedMediaAttachments.length, 1)
  assert.equal(result.compactAttachments.length, 0)
  assert.equal(result.hasResultSection, true)
  assert.equal(result.displayContent.includes('Output resources'), false)
  assert.equal(result.displayContent.includes('技术细节'), true)
})

test('buildAgentMessagePresentation reports missing generated resource ids for hydration', () => {
  const result = buildAgentMessagePresentation(message({
    content: 'Output resources: #7, #8',
    attachments: [attachment({ id: 'existing_7', resourceId: 7 })],
  }))

  assert.deepEqual(result.missingTextOutputResourceIds, [8])
})

test('buildAgentMessagePresentation hides content behind context diagnostics and opens diagnostics section', () => {
  const result = buildAgentMessagePresentation(message({
    meta: {
      contextDiagnostic: {
        schema: 'movscript.local_context_diagnostic.v1',
        modelGatewayCalled: false,
        messages: [],
        debugParts: [],
        tools: {
          available: [],
          blocked: [],
          discoveredCount: 0,
          modelTools: [],
        },
        skills: [],
        warnings: [],
      },
    },
  }))

  assert.equal(result.displayContent, '')
  assert.equal(result.contextDiagnostic?.schema, 'movscript.local_context_diagnostic.v1')
  assert.equal(result.hasDiagnosticSection, true)
})

test('buildAgentMessagePresentation exposes assistant meta as view model fields', () => {
  const result = buildAgentMessagePresentation(message({
    meta: {
      contextLabels: ['Project'],
      localRunActivity: {
        runId: 'run_1',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        steps: [],
        events: [],
      },
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
      draftArtifacts: [{
        type: 'draft',
        draftId: 'draft_1',
        draftKind: 'content_unit_proposal',
      }],
    },
  }))

  assert.deepEqual(result.contextLabels, ['Project'])
  assert.equal(result.localRunActivity?.runId, 'run_1')
  assert.equal(result.generationJobs[0]?.jobId, 42)
  assert.equal(result.generationParamAudits[0]?.modelConfigId, 7)
  assert.equal(result.generationValidationErrors[0]?.code, 'INVALID_INPUT_COUNT')
  assert.equal(result.draftArtifacts[0]?.draftId, 'draft_1')
  assert.equal(result.hasResultSection, true)
  assert.equal(result.hasProcessSection, true)
  assert.equal(result.hasDiagnosticSection, true)
})

test('buildAgentMessagePresentation hides internal run status breadcrumbs', () => {
  const result = buildAgentMessagePresentation(message({
    meta: {
      contextLabels: ['run completed', '已恢复本地 Runtime', 'Restored Local Runtime', 'Project Alpha'],
    },
  }))

  assert.deepEqual(result.contextLabels, ['Project Alpha'])
})

test('buildAgentMessagePresentation hides requires-action summary text while preserving inline activity', () => {
  const result = buildAgentMessagePresentation(message({
    content: '执行前需要确认：\n- draft_apply: 需要正式写入项目数据',
    meta: {
      localRunActivity: {
        runId: 'run_action',
        threadId: 'thread_1',
        status: 'requires_action',
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:01.000Z',
        approvals: [{
          id: 'approval_1',
          runId: 'run_action',
          toolName: 'draft_apply',
          reason: '需要正式写入项目数据',
          status: 'pending',
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
        }],
        steps: [],
        events: [],
      },
    },
  }))

  assert.equal(result.displayContent, '')
  assert.equal(result.hasProcessSection, true)
  assert.equal(result.localRunActivity?.approvals?.[0]?.id, 'approval_1')
})

test('buildAgentMessagePresentation hides technical final source summary blocks', () => {
  const result = buildAgentMessagePresentation({
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

test('buildAgentMessagePresentation promotes async work handoff out of empty assistant text', () => {
  const result = buildAgentMessagePresentation(message({
    content: '（无内容）',
    meta: {
      localRunActivity: {
        runId: 'run_work',
        threadId: 'thread_1',
        status: 'completed',
        createdAt: '2026-05-23T00:00:00.000Z',
        updatedAt: '2026-05-23T00:00:01.000Z',
        steps: [{
          id: 'step_work',
          type: 'tool_call',
          status: 'completed',
          toolName: 'core_work_start',
          args: { kind: 'generation_job' },
          result: { status: 'started', work: { id: 'work_1', kind: 'generation_job', status: 'running' } },
          createdAt: '2026-05-23T00:00:00.000Z',
          completedAt: '2026-05-23T00:00:01.000Z',
        }],
        events: [],
      },
    },
  }))

  assert.equal(result.displayContent, '')
  assert.equal(result.runtimeStatus?.kind, 'async_work_handoff')
  assert.equal(result.runtimeStatus?.workId, 'work_1')
})

test('buildAgentMessagePresentation prefers explicit runtime status metadata', () => {
  const result = buildAgentMessagePresentation(message({
    content: '本地 Agent Runtime 没有返回 assistant 消息。',
    meta: {
      runtimeStatus: {
        kind: 'async_work_handoff',
        title: '异步任务已提交',
        detail: '任务正在后台运行，完成后会自动接续。你可以继续发送消息。',
        workId: 'work_explicit',
        workKind: 'generation_job',
        workStatus: 'running',
      },
    },
  }))

  assert.equal(result.displayContent, '')
  assert.equal(result.runtimeStatus?.workId, 'work_explicit')
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
