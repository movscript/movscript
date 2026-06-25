import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import test from 'node:test'

test('editing preview styles are owned by the preview component', () => {
  const pageStyles = readFileSync(resolve('src/pages/editing/EditingWorkspacePage.css'), 'utf8')
  const previewSource = readFileSync(resolve('src/features/editing/components/EditingPreviewPlayer.tsx'), 'utf8')
  const previewStyles = readFileSync(resolve('src/features/editing/components/EditingPreviewPlayer.css'), 'utf8')

  assert.match(previewSource, /import '\.\/EditingPreviewPlayer\.css'/)
  assert.match(previewStyles, /\.editing-workspace-preview-player/)
  assert.match(previewStyles, /\.editing-workspace-preview-media-frame/)
  assert.doesNotMatch(pageStyles, /\.editing-workspace-preview-player/)
  assert.doesNotMatch(pageStyles, /\.editing-workspace-preview-media-frame/)
  assert.match(pageStyles, /\.editing-workspace-resize-handle/)
})
