import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('generation input attachment preview placement is owned by a shared helper', () => {
  const genInputCardSource = readFileSync(resolve('src/shared/ui/GenInputCard.tsx'), 'utf8')
  const genInputAttachmentsSource = readFileSync(resolve('src/shared/ui/GenInputAttachments.tsx'), 'utf8')
  const placementSource = readFileSync(resolve('src/shared/ui/genInputAttachmentPreviewPlacement.ts'), 'utf8')

  assert.match(placementSource, /export function genInputAttachmentPreviewPositionFromElement/)
  assert.match(placementSource, /export function genInputAttachmentPreviewStyleFromPosition/)
  assert.match(genInputCardSource, /from '@\/shared\/ui\/GenInputAttachments'/)
  assert.match(genInputAttachmentsSource, /genInputAttachmentPreviewPositionFromElement\(tagRef\.current\)/)
  assert.match(genInputAttachmentsSource, /genInputAttachmentPreviewStyleFromPosition\(previewPos\)/)
  assert.doesNotMatch(genInputAttachmentsSource, /style=\{previewPos\}/)
  assert.doesNotMatch(genInputCardSource + genInputAttachmentsSource, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(genInputCardSource + genInputAttachmentsSource, /window\.innerWidth/)
  assert.doesNotMatch(genInputCardSource + genInputAttachmentsSource, /window\.innerHeight/)
})
