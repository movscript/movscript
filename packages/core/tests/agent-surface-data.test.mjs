import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentSurfaceSnapshotTarget,
} from '../dist/mcp/node/index.js'

test('agent surface snapshot target includes normalized domain focus', () => {
  const target = agentSurfaceSnapshotTarget({
    projectId: 'project-a',
    timelineAssemblyRef: 'timeline_assembly:production:pilot',
    scopeKind: 'production',
    scopeRef: 'pilot',
  })

  assert.equal(target.projectId, 'project-a')
  assert.equal(target.domain_focus.projectId, 'project-a')
  assert.equal(target.domain_focus.target, undefined)
  assert.equal(target.domain_focus.scope?.kind, 'production')
  assert.deepEqual(target.domain_focus.diagnostics.map((diagnostic) => diagnostic.code), ['focus_timeline_assembly_target_removed'])
})

test('agent surface snapshot target reports namespace targets as focus diagnostics', () => {
  const target = agentSurfaceSnapshotTarget({
    projectId: 'project-a',
    targetCategory: 'timeline_namespace',
    targetKind: 'episode',
    targetRef: 'episode_01',
  })

  assert.equal(target.domain_focus.target, undefined)
  assert.deepEqual(target.domain_focus.diagnostics.map((diagnostic) => diagnostic.code), ['focus_namespace_target'])
})
