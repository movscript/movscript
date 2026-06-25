import assert from 'node:assert/strict'
import test from 'node:test'

import { attachmentToResource, stripAttachmentPreviewUrl } from './agentAttachments'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

test('stripAttachmentPreviewUrl removes transient preview and model data URLs', () => {
  const stripped = stripAttachmentPreviewUrl({
    id: 'att_1',
    name: 'shot.png',
    type: 'image',
    mimeType: 'image/png',
    size: 12,
    previewUrl: 'blob:local-preview',
    dataUrl: 'data:image/png;base64,AAAA',
    resourceId: 42,
  } satisfies AgentAttachment)

  assert.equal(stripped.previewUrl, undefined)
  assert.equal(stripped.dataUrl, undefined)
  assert.equal(stripped.resourceId, 42)
})

test('attachmentToResource exposes persisted agent video attachments to shared media viewer', () => {
  const resource = attachmentToResource({
    id: 'att_1',
    name: 'reference.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    size: 2048,
    resourceId: 42,
  } satisfies AgentAttachment)

  assert.deepEqual(resource, {
    ID: 42,
    owner_id: 0,
    type: 'video',
    name: 'reference.mp4',
    url: '/api/v1/resources/42/file',
    size: 2048,
    mime_type: 'video/mp4',
  })
})

test('attachmentToResource prefers transient preview URLs while uploads are still local', () => {
  const resource = attachmentToResource({
    id: 'upload_1',
    name: 'local.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    size: 12,
    url: '/api/v1/resources/7/file',
    previewUrl: 'blob:local-preview',
    resourceId: 7,
  } satisfies AgentAttachment)

  assert.equal(resource?.url, 'blob:local-preview')
})

test('attachmentToResource returns null when an attachment has no retrievable media URL', () => {
  const resource = attachmentToResource({
    id: 'att_1',
    name: 'missing.bin',
    type: 'file',
    mimeType: 'application/octet-stream',
    size: 0,
  } satisfies AgentAttachment)

  assert.equal(resource, null)
})
