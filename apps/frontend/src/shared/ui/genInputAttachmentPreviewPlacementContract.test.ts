import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('generation input attachment preview placement is owned by a shared helper', () => {
  const genInputCardSource = readFileSync(resolve('src/shared/ui/GenInputCard.tsx'), 'utf8')
  const placementSource = readFileSync(resolve('src/shared/ui/genInputAttachmentPreviewPlacement.ts'), 'utf8')

  assert.match(placementSource, /export function genInputAttachmentPreviewPositionFromElement/)
  assert.match(placementSource, /export function genInputAttachmentPreviewStyleFromPosition/)
  assert.match(genInputCardSource, /genInputAttachmentPreviewPositionFromElement\(tagRef\.current\)/)
  assert.match(genInputCardSource, /genInputAttachmentPreviewStyleFromPosition\(previewPos\)/)
  assert.doesNotMatch(genInputCardSource, /style=\{previewPos\}/)
  assert.doesNotMatch(genInputCardSource, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(genInputCardSource, /window\.innerWidth/)
  assert.doesNotMatch(genInputCardSource, /window\.innerHeight/)
})
