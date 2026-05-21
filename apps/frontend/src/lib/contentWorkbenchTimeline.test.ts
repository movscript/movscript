import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContentWorkbenchTimelineBoundaries,
  buildTrackTimeTicks,
  contentUnitTimelineKindRank,
  contentWorkbenchLocalTimelineSec,
  contentWorkbenchTimelineOriginSec,
  contentWorkbenchTimelineSnapStep,
  formatTrackClock,
  formatTrackTimeRange,
  pickPreviewTimelineItemForUnit,
  reorderContentWorkbenchUnits,
  snapContentWorkbenchTimelineStartSec,
  trackTimelinePx,
  trackTimelineWidthPx,
} from './contentWorkbenchTimeline.ts'

test('content workbench timeline formats track time labels', () => {
  assert.equal(formatTrackClock(65), '1:05')
  assert.equal(formatTrackTimeRange(5, 12, 7), '0:05-0:12')
  assert.equal(formatTrackTimeRange(5, 12, 0), '未设')
  assert.deepEqual(buildTrackTimeTicks(12, 36).map((tick) => tick.label), ['0:00', '0:02', '0:04', '0:06', '0:08', '0:10', '0:12'])
})

test('content workbench timeline maps seconds to stable pixels', () => {
  assert.equal(trackTimelinePx(2.4, 10), 24)
  assert.equal(trackTimelineWidthPx(0, 10), 18)
  assert.equal(trackTimelineWidthPx(3, 10), 30)
  assert.equal(contentWorkbenchTimelineOriginSec([{ startSec: 12.34 }, { startSec: 9.96 }]), 10)
  assert.equal(contentWorkbenchLocalTimelineSec(12.34, 10), 2.3)
})

test('content workbench timeline builds visual hierarchy boundaries', () => {
  const boundaries = buildContentWorkbenchTimelineBoundaries([
    { id: '1', startSec: 0, sceneMomentTitle: '雨夜', segmentTitle: '铺垫' },
    { id: '2', startSec: 4, sceneMomentTitle: '雨夜', segmentTitle: '推进' },
    { id: '3', startSec: 8, sceneMomentTitle: '天台', segmentTitle: '推进' },
  ], 0, 10)

  assert.deepEqual(boundaries, [
    { key: '2-segment', label: '情绪段：推进', leftPx: 40 },
    { key: '3-scene', label: '情节：天台', leftPx: 80 },
  ])
})

test('content workbench timeline snaps dragged starts to grid or neighboring units', () => {
  const items = [
    { id: '1', startSec: 0, endSec: 4 },
    { id: '2', startSec: 8, endSec: 12 },
  ]

  assert.equal(contentWorkbenchTimelineSnapStep(60), 0.5)
  assert.equal(contentWorkbenchTimelineSnapStep(20), 1)
  assert.equal(contentWorkbenchTimelineSnapStep(6), 5)
  assert.equal(contentWorkbenchTimelineSnapStep(2), 10)
  assert.equal(snapContentWorkbenchTimelineStartSec(7.8, 20, items, 1), 8)
  assert.equal(snapContentWorkbenchTimelineStartSec(5.2, 20, items, 1), 5)
})

test('content workbench timeline ranks units and timeline items deterministically', () => {
  assert.equal(contentUnitTimelineKindRank('shot'), 0)
  assert.equal(contentUnitTimelineKindRank('subtitle'), 5)
  assert.equal(contentUnitTimelineKindRank('unknown'), 20)

  assert.deepEqual(
    reorderContentWorkbenchUnits([
      { ID: 2, order: 2 },
      { ID: 1, order: 1 },
      { ID: 3, order: 3 },
    ], 3, 1, 'after').map((unit) => unit.ID),
    [1, 3, 2],
  )

  const picked = pickPreviewTimelineItemForUnit([
    { ID: 1, content_unit_id: 9, start_sec: 5, status: 'draft', order: 1 },
    { ID: 2, content_unit_id: 9, start_sec: 8, status: 'confirmed', order: 2 },
    { ID: 3, content_unit_id: 10, start_sec: 1, status: 'confirmed', order: 3 },
  ], 9)

  assert.equal(picked?.ID, 2)
})
