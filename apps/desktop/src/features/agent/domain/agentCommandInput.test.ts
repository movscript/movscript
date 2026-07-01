import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCommandFirstClientInput, buildPageContext } from './agentCommandInput'

test('agent command input carries normalized scope focus from route search', () => {
  const input = buildCommandFirstClientInput({
    message: '继续做这一集',
    hints: {
      projectId: 42,
      route: {
        pathname: '/project/scripts/workbench',
        search: '?scopeKind=episode&scopeRef=episode_01',
      },
    },
  })

  assert.deepEqual(input.uiSnapshot?.domainFocus, {
    projectId: '42',
    scope: { category: 'timeline_namespace', kind: 'episode', ref: 'episode_01', field: 'scopeRef' },
    diagnostics: [],
  })
  assert.equal(input.uiSnapshot?.pageContext?.pageEntityType, 'timeline_namespace')
  assert.equal(input.uiSnapshot?.pageContext?.pageEntityId, 'episode:episode_01')
})

test('agent page context prefers explicit selection over domain focus', () => {
  const context = buildPageContext({
    projectId: 42,
    route: {
      pathname: '/project/content/preview',
      search: '?scopeKind=episode&scopeRef=episode_01',
    },
    domainFocus: {
      projectId: '42',
      scope: { category: 'timeline_namespace', kind: 'episode', ref: 'episode_01' },
      diagnostics: [],
    },
    selection: { entityType: 'content_unit', entityId: 801 },
  })

  assert.equal(context?.pageEntityType, 'content_unit')
  assert.equal(context?.pageEntityId, 801)
})
