import test from 'node:test'
import assert from 'node:assert/strict'

import type {
  ElectronMediaPipelineEditingProject,
  ElectronMediaPipelineTaskState,
} from '@movscript/editing-surface/contracts'
import { resetAppEventDedupeForTests, subscribeAppEvents, type AppEvent } from '@movscript/editing-surface/app-events'
import { useEditingSessionStore } from './editingSessionStore'

test('editing session store owns active project, playhead, dirty and task state', () => {
  resetAppEventDedupeForTests()
  useEditingSessionStore.setState({
    activeProject: null,
    selectedClipId: '',
    playheadMs: 0,
    isDirty: false,
    saveState: { status: 'idle' },
    taskStates: [],
  })
  const events: AppEvent[] = []
  const unsubscribe = subscribeAppEvents((event) => {
    if (event.topic.startsWith('editing.')) events.push(event)
  })

  const project = projectFixture()
  useEditingSessionStore.getState().setActiveProject(project)
  useEditingSessionStore.getState().setSelectedClipId('clip_1')
  useEditingSessionStore.getState().setPlayheadMs((current) => current + 250)
  useEditingSessionStore.getState().setDirty(true)
  useEditingSessionStore.getState().setSaveState({ status: 'saving' })
  useEditingSessionStore.getState().upsertTaskState(taskFixture({ status: 'queued', progressPercent: 0 }))
  useEditingSessionStore.getState().upsertTaskState(taskFixture({ status: 'running', progressPercent: 50 }))

  unsubscribe()

  assert.equal(useEditingSessionStore.getState().activeProject?.id, 'editing_project')
  assert.equal(useEditingSessionStore.getState().selectedClipId, 'clip_1')
  assert.equal(useEditingSessionStore.getState().playheadMs, 250)
  assert.equal(useEditingSessionStore.getState().isDirty, true)
  assert.equal(useEditingSessionStore.getState().saveState.status, 'saving')
  assert.deepEqual(useEditingSessionStore.getState().taskStates.map((task) => [task.taskId, task.status, task.progressPercent]), [
    ['task_1', 'running', 50],
  ])
  assert.ok(events.some((event) => event.topic === 'editing.project.changed'))
  assert.ok(events.some((event) => event.topic === 'editing.task.changed'))
})

function projectFixture(): ElectronMediaPipelineEditingProject {
  return {
    version: 1,
    id: 'editing_project',
    projectId: 'project_1',
    title: 'Editing project',
    timeline: {
      version: 1,
      id: 'timeline_1',
      fps: 30,
      width: 1920,
      height: 1080,
      background: '#000000',
      durationMs: 1000,
      tracks: [],
    },
    assets: { assets: [] },
  }
}

function taskFixture(patch: Partial<ElectronMediaPipelineTaskState> = {}): ElectronMediaPipelineTaskState {
  return {
    taskId: 'task_1',
    projectId: 'standalone',
    taskType: 'timeline_render',
    status: 'queued',
    progressPercent: 0,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
    ...patch,
  }
}
