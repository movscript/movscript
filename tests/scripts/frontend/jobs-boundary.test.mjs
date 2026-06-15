import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const jobsPageSource = readSource('apps/frontend/src/features/jobs/components/JobsPage.tsx')
const toolDialogSource = readSource('apps/frontend/src/features/tools/components/ToolDialog.tsx')
const jobQueryKeysSource = readSource('apps/frontend/src/features/jobs/application/jobQueryKeys.ts')
const jobMutationSource = readSource('apps/frontend/src/features/jobs/application/jobMutationInvalidation.ts')

test('jobs surfaces delegate query keys and invalidation', () => {
  assert.match(jobsPageSource, /from '@\/features\/jobs\/application\/jobQueryKeys'/)
  assert.match(jobsPageSource, /jobKeys\.list\(\{ category: activeCategory, status: statusFilter, page \}\)/)
  assert.match(jobsPageSource, /invalidateJobMutationResult\(qc, jobListChangedResult\(\{ changedIds: \[job\.ID\] \}\)\)/)
  assert.doesNotMatch(jobsPageSource, /queryKey: \['jobs'/)
  assert.doesNotMatch(jobsPageSource, /invalidateQueries\(\{ queryKey: \['jobs'/)

  assert.match(toolDialogSource, /from '@\/features\/jobs\/application\/jobQueryKeys'/)
  assert.match(toolDialogSource, /jobKeys\.toolHistory\(_nodeType, historyPage\)/)
  assert.match(toolDialogSource, /invalidateJobMutationResult\(qc, toolJobsChangedResult\(\{ nodeType: _nodeType, changedIds: \[job\.ID\] \}\)\)/)
  assert.doesNotMatch(toolDialogSource, /queryKey: \['jobs'/)
  assert.doesNotMatch(toolDialogSource, /invalidateQueries\(\{ queryKey: \['jobs'/)

  assert.match(jobQueryKeysSource, /export const jobKeys/)
  assert.match(jobQueryKeysSource, /all: \['jobs'\] as const/)
  assert.match(jobQueryKeysSource, /toolHistory/)
  assert.doesNotMatch(jobQueryKeysSource, /export function invalidateJobs/)
  assert.doesNotMatch(jobQueryKeysSource, /export function invalidateToolJobs/)

  assert.match(jobMutationSource, /export type JobMutationEvent/)
  assert.match(jobMutationSource, /export interface JobMutationResult/)
  assert.match(jobMutationSource, /type: 'JobListChanged'/)
  assert.match(jobMutationSource, /type: 'ToolJobsChanged'/)
  assert.match(jobMutationSource, /export function jobListChangedResult/)
  assert.match(jobMutationSource, /export function toolJobsChangedResult/)
  assert.match(jobMutationSource, /export function invalidateJobMutationResult/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
