import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDebugHttpRequests, buildLocalAgentSendDraft, resourceMentionAttachments, type AgentSendDraftHttpLabels } from './agentSendDraft'
import type { AgentRunPreview } from './localAgentClient'
import type { AgentAttachment, AgentSettings } from '@/store/agentStore'
import type { AgentPageTaskState } from '@/store/agentSessionStore'
import type { Project, PublicModel } from '@/types'

const labels: AgentSendDraftHttpLabels = {
  syncModelConfig: 'Sync model config',
  loadExistingThread: 'Load existing thread',
  missingThreadFallback: 'Missing thread fallback',
  createThread: 'Create thread',
  appendUserMessage: 'Append user message',
  createRun: 'Create run',
  pollRun: 'Poll run',
  pollRunNote: 'Poll until terminal',
  fetchFinalThread: 'Fetch final thread',
}

test('buildLocalAgentSendDraft binds composer input, attachments, runtime policy, and existing thread', async () => {
  const draft = await buildLocalAgentSendDraft({
    draftInput: 'Render this @[resource:42]',
    attachments: [],
    composerAttachments: [attachment({ resourceId: 42, name: 'shot.png', type: 'image', mimeType: 'image/png', size: 2048 })],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: project(),
    conversationMessages: [{ id: 'msg_1', role: 'assistant', content: 'Hi', timestamp: 1 }],
    systemPrompt: '',
    contextLabels: ['Project Alpha'],
    localThreadId: 'thread_1',
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
    now: () => 123,
    makeId: () => 'trace_test',
  })

  assert.equal(draft.id, 'trace_test')
  assert.equal(draft.createdAt, 123)
  assert.equal(draft.visibleUserContent, 'Render this @[resource:42]')
  assert.equal(draft.localRuntime?.threadId, 'thread_1')
  assert.equal(draft.localRuntime?.clientInput?.message, 'Render this @[resource:42]')
  assert.equal(draft.localRuntime?.clientInput?.uiSnapshot?.project?.id, 101)
  assert.equal(draft.localRuntime?.runPolicy?.approvalMode, 'interactive')
  assert.equal(draft.model.runtimeModelId, 'gpt-test')
  assert.equal(draft.httpRequests.some((request) => request.id === 'local-get-thread'), true)
  assert.equal(draft.httpRequests.some((request) => request.id === 'local-create-thread'), false)
})

test('buildLocalAgentSendDraft uses external task payload when the composer has no explicit override', async () => {
  const draft = await buildLocalAgentSendDraft({
    draftInput: 'ignored composer',
    attachments: [],
    composerAttachments: [],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    conversationMessages: [],
    systemPrompt: '',
    contextLabels: [],
    modelId: 7,
    activeModel: model(),
    externalTask: externalTask(),
    pageToolRequestId: 'page_request',
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
  })

  assert.equal(draft.visibleUserContent, 'ignored composer')
  assert.equal(draft.localRuntime?.clientInput?.message, 'ignored composer')
  assert.equal(draft.localRuntime?.projectId, 202)
  assert.equal(draft.localRuntime?.requestId, 'page_request')
  assert.equal(draft.localRuntime?.timeoutMs, 30_000)
  assert.equal(draft.localRuntime?.runPolicy?.maxToolCalls, 3)
})

test('buildLocalAgentSendDraft drops saved thread for diagnostic commands and omits debug artifacts on request', async () => {
  const draft = await buildLocalAgentSendDraft({
    options: {
      message: '/context local',
      omitDebugArtifacts: true,
    },
    draftInput: '',
    attachments: [],
    composerAttachments: [],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    conversationMessages: [],
    systemPrompt: 'System',
    contextLabels: [],
    localThreadId: 'thread_saved',
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
  })

  assert.equal(draft.localRuntime?.threadId, undefined)
  assert.equal(draft.localRuntime?.diagnosticCommand, true)
  assert.deepEqual(draft.httpRequests, [])
  assert.deepEqual(draft.outbound.messages, [])
})

test('buildLocalAgentSendDraft retries preview without stale thread when runtime reports missing thread', async () => {
  const previewCalls: Array<{ threadId?: string }> = []
  const draft = await buildLocalAgentSendDraft({
    options: { includeRuntimePreview: true },
    draftInput: 'Hello',
    attachments: [],
    composerAttachments: [],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    conversationMessages: [],
    systemPrompt: '',
    contextLabels: [],
    localThreadId: 'missing_thread',
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
    previewDeps: {
      localAgentOnline: true,
      ensureRunning: async () => undefined,
      refetchLocalAgentHealth: async () => undefined,
      assertMCPReady: async () => undefined,
      syncRuntimeModelConfig: async () => undefined,
      isLocalAgentNotFoundError: (error) => error instanceof Error && error.message === 'missing',
      previewRun: async (input) => {
        previewCalls.push({ threadId: input.threadId })
        if (input.threadId) throw new Error('missing')
        return preview()
      },
    },
  })

  assert.deepEqual(previewCalls, [{ threadId: 'missing_thread' }, { threadId: undefined }])
  assert.equal(draft.localRuntime?.preview?.id, 'preview_1')
  assert.equal(draft.warnings.includes('Saved local thread was not found; retried preview as a new thread.'), true)
})

test('resourceMentionAttachments resolves known resources and creates placeholders for unknown mentions', () => {
  const known = attachment({ resourceId: 42, name: 'known.png' })
  const result = resourceMentionAttachments('A @[resource:42] B @[resource:99] @[resource:42]', new Map([[42, known]]))

  assert.equal(result.length, 2)
  assert.equal(result[0], known)
  assert.equal(result[1]?.resourceId, 99)
})

test('buildDebugHttpRequests compacts large request bodies', () => {
  const requests = buildDebugHttpRequests({
    baseURL: 'http://agent.local',
    modelId: 7,
    modelName: 'gpt-test',
    messages: [{ role: 'user', content: 'x'.repeat(4100) }],
    localRuntime: {
      clientInput: { message: 'x'.repeat(4100) },
    },
    labels,
  })

  const appendMessage = requests.find((request) => request.id === 'local-add-message')
  const body = appendMessage?.body as { clientInput?: { message?: string } } | undefined
  assert.match(body?.clientInput?.message ?? '', /truncated/)
})

function settings(): AgentSettings {
  return {
    modelId: 7,
    includeProjectContext: true,
    includeRecentResources: false,
    autoPlan: true,
    permissionMode: 'ask',
    planMaxWorkers: 2,
    planMaxTaskAttempts: 2,
    planWorkerTimeoutMs: 60_000,
    activeRunPresetId: 'preset_1',
    runPresets: [{
      id: 'preset_1',
      name: 'Preset',
      description: '',
      permissionMode: 'ask',
      autoPlan: true,
      maxToolCalls: 11,
      maxIterations: 5,
      planMaxWorkers: 2,
      planMaxTaskAttempts: 2,
      planWorkerTimeoutMs: 60_000,
    }],
    toolPolicyFilterPresets: [],
    auditTrail: [],
    lastImportBackup: null,
  }
}

function project(): Project {
  return {
    ID: 101,
    name: 'Project Alpha',
    description: 'Desc',
    owner_id: 1,
    status: 'active',
    CreatedAt: '2026-05-19T00:00:00.000Z',
    UpdatedAt: '2026-05-19T00:00:00.000Z',
  }
}

function model(): PublicModel {
  return {
    id: 7,
    credential_id: 1,
    model_id: 'gpt-test',
    display_name: 'GPT Test',
    capabilities: ['text'],
    accepts_image_input: false,
  }
}

function externalTask(): AgentPageTaskState {
  return {
    requestId: 'task_request',
    taskType: 'test_task',
    status: 'queued',
    payload: {
      requestId: 'task_request',
      taskType: 'test_task',
      message: 'Task message',
      projectId: 202,
      timeoutMs: 30_000,
      clientInput: { message: 'Task message' },
      runPolicy: { maxToolCalls: 3 },
    },
    createdAt: 1,
    updatedAt: 1,
  }
}

function attachment(overrides: Partial<AgentAttachment> = {}): AgentAttachment {
  return {
    id: overrides.resourceId ? `res-${overrides.resourceId}` : 'attachment_1',
    name: 'asset.png',
    type: 'image',
    mimeType: 'image/png',
    size: 1024,
    ...overrides,
  }
}

function preview(): AgentRunPreview {
  return {
    id: 'preview_1',
    message: 'Hello',
    status: 'preview',
    toolCalls: [],
    pendingApprovals: [],
    warnings: [],
    memoryIds: [],
    memoryCount: 0,
    createdAt: '2026-05-19T00:00:00.000Z',
  }
}
