import assert from 'node:assert/strict'
import test from 'node:test'

import { agentChatThreadItemFromAppServerThreadTurnItem } from '@/shared/infrastructure/app-server/appServerThreadTurnItemItems'

test('app-server image generation items expose bare base64 results as renderable data URLs', () => {
  const item = agentChatThreadItemFromAppServerThreadTurnItem({
    type: 'imageGeneration',
    id: 'ig_1',
    status: 'generating',
    revisedPrompt: 'clear kitten photo',
    result: 'iVBORw0KGgoAAAANSUhEUgAAAAE=',
    savedPath: '/tmp/generated_images/ig_1.png',
  }, { lifecycle: 'completed' })

  assert.equal(item.type, 'imageGeneration')
  assert.equal(item.status, 'completed')
  assert.equal(item.result, 'iVBORw0KGgoAAAANSUhEUgAAAAE=')
  assert.equal(item.url, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=')
  assert.equal(item.savedPath, '/tmp/generated_images/ig_1.png')
})

test('app-server image generation items fall back to savedPath previews when result is empty', () => {
  const item = agentChatThreadItemFromAppServerThreadTurnItem({
    type: 'imageGeneration',
    id: 'ig_2',
    status: 'completed',
    revisedPrompt: null,
    result: '',
    savedPath: '/tmp/generated_images/ig_2.png',
  })

  assert.equal(item.type, 'imageGeneration')
  assert.equal(item.url, 'file:///tmp/generated_images/ig_2.png')
})

test('app-server dynamic tool image outputs prefer resource references when resource ids are present', () => {
  const item = agentChatThreadItemFromAppServerThreadTurnItem({
    type: 'dynamicToolCall',
    id: 'tool_1',
    namespace: null,
    tool: 'image_annotation',
    arguments: {},
    status: 'completed',
    success: true,
    durationMs: 41,
    contentItems: [
      { type: 'inputText', text: '图片标注已完成，输出资源 #202。' },
      {
        type: 'inputImage',
        imageUrl: 'data:image/png;base64,SHOULD_NOT_BE_USED_FOR_PREVIEW',
        outputResourceId: 202,
        name: 'annotated-frame.png',
        mimeType: 'image/png',
      },
      {
        type: 'resource',
        resource: {
          resourceId: 203,
          name: 'annotation-thumbnail.webp',
          mimeType: 'image/webp',
        },
      },
    ],
  } as any)

  assert.equal(item.type, 'dynamicToolCall')
  assert.deepEqual(item.contentItems, [
    { type: 'inputText', text: '图片标注已完成，输出资源 #202。' },
    {
      type: 'resource',
      resource: {
        uri: 'resource:202',
        url: '/api/v1/resources/202/file',
        name: 'annotated-frame.png',
        mimeType: 'image/png',
      },
    },
    {
      type: 'resource',
      resource: {
        uri: 'resource:203',
        url: '/api/v1/resources/203/file',
        name: 'annotation-thumbnail.webp',
        mimeType: 'image/webp',
      },
    },
  ])
})
