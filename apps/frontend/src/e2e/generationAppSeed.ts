import { generationTraceReplayFixtures } from '@/lib/agentGenerationTraceFixtures'
import { replayGenerationTrace } from '@/lib/agentGenerationMedia'
import type { E2EBootstrapSeed } from '@/lib/e2eBootstrap'
import type { AgentAttachment, ChatGenerationJob, ChatMessage, Conversation } from '@/store/agentStore'
import type { AgentRun } from '@/lib/localAgentClient'
import type { Project } from '@/types'

const USER_ID = 1001
const ORG_ID = 1
const PROJECT_ID = 123
const CONVERSATION_ID = 'conversation-generation-e2e'
const THREAD_ID = 'thread-generation-e2e'
const RUN_ID = 'run-generation-e2e'
const FINAL_JOB_ID = 2001
const FIXED_NOW = '2026-05-09T12:00:00.000Z'

export type GenerationMediaKind = 'image' | 'video'
export type GenerationOutcome = 'success' | 'failed' | 'timeout'

export function buildGenerationAppBootstrap(apiBaseURL: string): E2EBootstrapSeed {
  return buildGenerationAppBootstrapScenario(apiBaseURL, 'success')
}

export function buildGenerationAppBootstrapScenario(
  apiBaseURL: string,
  outcome: GenerationOutcome,
  kind: GenerationMediaKind = 'image',
): E2EBootstrapSeed {
  const fixture = generationTraceReplayFixtures.find((entry) => entry.name === 'sanitized provider trace: image succeeds after polling')
  if (!fixture) throw new Error('missing sanitized provider generation fixture')
  const replay = replayGenerationTrace(fixture.events)
  const resource = replay.outputResources[0]
  if (!resource) throw new Error('missing generated resource in replay fixture')
  const media = kind === 'video'
    ? {
        ...resource,
        ID: 9102,
        type: 'video' as const,
        name: 'provider-video-redacted.mp4',
        url: '/api/v1/resources/9102/file',
        size: 4096,
        mime_type: 'video/mp4',
      }
    : resource
  const providerName = kind === 'video' ? 'Sanitized Video Provider' : 'Sanitized Image Provider'
  const modelDisplay = kind === 'video' ? 'Provider Video Model' : 'Provider Image Model'
  const modelIdentifier = kind === 'video' ? 'provider-video-v1' : 'provider-image-v2'
  const modelConfigId = kind === 'video' ? 82 : 81

  const userMessage: ChatMessage = {
    id: 'message-user-generation-e2e',
    role: 'user',
    content: kind === 'video'
      ? '请生成一段用于项目主视觉的短视频，并在完成后告诉我结果。'
      : '请生成一张用于项目主视觉的图片，并在完成后告诉我结果。',
    timestamp: Date.parse(FIXED_NOW),
  }

  const assistantMessage = outcome === 'success'
    ? {
        id: 'message-assistant-generation-e2e',
        role: 'assistant' as const,
        content: '生成已完成，结果已可绑定到素材位。',
        timestamp: Date.parse('2026-05-09T12:00:25.000Z'),
        attachments: [{
          id: `generated-${media.ID}`,
          name: media.name,
          type: media.type === 'image' || media.type === 'video' ? media.type : 'file',
          mimeType: media.mime_type,
          size: media.size,
          url: media.url,
          resourceId: media.ID,
          generated: {
            jobId: FINAL_JOB_ID,
            jobType: kind,
            providerName,
            modelDisplay,
            modelIdentifier,
            modelConfigId,
            status: 'succeeded',
            stage: 'completed',
          },
        } satisfies AgentAttachment],
        meta: {
          contextLabels: ['E2E 生成监控'],
          generationJobs: [{
            jobId: FINAL_JOB_ID,
            jobType: kind,
            providerName,
            modelDisplay,
            modelIdentifier,
            modelConfigId,
            status: 'succeeded',
            stage: 'completed',
            progress: 100,
            terminal: true,
            outputResourceId: media.ID,
            message: `生成完成，输出资源 #${media.ID}。`,
            firstSeenAt: '2026-05-09T12:00:00.000Z',
            updatedAt: '2026-05-09T12:00:24.000Z',
            completedAt: '2026-05-09T12:00:24.000Z',
          } satisfies ChatGenerationJob],
        },
      } satisfies ChatMessage
    : outcome === 'failed'
      ? {
        id: 'message-assistant-generation-e2e',
        role: 'assistant' as const,
        content: '生成失败：provider rejected request。',
        timestamp: Date.parse('2026-05-09T12:00:25.000Z'),
        meta: {
          contextLabels: ['E2E 生成监控'],
          generationJobs: [{
            jobId: FINAL_JOB_ID,
            jobType: kind,
            providerName,
            modelDisplay,
            modelIdentifier,
            modelConfigId,
            status: 'failed',
            stage: 'failed',
            progress: 47,
            terminal: true,
            message: 'provider rejected request',
            firstSeenAt: '2026-05-09T12:00:00.000Z',
            updatedAt: '2026-05-09T12:00:24.000Z',
            completedAt: '2026-05-09T12:00:24.000Z',
          } satisfies ChatGenerationJob],
        },
      } satisfies ChatMessage
      : {
        id: 'message-assistant-generation-e2e',
        role: 'assistant' as const,
        content: '生成监控已超时，任务可能仍在后台继续运行。',
        timestamp: Date.parse('2026-05-09T12:00:25.000Z'),
        meta: {
          contextLabels: ['E2E 生成监控'],
          generationJobs: [{
            jobId: FINAL_JOB_ID,
            jobType: kind,
            providerName,
            modelDisplay,
            modelIdentifier,
            modelConfigId,
            status: 'timeout',
            stage: 'timeout',
            progress: 47,
            terminal: false,
            message: 'monitoring timed out before provider returned a terminal result',
            firstSeenAt: '2026-05-09T12:00:00.000Z',
            updatedAt: '2026-05-09T12:00:24.000Z',
          } satisfies ChatGenerationJob],
        },
      } satisfies ChatMessage

  const conversation: Conversation = {
    id: CONVERSATION_ID,
    title: '生成监控',
    messages: [userMessage, assistantMessage],
    createdAt: Date.parse('2026-05-09T11:59:40.000Z'),
    updatedAt: Date.parse('2026-05-09T12:00:25.000Z'),
  }

  const generationRun: AgentRun = {
    id: RUN_ID,
    threadId: THREAD_ID,
    status: outcome === 'success' ? 'in_progress' : outcome === 'timeout' ? 'completed_with_warnings' : 'failed',
    policy: {
      approvalMode: 'auto_readonly',
      sandboxMode: false,
      maxToolCalls: 4,
      maxIterations: 4,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: { source: 'e2e-bootstrap' },
    createdAt: '2026-05-09T12:00:00.000Z',
    updatedAt: '2026-05-09T12:00:08.000Z',
    startedAt: '2026-05-09T12:00:00.000Z',
    steps: [],
    traceEvents: [{
      id: 'trace-generation-e2e-1',
      runId: RUN_ID,
      kind: 'tool_call',
      title: kind === 'video' ? 'Video generation progress' : 'Image generation progress',
      status: outcome === 'success' ? 'started' : 'failed',
      toolName: 'movscript_create_generation_job',
      data: {
        generation: {
          jobId: FINAL_JOB_ID,
          jobType: kind,
          providerName,
          modelDisplay,
          modelIdentifier,
          modelConfigId,
          status: outcome === 'success' ? 'running' : outcome === 'timeout' ? 'timeout' : 'failed',
          stage: outcome === 'success' ? 'rendering' : outcome === 'timeout' ? 'timeout' : 'failed',
          progress: 47,
          terminal: outcome !== 'timeout',
          message: outcome === 'success' ? '生成中，当前进度 47%。' : outcome === 'timeout' ? '生成监控已超时。' : 'provider rejected request',
        },
      },
      createdAt: '2026-05-09T12:00:08.000Z',
      ...(outcome !== 'timeout' ? { completedAt: '2026-05-09T12:00:24.000Z' } : {}),
    }],
  }

  const project: Project = {
    ID: PROJECT_ID,
    name: 'E2E Demo Project',
    description: 'Seeded project used to verify agent generation monitoring in the real app shell.',
    owner_id: USER_ID,
    CreatedAt: '2026-05-09T11:00:00.000Z',
    UpdatedAt: '2026-05-09T12:00:00.000Z',
  }

  return {
    appSettings: {
      apiBaseURL,
      launchMode: 'cloud',
      onboardingCompleted: true,
    },
    user: {
      user: {
        ID: USER_ID,
        username: 'e2e-agent',
        system_role: 'user',
      },
      token: 'e2e-token',
      expires_at: '2026-06-01T00:00:00.000Z',
      org_memberships: [{
        org_id: ORG_ID,
        org_name: 'E2E Org',
        org_slug: 'e2e-org',
        is_personal: true,
        plan: 'team',
        status: 'active',
        role: 'owner',
      }],
    },
    project,
    agent: {
      userId: String(USER_ID),
      settings: {
        includeProjectContext: true,
        includeRecentResources: true,
        autoPlan: true,
        permissionMode: 'ask',
      },
      conversations: [{
        conversation,
      }],
    },
    session: {
      conversationRuntimes: {
        [conversation.id]: {
          conversationId: conversation.id,
          requestId: 'request-generation-e2e',
          threadId: THREAD_ID,
          runId: generationRun.id,
          run: generationRun,
          status: outcome === 'success' ? 'in_progress' : outcome === 'timeout' ? 'completed_with_warnings' : 'failed',
          loading: outcome === 'success',
          building: false,
          approving: false,
          stopping: false,
          stopRequested: false,
          updatedAt: Date.now(),
        },
      },
      localThreadIdsByConversation: {
        [conversation.id]: THREAD_ID,
      },
    },
  }
}
