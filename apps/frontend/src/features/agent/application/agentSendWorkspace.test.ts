import assert from 'node:assert/strict'
import test from 'node:test'

import { buildDebugHttpRequests, buildLocalAgentSendWorkspace, resourceMentionAttachments, type AgentSendWorkspaceHttpLabels } from '@/features/agent/application/agentSendWorkspace'
import type { AgentRunPreview } from '@/shared/infrastructure/localAgentClient'
import type { AgentAttachment, AgentSettings } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import type { Project, PublicModel } from '@/types'

const labels: AgentSendWorkspaceHttpLabels = {
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

test('buildLocalAgentSendWorkspace binds composer input, attachments, and existing thread', async () => {
  const workspace = await buildLocalAgentSendWorkspace({
    workspaceInput: 'Render this @[resource:42]',
    attachments: [],
    composerAttachments: [attachment({ resourceId: 42, name: 'shot.png', type: 'image', mimeType: 'image/png', size: 2048 })],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: project(),
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

  assert.equal(workspace.id, 'trace_test')
  assert.equal(workspace.createdAt, 123)
  assert.equal(workspace.visibleUserContent, 'Render this @[resource:42]')
  assert.equal(workspace.localRuntime?.threadId, 'thread_1')
  assert.equal(workspace.localRuntime?.clientInput?.message, 'Render this @[resource:42]')
  assert.equal(workspace.localRuntime?.clientInput?.uiSnapshot?.project?.id, 101)
  assert.equal(workspace.localRuntime?.runtimeLimits, undefined)
  assert.equal(workspace.model.runtimeModelId, 'gpt-test')
  assert.deepEqual(workspace.outbound.messages.map((message) => message.role), ['system', 'user'])
  assert.equal(workspace.outbound.messages.some((message) => message.content === 'Hi'), false)
  assert.equal(workspace.httpRequests.some((request) => request.id === 'local-get-thread'), true)
  assert.equal(workspace.httpRequests.some((request) => request.id === 'local-create-thread'), false)
})

test('buildLocalAgentSendWorkspace resolves image attachments to runtime input data URLs', async () => {
  const workspace = await buildLocalAgentSendWorkspace({
    workspaceInput: 'Describe this image',
    attachments: [],
    composerAttachments: [attachment({ resourceId: 42, name: 'shot.png', type: 'image', mimeType: 'image/png' })],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    systemPrompt: '',
    contextLabels: [],
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
    resolveAttachmentDataUrl: async (item) => item.resourceId === 42 ? 'data:image/png;base64,AAAA' : undefined,
  })

  assert.equal(workspace.localRuntime?.clientInput?.attachments?.[0]?.dataUrl, 'data:image/png;base64,AAAA')
  assert.match(workspace.outbound.enrichedUserContent, /runtime 预处理/)
  assert.doesNotMatch(workspace.outbound.enrichedUserContent, /data:image\/png/)
})

test('buildLocalAgentSendWorkspace keeps sending when image attachment data URL resolution fails', async () => {
  const workspace = await buildLocalAgentSendWorkspace({
    workspaceInput: 'Describe this image',
    attachments: [],
    composerAttachments: [attachment({ resourceId: 42, name: 'shot.png', type: 'image', mimeType: 'image/png' })],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    systemPrompt: '',
    contextLabels: [],
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
    resolveAttachmentDataUrl: async () => {
      throw new Error('download stalled')
    },
  })

  assert.equal(workspace.localRuntime?.clientInput?.attachments?.[0]?.resourceId, 42)
  assert.equal(workspace.localRuntime?.clientInput?.attachments?.[0]?.dataUrl, undefined)
  assert.match(workspace.warnings.join('\n'), /metadata-only/)
  assert.match(workspace.warnings.join('\n'), /download stalled/)
})

test('buildLocalAgentSendWorkspace keeps video attachments metadata-only for local frame extraction', async () => {
  let resolved = false
  const workspace = await buildLocalAgentSendWorkspace({
    workspaceInput: 'Describe this video',
    attachments: [],
    composerAttachments: [attachment({ resourceId: 88, name: 'clip.mp4', type: 'video', mimeType: 'video/mp4' })],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    systemPrompt: '',
    contextLabels: [],
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
    resolveAttachmentDataUrl: async () => {
      resolved = true
      return 'data:video/mp4;base64,AAAA'
    },
  })

  assert.equal(resolved, false)
  assert.equal(workspace.localRuntime?.clientInput?.attachments?.[0]?.resourceId, 88)
  assert.equal(workspace.localRuntime?.clientInput?.attachments?.[0]?.dataUrl, undefined)
  assert.match(workspace.outbound.enrichedUserContent, /video_payload=metadata_only/)
  assert.match(workspace.outbound.enrichedUserContent, /本地抽帧工具/)
})

test('buildLocalAgentSendWorkspace uses external task payload when the composer has no explicit override', async () => {
  const workspace = await buildLocalAgentSendWorkspace({
    workspaceInput: 'ignored composer',
    attachments: [],
    composerAttachments: [],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
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

  assert.equal(workspace.visibleUserContent, 'ignored composer')
  assert.equal(workspace.localRuntime?.clientInput?.message, 'ignored composer')
  assert.equal(workspace.localRuntime?.projectId, 202)
  assert.equal(workspace.localRuntime?.requestId, 'page_request')
  assert.equal(workspace.localRuntime?.timeoutMs, 30_000)
  assert.equal(workspace.localRuntime?.runtimeLimits, undefined)
})

test('buildLocalAgentSendWorkspace preserves explicit runtime limits overrides', async () => {
  const workspace = await buildLocalAgentSendWorkspace({
    options: {
      runtimeLimits: {
        approvalMode: 'interactive',
        maxToolCalls: 12,
        execution: {
          mode: 'compact',
          includeMemories: false,
          allowForcedToolCalls: false,
        },
      },
    },
    workspaceInput: 'Small request',
    attachments: [],
    composerAttachments: [],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    systemPrompt: '',
    contextLabels: [],
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
  })

  assert.equal(workspace.localRuntime?.runtimeLimits?.approvalMode, 'interactive')
  assert.equal(workspace.localRuntime?.runtimeLimits?.maxToolCalls, 12)
  assert.deepEqual(workspace.localRuntime?.runtimeLimits?.execution, {
    mode: 'compact',
    includeMemories: false,
    allowForcedToolCalls: false,
  })
})

test('buildLocalAgentSendWorkspace preserves saved thread for diagnostic commands and omits debug artifacts on request', async () => {
  const workspace = await buildLocalAgentSendWorkspace({
    options: {
      message: '/context local',
      omitDebugArtifacts: true,
    },
    workspaceInput: '',
    attachments: [],
    composerAttachments: [],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
    systemPrompt: 'System',
    contextLabels: [],
    localThreadId: 'thread_saved',
    modelId: 7,
    activeModel: model(),
    attachmentOnlyMessageLabel: 'Attachment only',
    localAgentBaseURL: 'http://127.0.0.1:39291',
    httpLabels: labels,
  })

  assert.equal(workspace.localRuntime?.threadId, 'thread_saved')
  assert.equal(workspace.localRuntime?.diagnosticCommand, true)
  assert.deepEqual(workspace.httpRequests, [])
  assert.deepEqual(workspace.outbound.messages, [])
})

test('buildLocalAgentSendWorkspace retries preview without stale thread when runtime reports missing thread', async () => {
  const previewCalls: Array<{ threadId?: string }> = []
  const workspace = await buildLocalAgentSendWorkspace({
    options: { includeRuntimePreview: true },
    workspaceInput: 'Hello',
    attachments: [],
    composerAttachments: [],
    resourceAttachmentIndex: new Map(),
    settings: settings(),
    currentProject: null,
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
  assert.equal(workspace.localRuntime?.preview?.id, 'preview_1')
  assert.equal(workspace.warnings.includes('Saved local thread was not found; retried preview as a new thread.'), true)
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
      clientInput: {
        message: 'x'.repeat(4100),
        attachments: [{ id: 'att_1', type: 'image', dataUrl: 'data:image/png;base64,AAAA' }],
      },
    },
    labels,
  })

  const appendMessage = requests.find((request) => request.id === 'local-add-message')
  const body = appendMessage?.body as { clientInput?: { message?: string; attachments?: Array<{ dataUrl?: string }> } } | undefined
  assert.match(body?.clientInput?.message ?? '', /truncated/)
  assert.equal(body?.clientInput?.attachments?.[0]?.dataUrl, '[image data URL redacted: 26 chars]')
})

function settings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    modelId: 7,
    includeProjectContext: true,
    includeRecentResources: false,
    planMaxWorkers: 2,
    planMaxTaskAttempts: 2,
    planWorkerTimeoutMs: 60_000,
    toolPermissionsFilterPresets: [],
    auditTrail: [],
    lastImportBackup: null,
    lastConfigFileBackup: null,
    ...overrides,
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
