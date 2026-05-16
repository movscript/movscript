import assert from 'node:assert/strict'
import test from 'node:test'

import { buildContentWorkbenchRouteSearch, pickContentWorkbenchRowIdForDeepLink } from './contentWorkbenchRoute'

test('content workbench route search links back to selected scene moment', () => {
  assert.equal(buildContentWorkbenchRouteSearch({ sceneMomentId: 402 }), '?scene_moment_id=402')
})

test('content workbench route search includes selected unit and review context', () => {
  assert.equal(buildContentWorkbenchRouteSearch({
    sceneMomentId: 402,
    contentUnitId: 801,
    draftId: 'draft-1',
    view: 'review',
  }), '?scene_moment_id=402&content_unit_id=801&draftId=draft-1&view=review')
})

test('content workbench route search omits empty values', () => {
  assert.equal(buildContentWorkbenchRouteSearch({
    sceneMomentId: 0,
    contentUnitId: null,
    draftId: '',
  }), '')
})

test('content workbench deep link can locate a row from a content unit id', () => {
  assert.equal(pickContentWorkbenchRowIdForDeepLink([
    { id: 'moment-1', moment: { ID: 1 }, units: [{ ID: 101 }] },
    { id: 'moment-2', moment: { ID: 2 }, units: [{ ID: 202 }] },
  ], { contentUnitId: 202 }), 'moment-2')
})

test('content workbench deep link prefers an explicit scene moment id', () => {
  assert.equal(pickContentWorkbenchRowIdForDeepLink([
    { id: 'moment-1', moment: { ID: 1 }, units: [{ ID: 202 }] },
    { id: 'moment-2', moment: { ID: 2 }, units: [{ ID: 303 }] },
  ], { sceneMomentId: 2, contentUnitId: 202 }), 'moment-2')
})
