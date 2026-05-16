import type { E2EBootstrapSeed } from '@/lib/e2eBootstrap'
import type { AgentPlanSnapshot, AgentRun, AgentRunTraceSummary, AgentTraceEvent } from '@/lib/localAgentClient'
import type { ChatMessage, Conversation } from '@/store/agentStore'
import type { Project } from '@/types'
import { buildGenerationAppBootstrap } from './generationAppSeed'

export const PLANNER_PLAN_ID = 'plan_planner_e2e'
export const PLANNER_RUN_ID = 'run_planner_e2e'
export const WORKER_RUN_ID = 'run_worker_einstein_e2e'
export const APPROVAL_WORKER_RUN_ID = 'run_worker_approval_e2e'
export const INPUT_WORKER_RUN_ID = 'run_worker_input_e2e'

const THREAD_ID = 'thread-planner-e2e'
const CONVERSATION_ID = 'conversation-planner-e2e'
const FIXED_NOW = '2026-05-12T09:00:00.000Z'

export function buildPlannerAgentBootstrap(apiBaseURL: string): E2EBootstrapSeed {
  const base = buildGenerationAppBootstrap(apiBaseURL)
  const userId = String(base.user?.user.ID ?? 1001)
  const userMessage: ChatMessage = {
    id: 'message-user-planner-e2e',
    role: 'user',
    content: '请并行梳理项目素材风险，并把结果汇总给我。',
    timestamp: Date.parse(FIXED_NOW),
  }
  const assistantMessage: ChatMessage = {
    id: 'message-assistant-planner-e2e',
    role: 'assistant',
    content: '已创建计划，并派发Einstein处理素材风险审计。',
    timestamp: Date.parse('2026-05-12T09:00:10.000Z'),
  }
  const conversation: Conversation = {
    id: CONVERSATION_ID,
    title: 'Planner 调度 E2E',
    messages: [userMessage, assistantMessage],
    createdAt: Date.parse(FIXED_NOW),
    updatedAt: Date.parse('2026-05-12T09:00:10.000Z'),
  }
  const plannerRun = plannerRunFixture()

  return {
    ...base,
    agent: {
      ...(base.agent ?? { conversations: [] }),
      userId,
      conversations: [{ conversation }],
    },
    session: {
      conversationRuntimes: {
        [CONVERSATION_ID]: {
          conversationId: CONVERSATION_ID,
          requestId: 'request-planner-e2e',
          threadId: THREAD_ID,
          runId: plannerRun.id,
          run: plannerRun,
          status: 'in_progress',
          loading: false,
          building: false,
          approving: false,
          stopping: false,
          stopRequested: false,
          updatedAt: Date.parse('2026-05-12T09:00:20.000Z'),
        },
      },
      localThreadIdsByConversation: {
        [CONVERSATION_ID]: THREAD_ID,
      },
    },
  }
}

export function plannerRunFixture(): AgentRun {
  return {
    id: PLANNER_RUN_ID,
    threadId: THREAD_ID,
    status: 'in_progress',
    role: 'planner',
    planId: PLANNER_PLAN_ID,
    progress: 0.45,
    policy: {
      approvalMode: 'auto_readonly',
      sandboxMode: false,
      maxToolCalls: 8,
      maxIterations: 6,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: { source: 'planner-e2e' },
    createdAt: FIXED_NOW,
    updatedAt: '2026-05-12T09:00:20.000Z',
    startedAt: FIXED_NOW,
    steps: [{
      id: 'step_planner_context',
      runId: PLANNER_RUN_ID,
      type: 'message',
      status: 'completed',
      title: 'Planner context resolved',
      createdAt: FIXED_NOW,
      completedAt: '2026-05-12T09:00:02.000Z',
    }],
    traceEvents: traceEventsFixture(PLANNER_RUN_ID),
  }
}

export function workerRunFixture(): AgentRun {
  return {
    id: WORKER_RUN_ID,
    threadId: THREAD_ID,
    status: 'in_progress',
    role: 'worker',
    parentRunId: PLANNER_RUN_ID,
    planId: PLANNER_PLAN_ID,
    taskId: 'task_einstein_audit',
    progress: 0.62,
    policy: {
      approvalMode: 'auto_readonly',
      sandboxMode: false,
      maxToolCalls: 4,
      maxIterations: 4,
      allowNetwork: false,
      allowFileBytes: false,
    },
    metadata: { subagentName: 'Einstein' },
    createdAt: '2026-05-12T09:00:04.000Z',
    updatedAt: '2026-05-12T09:00:18.000Z',
    startedAt: '2026-05-12T09:00:04.000Z',
    steps: [{
      id: 'step_worker_read',
      runId: WORKER_RUN_ID,
      type: 'tool_call',
      status: 'completed',
      title: 'Read project assets',
      toolName: 'movscript_read_project_assets',
      createdAt: '2026-05-12T09:00:05.000Z',
      completedAt: '2026-05-12T09:00:09.000Z',
    }],
    traceEvents: traceEventsFixture(WORKER_RUN_ID),
  }
}

export function approvalWorkerRunFixture(): AgentRun {
  return {
    ...workerRunFixture(),
    id: APPROVAL_WORKER_RUN_ID,
    status: 'requires_action',
    taskId: 'task_approval_review',
    progress: 0.35,
    metadata: { subagentName: 'Hawking' },
    pendingApprovals: [{
      id: 'approval_publish_assets',
      runId: APPROVAL_WORKER_RUN_ID,
      toolName: 'movscript_publish_assets',
      args: { dryRun: false },
      reason: 'Publish reviewed asset metadata back to the project.',
      risk: 'write',
      permission: 'project.assets.write',
      status: 'pending',
      createdAt: '2026-05-12T09:00:14.000Z',
      updatedAt: '2026-05-12T09:00:14.000Z',
    }],
    updatedAt: '2026-05-12T09:00:14.000Z',
    traceEvents: traceEventsFixture(APPROVAL_WORKER_RUN_ID),
  }
}

export function inputWorkerRunFixture(): AgentRun {
  return {
    ...workerRunFixture(),
    id: INPUT_WORKER_RUN_ID,
    status: 'requires_action',
    taskId: 'task_input_review',
    progress: 0.2,
    metadata: { subagentName: 'Turing' },
    pendingInputRequests: [{
      id: 'input_asset_scope',
      runId: INPUT_WORKER_RUN_ID,
      title: '确认素材范围',
      summary: 'Worker 需要用户确认本次是否包含临时占位素材。',
      question: '这次风险审计是否包含临时占位素材？',
      inputType: 'choice',
      choices: [
        { id: 'include_placeholders', label: '包含占位素材', description: '临时素材也纳入风险审计。' },
        { id: 'exclude_placeholders', label: '不包含占位素材', description: '只审计正式素材。' },
      ],
      allowCustomAnswer: true,
      status: 'pending',
      createdAt: '2026-05-12T09:00:16.000Z',
      updatedAt: '2026-05-12T09:00:16.000Z',
    }],
    updatedAt: '2026-05-12T09:00:16.000Z',
    traceEvents: traceEventsFixture(INPUT_WORKER_RUN_ID),
  }
}

export function plannerPlanSnapshotFixture(): AgentPlanSnapshot {
  const plannerRun = plannerRunFixture()
  const workerRun = workerRunFixture()
  const approvalWorkerRun = approvalWorkerRunFixture()
  const inputWorkerRun = inputWorkerRunFixture()
  return {
    plan: {
      id: PLANNER_PLAN_ID,
      threadId: THREAD_ID,
      rootRunId: PLANNER_RUN_ID,
      title: 'Planner 调度 E2E',
      status: 'running',
      progress: 0.45,
      createdAt: FIXED_NOW,
      updatedAt: '2026-05-12T09:00:20.000Z',
    },
    tasks: [
      {
        id: 'task_einstein_audit',
        planId: PLANNER_PLAN_ID,
        deps: [],
        title: '素材风险审计',
        description: '检查项目素材缺口与风险。',
        status: 'running',
        progress: 0.62,
        ownerRunId: WORKER_RUN_ID,
        artifacts: [{
          id: 'artifact_einstein_risk',
          type: 'review',
          title: '素材风险摘要',
          uri: 'agent-artifact:artifact_einstein_risk',
          metadata: {
            subagentName: 'Einstein',
            sourceRunId: WORKER_RUN_ID,
            sourceTaskId: 'task_einstein_audit',
            toolName: 'movscript_review_assets',
          },
          createdAt: '2026-05-12T09:00:12.000Z',
        }],
        metadata: {
          executionMode: 'worker',
          subagentName: 'Einstein',
          retryAttempt: 1,
          maxTaskAttempts: 2,
          workerTimeoutMs: 900000,
        },
        createdAt: '2026-05-12T09:00:01.000Z',
        updatedAt: '2026-05-12T09:00:18.000Z',
      },
      {
        id: 'task_approval_review',
        planId: PLANNER_PLAN_ID,
        deps: [],
        title: '素材发布审批',
        description: '等待人工批准后写回素材元数据。',
        status: 'blocked',
        progress: 0.35,
        ownerRunId: APPROVAL_WORKER_RUN_ID,
        blockedReason: 'Worker run needs approval.',
        artifacts: [],
        metadata: {
          executionMode: 'worker',
          subagentName: 'Hawking',
        },
        createdAt: '2026-05-12T09:00:03.000Z',
        updatedAt: '2026-05-12T09:00:14.000Z',
      },
      {
        id: 'task_input_review',
        planId: PLANNER_PLAN_ID,
        deps: [],
        title: '素材范围确认',
        description: '等待用户确认 worker 的审计范围。',
        status: 'blocked',
        progress: 0.2,
        ownerRunId: INPUT_WORKER_RUN_ID,
        blockedReason: 'Worker run needs input.',
        artifacts: [],
        metadata: {
          executionMode: 'worker',
          subagentName: 'Turing',
        },
        createdAt: '2026-05-12T09:00:04.000Z',
        updatedAt: '2026-05-12T09:00:16.000Z',
      },
      {
        id: 'task_planner_summary',
        planId: PLANNER_PLAN_ID,
        deps: ['task_einstein_audit', 'task_approval_review', 'task_input_review'],
        title: '最终汇总',
        description: '等待 worker 输出后生成用户可见总结。',
        status: 'pending',
        progress: 0,
        artifacts: [],
        metadata: { executionMode: 'planner' },
        createdAt: '2026-05-12T09:00:02.000Z',
        updatedAt: '2026-05-12T09:00:02.000Z',
      },
    ],
    runs: [plannerRun, workerRun, approvalWorkerRun, inputWorkerRun],
    summary: {
      taskCount: 4,
      taskStatusCounts: { pending: 1, running: 1, blocked: 2, needs_review: 0, done: 0, failed: 0, cancelled: 0 },
      workerCount: 3,
      activeWorkerCount: 3,
      artifactCount: 1,
      nameConflictCount: 0,
      blockedTaskIds: ['task_approval_review', 'task_input_review'],
      needsReviewTaskIds: [],
      failedTaskIds: [],
    },
  }
}

export function traceSummaryFixture(runId: string): AgentRunTraceSummary {
  const events = traceEventsFixture(runId)
  const byKind = events.reduce<AgentRunTraceSummary['byKind']>((counts, event) => {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1
    return counts
  }, {})
  return {
    runId,
    total: events.length,
    byKind,
    latestEvent: events.at(-1),
  }
}

export function traceEventsFixture(runId: string): AgentTraceEvent[] {
  const modelEvents: AgentTraceEvent[] = runId === WORKER_RUN_ID
    ? [
        {
          id: `trace_${runId}_model_request`,
          runId,
          kind: 'model_call',
          title: 'Model HTTP request sent',
          status: 'started',
          summary: 'POST /api/v1/model-gateway/chat/completions',
          data: {
            phase: 'request',
            latencyMs: 0,
            request: {
              url: 'http://localhost:8765/api/v1/model-gateway/chat/completions',
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: {
                model: 'model_config:e2e',
                messages: [
                  { role: 'system', content: '你是素材风险审计 worker。' },
                  { role: 'user', content: '请检查当前项目素材风险。' },
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'movscript_review_assets',
                    description: 'Review asset coverage for a production.',
                    parameters: {
                      type: 'object',
                      properties: {
                        productionId: { type: 'number' },
                      },
                    },
                  },
                }],
                tool_choice: 'auto',
                stream: false,
              },
            },
          },
          createdAt: '2026-05-12T09:00:03.000Z',
        },
        {
          id: `trace_${runId}_model_response`,
          runId,
          kind: 'model_call',
          title: 'Model HTTP response received',
          status: 'completed',
          summary: 'HTTP 200 in 321ms',
          data: {
            phase: 'response',
            latencyMs: 321,
            request: {
              body: {
                messages: [
                  { role: 'system', content: '你是素材风险审计 worker。' },
                  { role: 'user', content: '请检查当前项目素材风险。' },
                ],
                tools: [{
                  type: 'function',
                  function: { name: 'movscript_review_assets', parameters: { type: 'object', properties: { productionId: { type: 'number' } } } },
                }],
                tool_choice: 'auto',
                stream: false,
              },
            },
            response: {
              status: 200,
              statusText: 'OK',
              ok: true,
              headers: { 'content-type': 'application/json' },
              bodyText: '{"id":"chatcmpl_e2e","choices":[{"message":{"content":"发现缺少主视觉覆盖。"}}]}',
              parsedBody: { id: 'chatcmpl_e2e' },
              content: '发现缺少主视觉覆盖。',
            },
            finish_reason: 'stop',
            content_chars: 10,
            usage: { input_tokens: 42, output_tokens: 8 },
            tool_calls: [],
          },
          createdAt: '2026-05-12T09:00:04.000Z',
          completedAt: '2026-05-12T09:00:04.321Z',
        },
      ]
    : []
  return [
    {
      id: `trace_${runId}_start`,
      runId,
      kind: 'run',
      title: runId === WORKER_RUN_ID ? 'Worker started' : 'Planner started',
      status: 'started',
      summary: runId === WORKER_RUN_ID ? 'Einstein开始素材风险审计。' : 'Planner started plan orchestration.',
      createdAt: '2026-05-12T09:00:01.000Z',
    },
    ...(runId === WORKER_RUN_ID ? [{
      id: `trace_${runId}_prompt`,
      runId,
      kind: 'prompt' as const,
      title: 'Prompt composed',
      status: 'completed' as const,
      summary: 'Prompt composed for asset review worker.',
      data: {
        charCount: 1024,
        messageCount: 3,
        systemMessageCount: 1,
        skillIds: ['movscript.workflow.asset-review', 'movscript.policy.drafts'],
        availableToolNames: ['movscript_review_assets', 'movscript_get_focus'],
        blockedToolCount: 1,
        promptStats: {
          totalChars: 1024,
          byLayer: {
            level0_core: 420,
            level1_context: 360,
            level2_behavior: 220,
            runtime_warnings: 24,
          },
          byContextLayer: {
            runtime_contract: 420,
            focus: 260,
            behavior: 220,
            thread_continuity: 100,
            warning: 24,
          },
          parts: [
            { id: 'runtime.contract', layer: 'level0_core', contextLayer: 'runtime_contract', chars: 420 },
            { id: 'focus.project', layer: 'level1_context', contextLayer: 'focus', chars: 260 },
            { id: 'skill.workflow.asset-review', layer: 'level2_behavior', contextLayer: 'behavior', chars: 220 },
            { id: 'thread.latest', layer: 'level1_context', contextLayer: 'thread_continuity', chars: 100 },
            { id: 'runtime.warning.blocked_tools', layer: 'runtime_warnings', contextLayer: 'warning', chars: 24 },
          ],
        },
      },
      createdAt: '2026-05-12T09:00:02.000Z',
      completedAt: '2026-05-12T09:00:02.020Z',
    }] : []),
    ...modelEvents,
    {
      id: `trace_${runId}_tool`,
      runId,
      kind: 'tool_call',
      title: runId === WORKER_RUN_ID ? 'Asset review tool call' : 'Subagent dispatch tool call',
      status: 'completed',
      toolName: runId === WORKER_RUN_ID ? 'movscript_review_assets' : 'movscript_spawn_subagent',
      summary: runId === WORKER_RUN_ID ? 'Found missing hero visual coverage.' : 'Spawned worker Einstein.',
      data: runId === WORKER_RUN_ID
        ? {
            findings: ['missing_hero_visual'],
            artifactId: 'artifact_einstein_risk',
            authorization: 'Bearer e2e-secret-token',
            apiKey: 'provider-e2e-api-key',
            signedUrl: 'https://cdn.example.test/private/result.png?token=e2e-signed-token&width=1024',
          }
        : { subagentName: 'Einstein', taskId: 'task_einstein_audit' },
      createdAt: '2026-05-12T09:00:08.000Z',
      completedAt: '2026-05-12T09:00:12.000Z',
    },
    ...(runId === WORKER_RUN_ID ? [{
      id: `trace_${runId}_assistant`,
      runId,
      kind: 'assistant' as const,
      title: 'Assistant message created',
      status: 'completed' as const,
      summary: '发现缺少主视觉覆盖，已生成素材风险摘要。',
      data: {
        messageId: 'msg_einstein_risk_summary',
        chars: 22,
        content: '发现缺少主视觉覆盖，已生成素材风险摘要。',
        source: 'model',
      },
      createdAt: '2026-05-12T09:00:13.000Z',
      completedAt: '2026-05-12T09:00:13.030Z',
    }] : []),
  ]
}

export function e2eProjectFixture(): Project {
  return {
    ID: 123,
    name: 'E2E Demo Project',
    description: 'Seeded project used to verify planner orchestration in the real app shell.',
    owner_id: 1001,
    CreatedAt: '2026-05-09T11:00:00.000Z',
    UpdatedAt: '2026-05-09T12:00:00.000Z',
  }
}
