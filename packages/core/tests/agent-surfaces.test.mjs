import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createPreviewTimelineSurface,
  createProjectStatusSurface,
} from '../dist/agent/index.js'

const surfaceArgs = {
  frontendOrigin: 'http://surface.test',
  mcpBaseURL: 'http://mcp.test',
}

test('preview timeline surface carries normalized timeline scope without inventing production id', () => {
  const surface = createPreviewTimelineSurface(surfaceArgs, {
    projectId: 'project-a',
    scopeKind: 'episode',
    scopeRef: 'ep01',
  })
  const url = new URL(surface.url)

  assert.equal(surface.title, 'Timeline preview episode ep01')
  assert.equal(surface.entity?.production_id, undefined)
  assert.equal(surface.entity?.timeline_scope_kind, 'episode')
  assert.equal(surface.entity?.timeline_scope_ref, 'ep01')
  assert.equal(surface.entity?.timeline_assembly_ref, undefined)
  assert.equal(surface.entity?.domain_focus?.target, undefined)
  assert.equal(surface.entity?.domain_focus?.scope?.kind, 'episode')
  assert.equal(url.searchParams.get('productionId'), null)
  assert.equal(url.searchParams.get('scopeKind'), 'episode')
  assert.equal(url.searchParams.get('scopeRef'), 'ep01')
  assert.equal(url.searchParams.get('targetKind'), null)
  assert.equal(url.searchParams.get('targetRef'), null)
})

test('project status surface keeps production id as timeline scope projection', () => {
  const surface = createProjectStatusSurface(surfaceArgs, {
    projectId: 'project-a',
    productionId: 'pilot',
  })
  const url = new URL(surface.url)

  assert.equal(surface.entity?.production_id, 'pilot')
  assert.equal(surface.entity?.timeline_scope_kind, 'production')
  assert.equal(surface.entity?.timeline_assembly_ref, undefined)
  assert.equal(surface.entity?.domain_focus?.target, undefined)
  assert.equal(url.searchParams.get('productionId'), 'pilot')
  assert.equal(url.searchParams.get('scopeKind'), 'production')
  assert.equal(url.searchParams.get('scopeRef'), 'pilot')
  assert.equal(url.searchParams.get('targetKind'), null)
  assert.equal(url.searchParams.get('targetRef'), null)
})
