import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDomainFocus } from '@movscript/domain'
import { projectReadModelToStatusSnapshot } from './projectStatusSnapshot'

test('local project status snapshot preserves non-production timeline scope without playback target', () => {
  const domainFocus = normalizeDomainFocus({
    projectId: '7',
    scopeKind: 'episode',
    scopeRef: 'episode_01',
  })
  const snapshot = projectReadModelToStatusSnapshot({
    projectId: '7',
    projectDir: '/tmp/rain-night',
    domainFocus,
    readModel: {
      projectReadModel: {
        projectTimelineStatus: {
          schema: 'movscript.project_timeline_status.v1',
        },
      },
    },
  })

  assert.equal(snapshot.target.production_id, undefined)
  assert.equal(snapshot.target.timeline_scope_kind, 'episode')
  assert.equal(snapshot.target.timeline_scope_ref, 'episode_01')
  assert.equal(snapshot.target.target_kind, undefined)
  assert.equal(snapshot.target.target_ref, undefined)

  const summary = snapshot.data?.status_summary as Record<string, unknown>
  assert.equal(summary.timeline_scope_kind, 'episode')
  assert.equal(summary.target_ref, undefined)
  assert.equal(summary.preferred_schema, 'movscript.project_timeline_status.v1')
  assert.equal(Array.isArray(summary.productions), true)
  assert.equal((summary.productions as Array<Record<string, unknown>>)[0]?.production_id, 'default')
})

test('local project status snapshot keeps production scope as legacy alias', () => {
  const domainFocus = normalizeDomainFocus({
    projectId: '7',
    scopeKind: 'production',
    scopeRef: 'pilot',
  })
  const snapshot = projectReadModelToStatusSnapshot({
    projectId: '7',
    projectDir: '/tmp/rain-night',
    productionId: 'pilot',
    domainFocus,
    readModel: { projectReadModel: {} },
  })

  assert.equal(snapshot.target.production_id, 'pilot')
  assert.equal(snapshot.target.timeline_scope_kind, 'production')
})
