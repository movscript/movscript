import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('agent attachment previews route chat cards through the shared media preview component', () => {
  const source = readFileSync(resolve('src/features/agent/components/AgentMessageContent.tsx'), 'utf8')

  assert.match(source, /import \{ AgentAttachmentIcon, AgentAttachmentMediaPreview \}/)
  assert.match(source, /const resource = attachmentToResource\(attachment\)/)
  assert.match(source, /<AgentAttachmentMediaPreview[\s\S]*attachment=\{attachment\}[\s\S]*variant=\{compact \? 'compact' : 'inline'\}/)
})

test('agent composer and mention previews use the shared media preview component', () => {
  const source = readFileSync(resolve('src/features/agent/components/AgentMentionEditor.tsx'), 'utf8')

  assert.match(source, /import \{ AgentAttachmentMediaPreview \}/)
  assert.match(source, /<AgentAttachmentMediaPreview attachment=\{attachment\} variant="chip" \/>/)
  assert.doesNotMatch(source, /AuthedVideo/)
  assert.doesNotMatch(source, /AuthedImage/)
})

test('agent attachment media preview centralizes MediaViewer usage', () => {
  const source = readFileSync(resolve('src/features/agent/components/AgentAttachmentMediaPreview.tsx'), 'utf8')

  assert.match(source, /export type AgentAttachmentMediaPreviewVariant = 'chip' \| 'compact' \| 'inline' \| 'result'/)
  assert.match(source, /import \{ MediaViewer \} from '@movscript\/resource-surface\/resource-media-viewer'/)
  assert.match(source, /import \{ GenerationOutputPreview \}/)
  assert.match(source, /lightbox=\{false\}/)
  assert.match(source, /variant === 'inline' && attachment\.type === 'video'/)
  assert.match(source, /variant === 'result'/)
  assert.doesNotMatch(source, /AuthedVideo/)
})

test('generated result previews use the shared media preview component', () => {
  const source = readFileSync(resolve('src/features/agent/components/GeneratedResultCard.tsx'), 'utf8')

  assert.match(source, /import \{ AgentAttachmentIcon, AgentAttachmentMediaPreview \}/)
  assert.match(source, /const resource = attachmentToResource\(attachment\)/)
  assert.match(source, /<AgentAttachmentMediaPreview attachment=\{attachment\} variant="result" thumbnailMaxSize=\{480\} \/>/)
  assert.match(source, /<AgentAttachmentIcon type=\{attachment\.type\} size=\{12\} \/>/)
  assert.doesNotMatch(source, /function AttachmentIcon/)
  assert.doesNotMatch(source, /AuthedVideo/)
  assert.doesNotMatch(source, /AuthedImage/)
})
