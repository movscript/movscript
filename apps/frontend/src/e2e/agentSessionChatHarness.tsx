import React, { createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import '@/index.css'
import '@/i18n'
import { AgentConversationThreadSection } from '@/features/agent/components/AgentConversationThreadSection'
import { buildAgentConversationProjection } from '@/features/agent/domain/agentConversationProjection'
import type { PlanDispatchSettings } from '@/features/agent/application/agentPlanActions'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

function AgentSessionChatHarness() {
  const transcriptMessages = [
    message({
      id: 'local_user',
      role: 'user',
      content: 'Start worker task',
      meta: {
        runtimeMessage: { threadId: 'thread_interactive', messageId: 'msg_user', runId: 'run_worker' },
        runtimeInput: { threadId: 'thread_interactive', messageId: 'msg_user', runId: 'run_worker', deliveryStatus: 'accepted' },
      },
    }),
    message({
      id: 'assistant_result',
      role: 'assistant',
      content: 'Worker reported result',
      timestamp: 2,
      meta: {
        runtimeMessage: { threadId: 'thread_interactive', messageId: 'msg_result', runId: 'run_worker' },
      },
    }),
  ]
  const interactionRunsByResultMessageId = new Map([
    ['local_user', [run({
      id: 'run_worker',
      pendingApprovals: [approval({
        id: 'approval_worker',
        runId: 'run_worker',
        toolName: 'movscript_test_tool',
        args: { marker: 'worker-approval-marker' },
        reason: 'Worker needs confirmation',
      })],
    })]],
  ])

  return (
    <QueryClientProvider client={queryClient}>
      <main className="h-screen bg-background p-4 text-foreground">
        <AgentConversationThreadSection
          approvingActiveRun={false}
          bottomRef={createRef<HTMLDivElement>()}
          conversationId="agent-session-chat-harness"
          conversationProjection={buildAgentConversationProjection({
            activeRun: null,
            liveBlocks: [],
            transcriptMessages,
            timelineItems: [],
            runInteractions: {
              answerEchoMessageIds: new Set(),
              runsByResultMessageId: interactionRunsByResultMessageId,
              standaloneRuns: [],
            },
          })}
          currentPlan={undefined}
          generationProgressStates={[]}
          showTimelineLoading={false}
          planActionBusy={false}
          planDispatchSettings={planDispatchSettings()}
          threadRef={createRef<HTMLDivElement>()}
          onAcceptPlanReview={() => {}}
          onAnswerRunInput={() => {}}
          onApproveRun={() => {}}
          onCancelPlanTree={() => {}}
          onDispatchTaskGraph={() => {}}
          onRejectRun={() => {}}
          onRejectPlanReview={() => {}}
          onRetaskGraph={() => {}}
          onReworkPlanReview={() => {}}
          onScroll={() => {}}
          onUpdatePlanDispatchSettings={() => {}}
        />
      </main>
    </QueryClientProvider>
  )
}

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message_1',
    role: 'assistant',
    content: 'Message',
    timestamp: 1,
    ...overrides,
  }
}

function run(overrides: Partial<AgentRun>): AgentRun {
  return {
    id: 'run_1',
    threadId: 'thread_worker',
    status: 'requires_action',
    providerSessionLimits: {
      approvalMode: 'interactive',
      maxToolCalls: 20,
      maxIterations: 8,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    steps: [],
    ...overrides,
  }
}

function approval(overrides: Partial<NonNullable<AgentRun['pendingApprovals']>[number]>): NonNullable<AgentRun['pendingApprovals']>[number] {
  return {
    id: 'approval_1',
    runId: 'run_1',
    toolName: 'runtime_test_tool',
    args: {},
    reason: 'Approval required',
    status: 'pending',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  }
}

function planDispatchSettings(): PlanDispatchSettings {
  return {
    maxWorkers: 1,
    maxTaskAttempts: 1,
    workerTimeoutMs: 60_000,
  }
}

createRoot(document.getElementById('root')!).render(<AgentSessionChatHarness />)
