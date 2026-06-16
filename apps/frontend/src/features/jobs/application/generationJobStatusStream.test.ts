import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyGenerationJobStatusEventToCache,
  generationJobStatusCrossPageEvent,
  publishGenerationJobStatus,
  subscribeGenerationJobStatus,
  type GenerationJobStatusEvent,
} from './generationJobStatusStream'
import { resetCrossPageNotificationDedupeForTests } from '@/shared/application/crossPageNotifications'
import type { JobsQueryResult } from '@/features/jobs/components/JobsPageParts'
import type { Job } from '@/types'

test('generation job status publishes as a system cross-page topic', () => {
  resetCrossPageNotificationDedupeForTests()
  const received: GenerationJobStatusEvent[] = []
  const unsubscribe = subscribeGenerationJobStatus((event) => {
    received.push(event)
  })

  assert.equal(publishGenerationJobStatus({
    jobId: 42,
    status: 'running',
    projectId: 7,
    jobType: 'video',
    source: 'test',
    updatedAt: '2026-06-16T10:00:00.000Z',
  }), true)
  unsubscribe()

  assert.deepEqual(received, [{
    jobId: 42,
    status: 'running',
    projectId: 7,
    jobType: 'video',
    source: 'test',
    updatedAt: '2026-06-16T10:00:00.000Z',
  }])
})

test('generation job status event uses project scope when project is known', () => {
  const event = generationJobStatusCrossPageEvent({
    jobId: 42,
    status: 'succeeded',
    projectId: 7,
    updatedAt: '2026-06-16T10:00:00.000Z',
    source: 'test',
  })

  assert.equal(event.topic, 'generation-job')
  assert.deepEqual(event.scope, { kind: 'project', id: '7' })
})

test('generation job status projection updates cached jobs and invalidates jobs scope', () => {
  let data: JobsQueryResult | undefined = {
    jobs: [jobFixture({ ID: 42, status: 'running', UpdatedAt: '2026-06-16T09:59:00.000Z' })],
    total: 1,
  }
  const invalidated: readonly unknown[][] = []
  const queryClient = {
    setQueriesData<TData>(_filters: { queryKey: readonly unknown[] }, updater: (current: TData | undefined) => TData | undefined) {
      data = updater(data as TData | undefined) as JobsQueryResult | undefined
    },
    invalidateQueries(options: { queryKey: readonly unknown[] }) {
      invalidated.push(options.queryKey)
    },
  }

  applyGenerationJobStatusEventToCache(queryClient, {
    jobId: 42,
    status: 'succeeded',
    updatedAt: '2026-06-16T10:00:00.000Z',
    source: 'test',
  })

  assert.equal(data?.jobs[0]?.status, 'succeeded')
  assert.equal(data?.jobs[0]?.UpdatedAt, '2026-06-16T10:00:00.000Z')
  assert.deepEqual(invalidated, [['jobs']])
})

function jobFixture(patch: Partial<Job> = {}): Job {
  return {
    ID: 1,
    user_id: 1,
    model_config_id: 1,
    job_type: 'image',
    status: 'pending',
    prompt: 'prompt',
    CreatedAt: '2026-06-16T09:00:00.000Z',
    UpdatedAt: '2026-06-16T09:00:00.000Z',
    ...patch,
  }
}
