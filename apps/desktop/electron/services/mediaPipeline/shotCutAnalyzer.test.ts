import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMediaPipelineEvenShotSegments,
  buildMediaPipelineSceneShotSegments,
  parseMediaPipelineSceneDetectTimes,
} from './shotCutAnalyzer'

test('parseMediaPipelineSceneDetectTimes extracts unique sorted pts times from ffmpeg showinfo output', () => {
  const output = [
    '[Parsed_showinfo_1 @ 0x1] n:   0 pts: 1536 pts_time:1.5 pos: 100',
    '[Parsed_showinfo_1 @ 0x1] n:   1 pts: 4096 pts_time:4.0 pos: 200',
    '[Parsed_showinfo_1 @ 0x1] n:   2 pts: 1536 pts_time:1.5 pos: 300',
  ].join('\n')

  assert.deepEqual(parseMediaPipelineSceneDetectTimes(output), [1.5, 4])
})

test('buildMediaPipelineSceneShotSegments uses detected boundaries and enforces max shot duration', () => {
  assert.deepEqual(
    buildMediaPipelineSceneShotSegments(20, [2, 3, 14.4], {
      minShotDurationSec: 2.5,
      maxShotDurationSec: 8,
    }),
    [
      { startSec: 0, endSec: 3 },
      { startSec: 3, endSec: 11 },
      { startSec: 11, endSec: 14.4 },
      { startSec: 14.4, endSec: 20 },
    ],
  )
})

test('buildMediaPipelineEvenShotSegments falls back to roughly six-second ranges without capping shot count', () => {
  assert.deepEqual(
    buildMediaPipelineEvenShotSegments(31),
    [
      { startSec: 0, endSec: 5.2 },
      { startSec: 5.2, endSec: 10.3 },
      { startSec: 10.3, endSec: 15.5 },
      { startSec: 15.5, endSec: 20.7 },
      { startSec: 20.7, endSec: 25.8 },
      { startSec: 25.8, endSec: 31 },
    ],
  )
})
