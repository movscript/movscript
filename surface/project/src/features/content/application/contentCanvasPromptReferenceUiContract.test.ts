import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('content canvas inline prompt references expose type role and source identity', () => {
  const source = readFileSync(resolve(__dirname, '../components/ContentCanvasPromptReferences.tsx'), 'utf8')
  const styles = readFileSync(resolve(__dirname, '../components/ContentCanvasWorkspacePage.inspector-prompt.css'), 'utf8')

  assert.match(source, /generationReferenceMediaTypeShortLabel/)
  assert.match(source, /promptReferenceInlineRoleLabel/)
  assert.match(source, /promptReferenceMediaLabel/)
  assert.match(source, /part\.reference\.title/)
  assert.match(source, /function promptReferenceSourceLabel/)
  assert.match(source, /if \(kind === 'resource'\) return '资源'/)
  assert.match(source, /if \(kind === 'keyframe'\) return '关键帧'/)
  assert.match(source, /if \(kind === 'storyboard'\) return '故事版'/)
  assert.match(source, /if \(kind === 'asset'\) return '资源'/)
  assert.match(source, /function contentUnitTypeShortLabel/)
  assert.match(source, /function defaultReferenceRoleForReference/)
  assert.doesNotMatch(source, /<strong>\$\{escapeHtml\(part\.reference\.title\)\}<\/strong>/)
  assert.doesNotMatch(source, /if \(reference\.state === 'selected'\) return '已选'/)
  assert.doesNotMatch(source, /return 'Asset'/)
  assert.doesNotMatch(source, /<em>\{reference\.sourceLabel\}<\/em>/)
  assert.match(source, /<small>\{promptReferenceMediaLabel\(reference\.previewMediaType \?\? reference\.selectedMediaType \?\? reference\.mediaType\)\}<\/small>/)
  assert.match(source, /<b>\{promptReferenceInlineRoleLabel\(reference\)\}<\/b>/)

  assert.match(styles, /content-canvas-prompt-inline-reference__body/)
  assert.match(styles, /content-canvas-prompt-inline-reference__meta/)
  assert.match(styles, /max-width: min\(100%, 238px\)/)
  assert.match(styles, /data-role="first_frame"/)
  assert.match(styles, /data-role="last_frame"/)
})

test('content canvas candidate prompt preview keeps compiled resource chips compact and semantic', () => {
  const source = readFileSync(resolve(__dirname, '../components/ContentCanvasInspectorParts.tsx'), 'utf8')
  const styles = readFileSync(resolve(__dirname, '../components/ContentCanvasWorkspacePage.inspector-candidates.css'), 'utf8')

  assert.match(source, /parseResourceMentions\(text\)/)
  assert.match(source, /generationReferenceMediaTypeLabel\(part\.mediaType\)/)
  assert.match(source, /generationReferenceRoleLabel\(part\.role\) \|\| '参考'/)
  assert.match(source, /GenerationReferenceAssetSummary/)
  assert.match(source, /<small>\{`Resource \$\{String\(part\.resourceId\)\}`\}<\/small>/)
  assert.doesNotMatch(source, /ResourceFileImage resourceId=\{part\.resourceId\}/)

  assert.match(styles, /content-canvas-generation-candidate-resource-token__type/)
  assert.match(styles, /content-canvas-generation-candidate-reference-summary/)
  assert.match(styles, /min-height: 22px/)
  assert.match(styles, /vertical-align: -0\.18em/)
  assert.match(styles, /data-role="first_frame"/)
  assert.match(styles, /data-role="reference_video"/)
})

test('generation surfaces expose a model parameter preview summary below controls', () => {
  const inputSource = readFileSync(resolve(__dirname, '../../../../../../apps/desktop/src/shared/ui/GenInputCard.tsx'), 'utf8')
  const candidateSource = readFileSync(resolve(__dirname, '../components/ContentCanvasInspectorParts.tsx'), 'utf8')
  const promptCanvasSource = readFileSync(resolve(__dirname, '../components/ContentPromptCanvasPanel.tsx'), 'utf8')
  const workflowSource = readFileSync(resolve(__dirname, '../../../../../../surface/canvas/src/features/ui/canvasGenerationNodes.tsx'), 'utf8')
  const uiSource = readFileSync(resolve(__dirname, '../../../../../../packages/ui/src/components/business/generation/input/params/index.tsx'), 'utf8')

  assert.match(uiSource, /GenerationParamPreview/)
  assert.match(inputSource, /<GenerationParamPreview items=\{paramPreviewItems\}/)
  assert.match(candidateSource, /<GenerationParamPreview items=\{parameterPreviewItems\}/)
  assert.match(promptCanvasSource, /<GenerationParamPreview items=\{parameterPreviewItems\}/)
  assert.match(workflowSource, /<GenerationParamPreview items=\{parameterPreviewItems\}/)
})
