import assert from 'node:assert/strict'
import test from 'node:test'

import { ROUTES } from '@/routes/projectRoutes'
import { electronMCPContextRouteFocus } from './ElectronMCPContextBridge'

test('electron MCP context route focus preserves non-production timeline scope', () => {
  const focus = electronMCPContextRouteFocus({
    pathname: ROUTES.project.scripts,
    search: '?scopeKind=episode&scopeRef=episode_01',
    projectId: 42,
  })

  assert.equal(focus.productionId, null)
  assert.deepEqual(focus.domainFocus, {
    projectId: '42',
    scope: { category: 'timeline_namespace', kind: 'episode', ref: 'episode_01', field: 'scopeRef' },
    target: { targetCategory: 'timeline_assembly', targetKind: 'timeline_assembly', targetRef: 'timeline_assembly:episode:episode_01' },
    diagnostics: [],
  })
})

test('electron MCP context route focus projects production scope as legacy production id', () => {
  const focus = electronMCPContextRouteFocus({
    pathname: ROUTES.project.scripts,
    search: '?scopeKind=production&scopeRef=pilot',
    projectId: 42,
  })

  assert.equal(focus.productionId, 'pilot')
  assert.equal(focus.domainFocus?.scope?.kind, 'production')
  assert.equal(focus.domainFocus?.scope?.ref, 'pilot')
})
