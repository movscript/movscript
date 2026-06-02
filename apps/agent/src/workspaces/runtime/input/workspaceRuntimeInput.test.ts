import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRuntimeCreateWorkspaceInput,
  buildRuntimeWorkspaceBackendAuth,
  buildRuntimeUpdateWorkspaceInput,
  requireRuntimeWorkspaceId,
} from './workspaceRuntimeInput.js'

test('buildRuntimeCreateWorkspaceInput normalizes project id and runtime workspace source', () => {
  assert.deepEqual(buildRuntimeCreateWorkspaceInput({
    projectId: 42,
    kind: 'project_standards_workspace',
    title: 'Workspace',
    content: 'Content',
    source: { runId: 'run_1', ignored: 'value' },
    target: { entityType: 'script' },
    metadata: { userKey: 'value' },
  }), {
    projectId: 42,
    kind: 'project_standards_workspace',
    title: 'Workspace',
    content: 'Content',
    source: { runId: 'run_1' },
    target: { entityType: 'script' },
    metadata: { userKey: 'value' },
  })
})

test('buildRuntimeCreateWorkspaceInput ignores invalid project ids', () => {
  for (const projectId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY, '42']) {
    assert.equal(buildRuntimeCreateWorkspaceInput({
      projectId,
      title: 'Workspace',
      content: 'Content',
    }).projectId, undefined)
  }
})

test('buildRuntimeUpdateWorkspaceInput filters update fields to store-safe values', () => {
  assert.deepEqual(buildRuntimeUpdateWorkspaceInput({
    workspaceId: ' workspace_1 ',
    status: 'applied',
    title: 'Updated',
    content: 'Body',
    target: { field: 'content' },
    metadata: { source: 'test' },
  }), {
    workspaceId: 'workspace_1',
    update: {
      title: 'Updated',
      content: 'Body',
      target: { field: 'content' },
      metadata: { source: 'test' },
    },
  })
  assert.deepEqual(buildRuntimeUpdateWorkspaceInput({
    workspaceId: 'workspace_1',
    status: 'unknown',
    target: { invalid: undefined },
  }), {
    workspaceId: 'workspace_1',
    update: {},
  })
})

test('buildRuntimeWorkspaceBackendAuth preserves backend auth strings and conditionally includes user id', () => {
  assert.deepEqual(buildRuntimeWorkspaceBackendAuth({
    appliedByUserId: 7,
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  }, { includeAppliedByUserId: true }), {
    userId: 7,
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  })
  assert.deepEqual(buildRuntimeWorkspaceBackendAuth({
    appliedByUserId: 7,
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  }), {
    backendAuthToken: ' token ',
    backendAPIBaseURL: ' http://backend ',
  })
  assert.deepEqual(buildRuntimeWorkspaceBackendAuth({
    appliedByUserId: { id: 7 },
    backendAuthToken: 123,
    backendAPIBaseURL: false,
  }, { includeAppliedByUserId: true }), {})
  for (const appliedByUserId of [0, 7.5, Number.NaN, Number.POSITIVE_INFINITY, '']) {
    assert.deepEqual(buildRuntimeWorkspaceBackendAuth({
      appliedByUserId,
    }, { includeAppliedByUserId: true }), {})
  }
})

test('requireRuntimeWorkspaceId rejects missing ids with action-specific messages', () => {
  assert.equal(requireRuntimeWorkspaceId(' workspace_1 ', 'validate workspace'), 'workspace_1')
  assert.throws(() => requireRuntimeWorkspaceId('', 'validate workspace'), /validate workspace requires workspaceId/)
})
