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

test('local project status snapshot keeps multiple productions and groups nested content units', () => {
  const snapshot = projectReadModelToStatusSnapshot({
    projectId: '7',
    projectDir: '/tmp/farming-tech',
    readModel: {
      projectReadModel: {
        projectTimelineStatus: {
          schema: 'movscript.project_timeline_status.v1',
          timeline_namespaces: [
            { id: 'prod_ep01', entity_kind: 'production', title: '第 1 集', path: 'productions/prod_ep01/production.json' },
            { id: 'prod_ep10', entity_kind: 'production', title: '第 10 集', path: 'productions/prod_ep10/production.json' },
          ],
        },
        contentUnitSummaries: [
          { content_unit_id: 'cu_ep01_voice', title: 'EP01 voice', path: 'productions/prod_ep01/content_units/cu_ep01_voice/content_unit.json' },
          { content_unit_id: 'cu_ep10_voice', title: 'EP10 voice', path: 'productions/prod_ep10/content_units/cu_ep10_voice/content_unit.json' },
        ],
      },
    },
  })

  const summary = snapshot.data?.status_summary as Record<string, unknown>
  const productions = summary.productions as Array<Record<string, unknown>>
  assert.deepEqual(productions.map((item) => item.production_id), ['prod_ep01', 'prod_ep10'])
  assert.deepEqual((productions[0].content_units as Array<Record<string, unknown>>).map((item) => item.content_unit_id), ['cu_ep01_voice'])
  assert.deepEqual((productions[1].content_units as Array<Record<string, unknown>>).map((item) => item.content_unit_id), ['cu_ep10_voice'])
})
