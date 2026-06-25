import assert from 'node:assert/strict'
import test from 'node:test'

import { latestPlanFromTimelineItems } from '@/features/agent/domain/agentTimelinePlan'
import type { AgentPlan, AgentTimelineItem } from '@movscript/agent-protocol'

test('latestPlanFromTimelineItems returns the newest plan status timeline item', () => {
  const olderPlan = plan('older')
  const latestPlan = plan('latest')

  assert.equal(latestPlanFromTimelineItems([
    transcriptItem('message'),
    planStatusItem('plan-older', olderPlan),
    planStatusItem('plan-latest', latestPlan),
  ]), latestPlan)
})

test('latestPlanFromTimelineItems ignores non-plan timeline items', () => {
  assert.equal(latestPlanFromTimelineItems([transcriptItem('message')]), undefined)
})

function plan(id: string): AgentPlan {
  return {
    schema: 'movscript.agent.plan.v1',
    id,
    threadId: 'thread_1',
    items: [],
    completedCount: 0,
    totalCount: 0,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
  }
}

function planStatusItem(id: string, snapshot: AgentPlan): AgentTimelineItem {
  return {
    ...transcriptItem(id),
    origin: 'provider_session',
    purpose: 'status',
    surface: 'status_strip',
    contentPromptEligibility: 'exclude',
    meta: {
      planRevision: {
        schema: 'movscript.agent.plan-revision.v1',
        id: `revision_${id}`,
        planId: snapshot.id,
        threadId: 'thread_1',
        snapshot,
        createdAt: '2026-05-19T00:00:00.000Z',
      },
    },
  }
}

function transcriptItem(id: string): AgentTimelineItem {
  return {
    id,
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 50,
    content: id,
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    revision: 1,
    cursor: id,
    providerSessionRefs: { threadId: 'thread_1' },
  }
}
