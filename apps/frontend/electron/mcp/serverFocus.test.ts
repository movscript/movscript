import assert from 'node:assert/strict'
import test from 'node:test'
import { getMCPFocusSnapshot, updateMCPContextSnapshot } from './server'

test('MCP focus omits workspaceId from route search while preserving page focus params', () => {
  updateMCPContextSnapshot({
    route: {
      pathname: '/project/pre-production',
      search: '?view=review&workspaceId=workspace_mpfwa1ow_tx4g65&asset_slot_id=88',
      hash: '',
    },
    project: {
      id: 2,
      name: '漫剧1',
      status: 'planning',
      description: '',
    },
    user: null,
    selection: null,
    updatedAt: '2026-05-21T19:54:16.793Z',
  })

  const snapshot = getMCPFocusSnapshot()

  assert.equal(snapshot.route.pathname, '/project/pre-production')
  assert.equal(snapshot.route.search, '?view=review&asset_slot_id=88')
  assert.equal(snapshot.project?.id, 2)
})

test('MCP focus returns an empty search when workspaceId is the only route query param', () => {
  updateMCPContextSnapshot({
    route: {
      pathname: '/project/pre-production',
      search: '?workspaceId=workspace_mpfwa1ow_tx4g65',
      hash: '',
    },
    project: null,
    user: null,
    selection: null,
    updatedAt: '2026-05-21T19:54:16.793Z',
  })

  assert.equal(getMCPFocusSnapshot().route.search, '')
})
