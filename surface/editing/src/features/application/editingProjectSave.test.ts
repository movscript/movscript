import test from 'node:test'
import assert from 'node:assert/strict'

import type { ElectronMediaPipelineEditingProject } from '@movscript/editing-surface/contracts'

import { saveEditingProjectSnapshot } from './editingProjectSave'

test('saveEditingProjectSnapshot retries when local revision is ahead of the stored revision', async () => {
  const project = projectFixture({ revision: 90 })
  const attempts: Array<{ revision?: number; expectedRevision?: number }> = []
  const attemptedRevisions: Array<number | undefined> = []

  const outcome = await saveEditingProjectSnapshot({
    project,
    now: makeClock('2026-06-17T01:00:00.000Z', '2026-06-17T01:00:01.000Z'),
    onAttempt: (attemptProject) => attemptedRevisions.push(attemptProject.revision),
    mediaAPI: {
      saveMediaEditingProject: async (input) => {
        attempts.push({
          revision: input.editingProject?.revision,
          expectedRevision: input.expectedRevision,
        })
        if (attempts.length === 1) {
          const storedProject = projectFixture({ revision: 88, title: 'Stored cut' })
          return {
            status: 'conflict',
            code: 'EDITING_PROJECT_REVISION_CONFLICT',
            message: 'Media editing project revision conflict: expected 90, found 88',
            projectId: storedProject.projectId,
            project_id: storedProject.projectId,
            editingProjectId: storedProject.id,
            editing_project_id: storedProject.id,
            expectedRevision: 90,
            expected_revision: 90,
            currentRevision: 88,
            current_revision: 88,
            editingProject: storedProject,
            editing_project: storedProject,
            projectPath: '/tmp/project.json',
            project_path: '/tmp/project.json',
          }
        }
        return {
          status: 'ok',
          editingProject: input.editingProject!,
          editing_project: input.editingProject!,
          projectPath: '/tmp/project.json',
          project_path: '/tmp/project.json',
        }
      },
    },
  })

  assert.equal(outcome.status, 'saved')
  assert.deepEqual(attempts, [
    { revision: 91, expectedRevision: 90 },
    { revision: 89, expectedRevision: 88 },
  ])
  assert.deepEqual(attemptedRevisions, [91, 89])
  assert.equal(outcome.status === 'saved' ? outcome.editingProject.revision : undefined, 89)
})

test('saveEditingProjectSnapshot keeps conflicts when the stored revision is newer', async () => {
  const project = projectFixture({ revision: 90 })
  let attempts = 0

  const outcome = await saveEditingProjectSnapshot({
    project,
    now: makeClock('2026-06-17T01:00:00.000Z'),
    mediaAPI: {
      saveMediaEditingProject: async () => {
        attempts += 1
        const storedProject = projectFixture({ revision: 91, title: 'External edit' })
        return {
          status: 'conflict',
          code: 'EDITING_PROJECT_REVISION_CONFLICT',
          message: 'Media editing project revision conflict: expected 90, found 91',
          projectId: storedProject.projectId,
          project_id: storedProject.projectId,
          editingProjectId: storedProject.id,
          editing_project_id: storedProject.id,
          expectedRevision: 90,
          expected_revision: 90,
          currentRevision: 91,
          current_revision: 91,
          editingProject: storedProject,
          editing_project: storedProject,
          projectPath: '/tmp/project.json',
          project_path: '/tmp/project.json',
        }
      },
    },
  })

  assert.equal(outcome.status, 'conflict')
  assert.equal(attempts, 1)
})

function projectFixture(patch: Partial<ElectronMediaPipelineEditingProject> = {}): ElectronMediaPipelineEditingProject {
  return {
    version: 1,
    id: 'editing-project-save-test',
    projectId: 'standalone',
    title: 'Local cut',
    source: { kind: 'manual' },
    timeline: {
      version: 1,
      id: 'timeline-save-test',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 0,
      tracks: [],
    },
    assets: { assets: [] },
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt: '2026-06-17T00:00:00.000Z',
    revision: 1,
    ...patch,
  }
}

function makeClock(...values: string[]): () => string {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)]
}
