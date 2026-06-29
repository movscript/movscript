import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAgentMessageFacts } from '@/features/agent/domain/agentMessageFacts'
import { agentMessageBubbleModel } from '@/features/agent/presentation/agentMessageBubbleModel'
import { cachedAgentMessageFacts } from '@/features/agent/presentation/useAgentMessageFactsModel'
import type { AgentRun } from '@movscript/agent-protocol'
import type { AgentAttachment, ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

test('agentMessageBubbleModel keeps message body and footer visibility in presentation', () => {
  assert.deepEqual(bubbleModel(message({
    role: 'user',
    content: 'User text',
  })).visibility, {
    hasMessageBody: true,
    hasFooter: false,
    hasRenderableBubble: true,
  })

  assert.deepEqual(bubbleModel(message({
    content: '',
  }), {
    timelineActivity: runActivity('historical_run', true),
  }).visibility, {
    hasMessageBody: true,
    hasFooter: false,
    hasRenderableBubble: true,
  })

  assert.deepEqual(bubbleModel(message({
    role: 'user',
    content: '',
    meta: {
      providerSessionInput: {
        runId: 'run_1',
        deliveryStatus: 'pending',
      },
    },
  })).visibility, {
    hasMessageBody: false,
    hasFooter: true,
    hasRenderableBubble: true,
  })

  assert.deepEqual(bubbleModel(message({
    content: '',
  })).visibility, {
    hasMessageBody: false,
    hasFooter: false,
    hasRenderableBubble: false,
  })
})

test('agentMessageBubbleModel projects provider-session message ids for DOM attributes', () => {
  const assistantShell = bubbleModel(message({
    role: 'assistant',
    meta: {
      providerSessionMessage: {
        threadId: 'thread_1',
        messageId: 'msg_1',
        runId: 'run_1',
      },
    },
  })).shell
  assert.equal(assistantShell.role, 'assistant')
  assert.equal(assistantShell.avatar, 'assistant')
  assert.equal(assistantShell.messageId, 'msg_1')
  assert.equal(assistantShell.providerThreadId, 'thread_1')
  assert.equal(assistantShell.providerSessionMessageId, 'msg_1')
  assert.equal(assistantShell.providerSessionRunId, 'run_1')

  assert.deepEqual(bubbleModel(message({
    id: 'user_msg',
    role: 'user',
    meta: {
      providerSessionMessage: {
        threadId: 'thread_1',
        messageId: 'msg_1',
        runId: 'run_1',
      },
    },
  })).shell, {
    role: 'user',
    avatar: 'user',
    author: 'You',
    time: '09:30',
    messageId: 'user_msg',
    providerThreadId: 'thread_1',
    providerSessionMessageId: 'msg_1',
  })
})

test('agentMessageBubbleModel projects shell, activity, and actions', () => {
  const userModel = bubbleModel(message({
    id: 'user_msg',
    role: 'user',
    content: 'Copy me',
  }))
  assert.equal(userModel.shell.role, 'user')
  assert.equal(userModel.shell.avatar, 'user')
  assert.equal(userModel.shell.author, 'You')
  assert.equal(userModel.shell.time, '09:30')
  assert.deepEqual(userModel.action, { kind: 'copy', text: 'Copy me' })

  const historicalActivity = runActivity('historical_run', true)
  const historicalModel = bubbleModel(message(), {
    timelineActivity: historicalActivity,
  })
  assert.equal(historicalModel.shell.role, 'assistant')
  assert.equal(historicalModel.shell.avatar, 'assistant')
  assert.equal(historicalModel.shell.time, undefined)
  assert.ok(historicalModel.shell.headLabel)
  assert.deepEqual(historicalModel.activity, {
    liveRun: null,
    historicalActivity,
    className: 'mb-2',
  })
  assert.deepEqual(historicalModel.action, {
    kind: 'activityMenu',
    activity: historicalActivity,
  })

  const liveRun = agentRun('live_run')
  const liveModel = bubbleModel(message(), {
    timelineActivity: runActivity('run_1', true),
    liveInteractionRun: liveRun,
  })
  assert.deepEqual(liveModel.activity, {
    liveRun,
    className: 'mb-2',
  })
  assert.deepEqual(liveModel.action, { kind: 'none' })
})

test('agentMessageBubbleModel projects footer alignment, labels, and active run input badge', () => {
  const userModel = bubbleModel(message({
    role: 'user',
    meta: {
      contextLabels: ['Project Alpha'],
      providerSessionInput: {
        runId: 'run_1',
        deliveryStatus: 'pending',
      },
    },
  }))
  assert.equal(userModel.footer.hasFooter, true)
  assert.equal(userModel.footer.align, 'end')
  assert.deepEqual(userModel.footer.contextLabels, ['Project Alpha'])
  assert.equal(userModel.footer.activeRunInputBadge?.icon, 'spinner')

  assert.deepEqual(bubbleModel(message({ content: '' })).footer, {
    hasFooter: false,
    align: 'start',
    activeRunInputBadge: null,
    contextLabels: [],
  })
})

test('agentMessageBubbleModel projects content, result, diagnostic, and attachment sections', () => {
  const userAttachment1 = attachment({ id: 'att_1' })
  const userAttachment2 = attachment({ id: 'att_2' })
  assert.deepEqual(bubbleModel(message({
    role: 'user',
    attachments: [userAttachment1, userAttachment2],
  })).sections, {
    showContent: true,
    contentText: 'Message',
    contentAttachments: [userAttachment1, userAttachment2],
    activityClassName: 'mb-2',
    showModelSetupAction: false,
    showResultSection: false,
    showLargeMedia: false,
    largeMediaAttachments: [],
    workspaceArtifacts: [],
    showCompactAttachmentGrid: true,
    compactAttachments: [userAttachment1, userAttachment2],
    compactAttachmentColumns: 2,
    showDiagnosticSection: false,
    diagnosticDefaultOpen: false,
    diagnosticValidationErrors: [],
    diagnosticParamAudits: [],
    showUserAttachmentGrid: true,
    userAttachments: [userAttachment1, userAttachment2],
    userAttachmentColumns: 2,
  })

  const generatedAttachment = attachment({
    id: 'generated_1',
    resourceId: 42,
    generated: { status: 'completed' },
  })
  const validationError = {
    stepId: 'step_1',
    code: 'INVALID_INPUT_COUNT',
    message: 'invalid input',
  } as const
  assert.deepEqual(bubbleModel(message({
    content: '',
    attachments: [generatedAttachment],
    meta: {
      generationValidationErrors: [validationError],
    },
  })).sections, {
    showContent: false,
    contentText: '',
    contentAttachments: [generatedAttachment],
    showModelSetupAction: false,
    showResultSection: true,
    showLargeMedia: true,
    largeMediaAttachments: [generatedAttachment],
    workspaceArtifacts: [],
    showCompactAttachmentGrid: false,
    compactAttachments: [],
    compactAttachmentColumns: 1,
    showDiagnosticSection: true,
    diagnosticDefaultOpen: true,
    diagnosticValidationErrors: [validationError],
    diagnosticParamAudits: [],
    showUserAttachmentGrid: false,
    userAttachments: [],
    userAttachmentColumns: 1,
  })
})

test('cachedAgentMessageFacts reuses facts for stable message and activity references', () => {
  const msg = message({
    attachments: [
      attachment({ id: 'generated-1', generated: { status: 'completed' } }),
      attachment({ id: 'generated-1', generated: { status: 'completed' } }),
    ],
  })
  const activity = runActivity('run_1', true)

  assert.equal(cachedAgentMessageFacts(msg), cachedAgentMessageFacts(msg))
  assert.equal(cachedAgentMessageFacts(msg, activity), cachedAgentMessageFacts(msg, activity))
  assert.notEqual(cachedAgentMessageFacts(msg), cachedAgentMessageFacts(msg, activity))
  assert.equal(cachedAgentMessageFacts(msg).messageAttachments.length, 1)
})

function bubbleModel(
  msg: ChatMessage,
  options: {
    timelineActivity?: ChatRunActivity
    liveInteractionRun?: AgentRun | null
  } = {},
) {
  return agentMessageBubbleModel(buildAgentMessageFacts(msg, {
    timelineActivity: options.timelineActivity,
  }), msg, {
    time: '09:30',
    liveInteractionRun: options.liveInteractionRun,
  })
}

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

function runActivity(runId: string, withVisibleStep = false): ChatRunActivity {
  return {
    runId,
    threadId: 'thread_1',
    status: 'completed',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    steps: withVisibleStep ? [toolStep('step_1')] : [],
    events: [],
  }
}

function agentRun(id: string): AgentRun {
  return {
    id,
    threadId: 'thread_1',
    status: 'completed',
    providerSessionLimits: {},
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:01.000Z',
    steps: [toolStep('step_live')],
  } as AgentRun
}

function toolStep(id: string): NonNullable<ChatRunActivity['steps']>[number] {
  return {
    id,
    type: 'tool_call',
    status: 'completed',
    toolName: 'context_current_get',
    createdAt: '2026-05-19T00:00:00.000Z',
    completedAt: '2026-05-19T00:00:01.000Z',
  }
}
