import test from 'node:test'
import assert from 'node:assert/strict'
import type { QueryClient } from '@tanstack/react-query'

import { installAppEventQueryInvalidationBridge, invalidateAppEventQueries } from './appEventQueryInvalidation'
import { publishAppEvent, resetAppEventDedupeForTests } from './appEvents'
import type { AppEvent, AppEventTopic } from './appEvents'

test('app event query invalidation bridge covers domain mutation channels', () => {
  const queryKeys: readonly unknown[][] = []
  const queryClient = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      queryKeys.push(queryKey)
      return Promise.resolve()
    },
  } as unknown as QueryClient

  invalidateAppEventQueries(queryClient, event('script.mutation', { type: 'ScriptCreated', projectId: 7, changedIds: [1], changedPaths: [] }))
  invalidateAppEventQueries(queryClient, event('canvas.mutation', { type: 'CanvasDocumentChanged', canvasId: 12, changedIds: [12], changedPaths: [] }))
  invalidateAppEventQueries(queryClient, event('job.mutation', { type: 'ToolJobsChanged', nodeType: 'ref-image', changedIds: [3], changedPaths: [] }))
  invalidateAppEventQueries(queryClient, event('organization.mutation', { type: 'OrganizationMembersChanged', orgId: 9, changedIds: [4], changedPaths: [] }))
  invalidateAppEventQueries(queryClient, event('shot-library.mutation', { type: 'ShotReferencesChanged', changedIds: [5], changedPaths: [] }))
  invalidateAppEventQueries(queryClient, event('agent-output.mutation', { type: 'AgentSessionOutputContentWorkspaceChanged', projectId: 7, changedIds: [6], changedPaths: [] }))
  invalidateAppEventQueries(queryClient, event('workspace-files.mutation', { type: 'WorkspaceFileChanged', path: 'project.json', changedIds: ['project.json'], changedPaths: ['project.json'] }))
  invalidateAppEventQueries(queryClient, event('semantic-entity.mutation', { type: 'SemanticEntityChanged', projectId: 7, kind: 'production', recordId: 10, changedIds: [10], changedPaths: [] }))

  assert.deepEqual(queryKeys, [
    ['scripts', 7],
    ['artifact-refs', 7],
    ['embedded-browser-navigation', 7, 'scripts'],
    ['canvas', 12],
    ['jobs', 'ref-image'],
    ['org', 9, 'members'],
    ['shot-references'],
    ['agent-session-output-content-workspace', 7],
    ['movscript-workspace-file', 'project.json'],
    ['production', 7],
    ['semantic-source-lock', 7, 'production', 10],
    ['embedded-browser-navigation', 7, 'production'],
  ])
})

test('installed query invalidation bridge only handles cross-surface events', () => {
  resetAppEventDedupeForTests()
  const queryKeys: readonly unknown[][] = []
  const queryClient = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      queryKeys.push(queryKey)
      return Promise.resolve()
    },
  } as unknown as QueryClient
  const uninstall = installAppEventQueryInvalidationBridge(queryClient)

  publishAppEvent({
    id: 'local-script-event',
    topic: 'script.mutation',
    scope: { kind: 'project', id: '7' },
    source: 'test',
    payload: { type: 'ScriptCreated', projectId: 7, changedIds: [1], changedPaths: [] },
  })
  publishAppEvent({
    id: 'cross-script-event',
    topic: 'script.mutation',
    scope: { kind: 'project', id: '7' },
    source: 'test',
    delivery: 'cross-surface',
    payload: { type: 'ScriptCreated', projectId: 7, changedIds: [1], changedPaths: [] },
  })

  uninstall()

  assert.deepEqual(queryKeys, [
    ['scripts', 7],
    ['artifact-refs', 7],
    ['embedded-browser-navigation', 7, 'scripts'],
  ])
})

test('project workspace updates refresh workspace, content, resource, and browser entity queries', () => {
  const queryKeys: readonly unknown[][] = []
  const queryClient = {
    invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
      queryKeys.push(queryKey)
      return Promise.resolve()
    },
  } as unknown as QueryClient

  invalidateAppEventQueries(queryClient, event('project.workspace.updated', { projectId: 7 }))

  assert.deepEqual(queryKeys, [
    ['movscript-workspace-files'],
    ['content-canvas', 'project', 7],
    ['agent-session-output-content-workspace', 7],
    ['embedded-browser-navigation', 7],
    ['resource-candidate-targets', 7],
    ['agent-generated-candidate-targets', 7],
    ['settings', 7],
    ['embedded-browser-navigation', 7, 'settings'],
    ['assetSlots', 7],
    ['embedded-browser-navigation', 7, 'assetSlots'],
    ['productions', 7],
    ['embedded-browser-navigation', 7, 'productions'],
    ['sceneMoments', 7],
    ['embedded-browser-navigation', 7, 'sceneMoments'],
    ['contentUnits', 7],
    ['embedded-browser-navigation', 7, 'contentUnits'],
  ])
})

function event(topic: AppEventTopic, payload: unknown): AppEvent {
  return {
    id: `${topic}:test`,
    topic,
    scope: { kind: 'global' },
    source: 'test',
    emittedAt: '2026-06-18T00:00:00.000Z',
    payload,
  }
}
