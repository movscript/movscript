import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterActivityEventsForRun,
  timelineActivitiesFromItems,
  runIdsWithTimelineActivityItems,
  timelineItemsContainRunActivity,
  timelineActivityByMessageId,
} from '@/features/agent/domain/agentTimelineActivityItems'
import type { AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

test('runIdsWithTimelineActivityItems reads embedded activity from timeline items', () => {
  const runIds = runIdsWithTimelineActivityItems([
    timelineItem('assistant_final_without_activity'),
    timelineItem('assistant_with_activity', {
      runId: 'run_2',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      steps: [],
      events: [],
    }),
  ])

  assert.deepEqual([...runIds], ['run_2'])
})

test('timelineActivityByMessageId indexes embedded activity by timeline message id', () => {
  const byMessageId = timelineActivityByMessageId([
    timelineItem('assistant_final_without_activity'),
    timelineItem('assistant_with_activity', {
      runId: 'run_2',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      steps: [],
      events: [],
    }),
  ])

  assert.equal(byMessageId.get('assistant_with_activity')?.runId, 'run_2')
  assert.equal(byMessageId.has('assistant_final_without_activity'), false)
})

test('timelineActivitiesFromItems returns embedded activity in timeline order', () => {
  const activities = timelineActivitiesFromItems([
    timelineItem('assistant_final_without_activity'),
    timelineItem('assistant_with_activity', {
      runId: 'run_2',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      steps: [],
      events: [],
    }),
  ])

  assert.deepEqual(activities.map((activity) => activity.runId), ['run_2'])
})

test('timelineItemsContainRunActivity ignores transcript items without activity', () => {
  assert.equal(timelineItemsContainRunActivity([timelineItem('stream_message')], 'run_1'), false)
})

test('timelineItemsContainRunActivity detects matching timeline activity', () => {
  assert.equal(timelineItemsContainRunActivity([
    timelineItem('final_message', {
      runId: ' run_1 ',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      steps: [],
      events: [],
    }),
  ], 'run_1'), true)
  assert.equal(timelineItemsContainRunActivity([
    timelineItem('final_message', {
      runId: 'run_2',
      threadId: 'thread_1',
      status: 'completed',
      createdAt: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-05-19T00:00:01.000Z',
      steps: [],
      events: [],
    }),
  ], 'run_1'), false)
})

test('filterActivityEventsForRun drops prior run activity but keeps unscoped pending local events', () => {
  const events: ChatRunActivityEvent[] = [
    activityEvent({ id: 'http-request-1', kind: 'provider_session', title: 'HTTP', status: 'started' }),
    activityEvent({ id: 'trace_old', runId: 'run_1', kind: 'tool_call', title: '旧工具结果', status: 'completed' }),
    activityEvent({ id: 'trace_current', runId: 'run_2', kind: 'model_call', title: '当前模型', status: 'started' }),
  ]

  assert.deepEqual(filterActivityEventsForRun(events, ' run_2 ').map((event) => event.id), ['http-request-1', 'trace_current'])
  assert.deepEqual(filterActivityEventsForRun(events, undefined).map((event) => event.id), ['http-request-1'])
})

function timelineItem(id: string, activity?: ChatRunActivity): AgentTimelineItem {
  return {
    id,
    threadId: 'thread_1',
    origin: 'agent',
    purpose: 'transcript',
    surface: 'message_stream',
    contentPromptEligibility: 'include',
    sortRank: 30,
    content: 'Final text',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    revision: 1,
    cursor: id,
    providerSessionRefs: { threadId: 'thread_1' },
    ...(activity ? { activity } : {}),
  }
}

function activityEvent(patch: Partial<ChatRunActivityEvent>): ChatRunActivityEvent {
  return {
    id: 'trace_1',
    kind: 'tool_call',
    title: 'Tool',
    status: 'started',
    createdAt: '2026-05-19T00:00:00.000Z',
    ...patch,
  }
}
