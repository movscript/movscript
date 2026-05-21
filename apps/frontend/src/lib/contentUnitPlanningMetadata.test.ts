import assert from 'node:assert/strict'
import test from 'node:test'

import {
  contentUnitGenerationCanvasDescription,
  contentUnitStoryboardBriefPromptText,
  contentUnitVisualPlanPromptText,
  mergeMetadataJSON,
  metadataListFromText,
  parseMetadataJSON,
  textListFromMetadata,
} from './contentUnitPlanningMetadata'

test('content unit planning metadata parses and merges safely', () => {
  assert.deepEqual(parseMetadataJSON(''), {})
  assert.deepEqual(parseMetadataJSON('{bad'), {})
  assert.deepEqual(mergeMetadataJSON('{"keep":true}', { visual_plan: { space: '巷口' } }), {
    keep: true,
    visual_plan: { space: '巷口' },
  })
})

test('content unit planning metadata normalizes text lists', () => {
  assert.equal(textListFromMetadata(['  首帧 ', '', '尾帧']), '首帧\n尾帧')
  assert.deepEqual(metadataListFromText('首帧\n\n尾帧  '), ['首帧', '尾帧'])
})

test('content unit planning metadata builds reusable prompt summaries', () => {
  const unit = {
    ID: 12,
    title: '纸条特写',
    description: '纸条从伞骨滑出。',
    metadata_json: JSON.stringify({
      visual_plan: {
        space: '旧伞占据前景。',
        blocking: '林夏停住。',
        beats: ['纸条滑出', '落入水洼'],
      },
      storyboard_brief: {
        purpose: '确认纸条是剧情证据。',
        composition: '俯拍纸条和伞骨。',
        keyframe_suggestions: ['首帧：伞骨夹缝', '尾帧：纸条落地'],
      },
    }),
  }

  assert.match(contentUnitVisualPlanPromptText(unit), /空间关系：旧伞占据前景。/)
  assert.match(contentUnitVisualPlanPromptText(unit), /停点\/节奏：纸条滑出；落入水洼/)
  assert.match(contentUnitStoryboardBriefPromptText(unit), /画面目的：确认纸条是剧情证据。/)
  assert.match(contentUnitGenerationCanvasDescription(unit), /内容单元：纸条特写/)
  assert.match(contentUnitGenerationCanvasDescription(unit), /故事板简述：/)
})
