import assert from 'node:assert/strict'
import test from 'node:test'
import { pickContentWorkbenchRelevantJobs } from './contentWorkbenchJobScope'

test('content workbench job scope matches structured content unit references', () => {
  const jobs = pickContentWorkbenchRelevantJobs({
    contentUnitId: 801,
    jobs: [
      { ID: 1, request_context: JSON.stringify({ ref_type: 'content_unit', ref_id: 801 }) },
      { ID: 2, request_context: JSON.stringify({ target: { entityType: 'content_unit', entityId: 802 } }) },
      { ID: 3, extra_params: JSON.stringify({ contentUnitId: 801 }) },
    ],
  })

  assert.deepEqual(jobs.map((job) => job.ID), [1, 3])
})

test('content workbench job scope matches selected unit resources', () => {
  const jobs = pickContentWorkbenchRelevantJobs({
    contentUnitId: 801,
    resourceIds: [91, 92],
    jobs: [
      { ID: 1, input_resource_id: 91 },
      { ID: 2, input_resource_ids: '[93,94]' },
      { ID: 3, inputResourceIds: [92] },
    ],
  })

  assert.deepEqual(jobs.map((job) => job.ID), [1, 3])
})

test('content workbench job scope falls back to title or prompt text', () => {
  const jobs = pickContentWorkbenchRelevantJobs({
    contentUnitId: 801,
    contentUnitTitle: '纸条特写',
    jobs: [
      { ID: 1, title: '纸条特写 视频生成' },
      { ID: 2, prompt: '门外空镜，雨夜街道' },
      { ID: 3, prompt: '需要生成纸条特写的雨水细节' },
    ],
  })

  assert.deepEqual(jobs.map((job) => job.ID), [1, 3])
})

test('content workbench job scope returns no jobs without selected content unit', () => {
  const jobs = pickContentWorkbenchRelevantJobs({
    contentUnitId: null,
    contentUnitTitle: '纸条特写',
    jobs: [{ ID: 1, title: '纸条特写 视频生成' }],
  })

  assert.deepEqual(jobs, [])
})
