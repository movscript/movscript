import assert from 'node:assert/strict'
import test from 'node:test'
import {
  debugTabFromSearchParams,
  emptyJobMonitorFilters,
  hasJobFilterSearchParams,
  jobFiltersFromSearchParams,
  jobMonitorPageFromSearchParams,
  jobSearchParams,
  jobUrlSearchParams,
} from './adminJobQueryParams'

test('debugTabFromSearchParams defaults to system unless job filters are present', () => {
  assert.equal(debugTabFromSearchParams(new URLSearchParams()), 'system')
  assert.equal(debugTabFromSearchParams(new URLSearchParams('tab=jobs')), 'jobs')
  assert.equal(debugTabFromSearchParams(new URLSearchParams('tab=invalid')), 'system')
  assert.equal(debugTabFromSearchParams(new URLSearchParams('job_id=42')), 'jobs')
  assert.equal(debugTabFromSearchParams(new URLSearchParams('tab=invalid&status=failed')), 'jobs')
})

test('hasJobFilterSearchParams detects all job drilldown query params', () => {
  assert.equal(hasJobFilterSearchParams(new URLSearchParams()), false)
  for (const key of ['job_id', 'status', 'job_type', 'feature_key', 'user_id', 'org_id', 'project_id', 'model_config_id', 'page']) {
    assert.equal(hasJobFilterSearchParams(new URLSearchParams(`${key}=1`)), true, key)
  }
})

test('jobMonitorPageFromSearchParams normalizes missing and invalid pages', () => {
  assert.equal(jobMonitorPageFromSearchParams(new URLSearchParams()), 1)
  assert.equal(jobMonitorPageFromSearchParams(new URLSearchParams('page=3')), 3)
  assert.equal(jobMonitorPageFromSearchParams(new URLSearchParams('page=3.8')), 3)
  assert.equal(jobMonitorPageFromSearchParams(new URLSearchParams('page=0')), 1)
  assert.equal(jobMonitorPageFromSearchParams(new URLSearchParams('page=bad')), 1)
})

test('jobFiltersFromSearchParams parses job filter params', () => {
  const filters = jobFiltersFromSearchParams(new URLSearchParams('job_id=42&status=failed&job_type=video&feature_key=video_v2v&user_id=7&org_id=3&project_id=4&model_config_id=9'))
  assert.deepEqual(filters, {
    jobId: '42',
    status: 'failed',
    jobType: 'video',
    featureKey: 'video_v2v',
    userId: '7',
    orgId: '3',
    projectId: '4',
    modelConfigId: '9',
  })
})

test('jobSearchParams serializes trimmed filters and omits first page', () => {
  const serialized = jobSearchParams({
    ...emptyJobMonitorFilters,
    jobId: ' 42 ',
    status: 'failed',
    jobType: ' video ',
    userId: ' 7 ',
  }, 1)
  assert.equal(serialized.toString(), 'job_id=42&status=failed&job_type=video&user_id=7')
})

test('jobUrlSearchParams adds jobs tab and page when needed', () => {
  const serialized = jobUrlSearchParams({
    ...emptyJobMonitorFilters,
    projectId: ' 4 ',
    modelConfigId: '9',
  }, 2)
  assert.equal(serialized.toString(), 'project_id=4&model_config_id=9&page=2&tab=jobs')
})
