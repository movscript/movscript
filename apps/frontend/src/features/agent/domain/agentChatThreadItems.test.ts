import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentChatInputFromAttachment,
  agentChatInputsFromTextAndAttachments,
} from '@/features/agent/domain/agentChatThreadItems'

test('agent chat input conversion sends images as native image inputs', () => {
  const input = agentChatInputFromAttachment({
    id: 'att_image',
    name: 'Frame',
    type: 'image',
    mimeType: 'image/png',
    resourceId: 7,
    url: 'https://cdn.example.com/frame.png',
  })

  assert.deepEqual(input, {
    type: 'image',
    url: 'https://cdn.example.com/frame.png',
    detail: 'auto',
    name: 'Frame',
    mimeType: 'image/png',
    resourceId: 7,
  })
})

test('agent chat input conversion sends video resources as resource mentions', () => {
  const input = agentChatInputFromAttachment({
    id: 'att_video',
    name: 'Storyboard cut',
    type: 'video',
    mimeType: 'video/mp4',
    resourceId: 42,
    url: 'https://cdn.example.com/cut.mp4',
  })

  assert.deepEqual(input, {
    type: 'mention',
    name: 'Storyboard cut',
    path: 'resource:42',
    kind: 'video',
    mimeType: 'video/mp4',
    url: 'https://cdn.example.com/cut.mp4',
  })
})

test('agent chat input conversion preserves external media URLs on mentions', () => {
  const input = agentChatInputFromAttachment({
    id: 'att_external_video',
    name: 'External cut',
    type: 'video',
    mimeType: 'video/mp4',
    url: 'https://cdn.example.com/external.mp4',
  })

  assert.deepEqual(input, {
    type: 'mention',
    name: 'External cut',
    path: 'att_external_video',
    kind: 'video',
    mimeType: 'video/mp4',
    url: 'https://cdn.example.com/external.mp4',
  })
})

test('agent chat input conversion accepts direct URL attachment aliases', () => {
  assert.deepEqual(agentChatInputFromAttachment({
    id: 'att_direct_image',
    name: 'Direct frame',
    type: 'image',
    mime_type: 'image/png',
    direct_url: 'https://cdn.example.com/direct-frame.png',
  }), {
    type: 'image',
    url: 'https://cdn.example.com/direct-frame.png',
    detail: 'auto',
    name: 'Direct frame',
    mimeType: 'image/png',
  })

  assert.deepEqual(agentChatInputFromAttachment({
    id: 'att_direct_video',
    name: 'Direct cut',
    type: 'video',
    mime_type: 'video/mp4',
    resource_id: '42',
    directUrl: 'https://cdn.example.com/direct-cut.mp4',
  }), {
    type: 'mention',
    name: 'Direct cut',
    path: 'resource:42',
    kind: 'video',
    mimeType: 'video/mp4',
    url: 'https://cdn.example.com/direct-cut.mp4',
  })
})

test('agent chat input conversion prefers inline and preview URLs over direct aliases', () => {
  assert.deepEqual(agentChatInputFromAttachment({
    id: 'att_preview',
    type: 'image',
    mime_type: 'image/png',
    data_url: 'data:image/png;base64,AAAA',
    preview_url: 'blob:preview',
    direct_url: 'https://cdn.example.com/full.png',
  }), {
    type: 'image',
    url: 'data:image/png;base64,AAAA',
    detail: 'auto',
    name: 'att_preview',
    mimeType: 'image/png',
  })
})

test('agent chat input conversion only treats positive integer resource ids as resources', () => {
  assert.deepEqual(agentChatInputFromAttachment({
    id: 'att_image_zero',
    name: 'Frame',
    type: 'image',
    mimeType: 'image/png',
    resourceId: 0,
    url: 'https://cdn.example.com/frame.png',
  }), {
    type: 'image',
    url: 'https://cdn.example.com/frame.png',
    detail: 'auto',
    name: 'Frame',
    mimeType: 'image/png',
  })
  assert.deepEqual(agentChatInputFromAttachment({
    id: 'att_video_decimal',
    name: 'External cut',
    type: 'video',
    mimeType: 'video/mp4',
    resourceId: 1.5,
    url: 'https://cdn.example.com/external.mp4',
  }), {
    type: 'mention',
    name: 'External cut',
    path: 'att_video_decimal',
    kind: 'video',
    mimeType: 'video/mp4',
    url: 'https://cdn.example.com/external.mp4',
  })
})

test('agent chat input conversion combines text with image and video attachments', () => {
  const inputs = agentChatInputsFromTextAndAttachments('Review these', [
    { id: 'image_1', type: 'image', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA' },
    { id: 'video_1', name: 'Cut', type: 'video', mimeType: 'video/mp4', resourceId: 9 },
  ])

  assert.equal(inputs[0]?.type, 'text')
  assert.equal(inputs[1]?.type, 'image')
  assert.deepEqual(inputs[2], { type: 'mention', name: 'Cut', path: 'resource:9', kind: 'video', mimeType: 'video/mp4' })
})
