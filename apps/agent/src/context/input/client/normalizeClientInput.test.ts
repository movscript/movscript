import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRuntimeUserMessage, normalizeClientInput } from './normalizeClientInput.js'

test('normalizeClientInput rejects non-plain top-level input records', () => {
  class RuntimeInput {
    message = 'hello'
  }

  assert.equal(normalizeClientInput(new RuntimeInput()), undefined)
})

test('normalizeClientInput drops non-plain nested attachment and ui snapshot records', () => {
  class AttachmentRef {
    id = 'att_1'
    name = 'Sketch'
  }
  class RouteSnapshot {
    pathname = '/projects/1'
  }

  const normalized = normalizeClientInput({
    message: 'inspect',
    attachments: [
      new AttachmentRef(),
      { id: 'att_2', name: 'Shot', mime_type: 'image/png', resource_id: 7 },
    ],
    uiSnapshot: {
      route: new RouteSnapshot(),
      pageContext: { pageKey: 'draft', draftId: 'draft_1' },
      selection: new Map([['entityType', 'draft']]),
      recentResources: [
        new AttachmentRef(),
        { ID: 7, name: 'Shot', type: 'image', mime_type: 'image/png' },
      ],
    },
  })

  assert.equal(normalized?.visibleMessage, 'inspect')
  assert.deepEqual(normalized?.attachments, [{ id: 'att_2', name: 'Shot', mimeType: 'image/png', resourceId: 7 }])
  assert.equal(normalized?.uiSnapshot?.route, undefined)
  assert.deepEqual(normalized?.uiSnapshot?.pageContext, { pageKey: 'draft', draftId: 'draft_1' })
  assert.equal(normalized?.uiSnapshot?.selection, undefined)
  assert.deepEqual(normalized?.uiSnapshot?.recentResources, [{ id: 7, name: 'Shot', type: 'image', mimeType: 'image/png' }])
})

test('normalizeClientInput drops invalid ui project and production ids', () => {
  for (const invalidId of [0, 42.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const normalized = normalizeClientInput({
      message: 'inspect',
      uiSnapshot: {
        project: { id: invalidId, name: 'Invalid project' },
        productionId: invalidId,
      },
    })

    assert.equal(normalized?.uiSnapshot?.project?.id, undefined)
    assert.equal(normalized?.uiSnapshot?.project?.name, 'Invalid project')
    assert.equal(normalized?.uiSnapshot?.productionId, undefined)
  }
})

test('normalizeClientInput preserves project standards fields from ui snapshot', () => {
  const normalized = normalizeClientInput({
    message: 'inspect standards',
    uiSnapshot: {
      project: {
        id: 42,
        name: 'Demo',
        aspect_ratio: '9:16',
        visual_style: '竖屏写实',
        project_style: '{"custom_rules":[]}',
      },
    },
  })

  assert.deepEqual(normalized?.uiSnapshot?.project, {
    id: 42,
    name: 'Demo',
    aspect_ratio: '9:16',
    visual_style: '竖屏写实',
    project_style: '{"custom_rules":[]}',
  })
})

test('normalizeClientInput drops invalid numeric entity reference ids', () => {
  const normalized = normalizeClientInput({
    message: 'inspect entity refs',
    uiSnapshot: {
      pageContext: {
        pageKey: 'project',
        pageEntityType: 'project',
        pageEntityId: 42.5,
      },
      selection: {
        entityType: 'production',
        entityId: 0,
        label: 'Invalid production',
      },
    },
  })

  assert.deepEqual(normalized?.uiSnapshot?.pageContext, {
    pageKey: 'project',
    pageEntityType: 'project',
  })
  assert.deepEqual(normalized?.uiSnapshot?.selection, {
    entityType: 'production',
    label: 'Invalid production',
  })
})

test('normalizeClientInput drops invalid attachment and resource ids', () => {
  const normalized = normalizeClientInput({
    message: 'inspect resources',
    attachments: [
      { name: 'Zero resource', resourceId: 0 },
      { name: 'Fractional resource', resource_id: 7.5 },
      { name: 'Valid resource', resource_id: 8 },
    ],
    uiSnapshot: {
      recentResources: [
        { id: 0, name: 'Zero', type: 'image' },
        { ID: Number.POSITIVE_INFINITY, name: 'Infinite', type: 'image' },
        { ID: 9, name: 'Valid', type: 'image' },
      ],
    },
  })

  assert.deepEqual(normalized?.attachments, [
    { name: 'Zero resource' },
    { name: 'Fractional resource' },
    { name: 'Valid resource', resourceId: 8 },
  ])
  assert.deepEqual(normalized?.uiSnapshot?.recentResources, [{ id: 9, name: 'Valid', type: 'image' }])
})

test('buildRuntimeUserMessage includes sanitized attachment references only', () => {
  const normalized = normalizeClientInput({
    visibleMessage: '  review  ',
    attachments: [{ id: 'att_1', name: 'Board', type: 'image', size: 10 }],
  })

  assert.ok(normalized)
  assert.equal(
    buildRuntimeUserMessage(normalized),
    [
      'review',
      '',
      '[用户附件引用]',
      '1. Board (image, unknown, 10 bytes, id=att_1)',
      '图片附件会在 runtime 上下文中先尝试本地预处理；优化后的 data_url 会优先传给支持 vision 的模型，预处理不可用或失败时会回退发送原始 data_url；没有 data_url 时只保留附件元数据或 resource_id。',
      '视频附件不会作为视频 payload 发送给模型；如需理解画面内容，调用 core_video_extract_frames 按 resource_id 本地抽帧，抽出的帧会作为图片输入传给模型。',
    ].join('\n'),
  )
})

test('buildRuntimeUserMessage marks video attachments as metadata-only with extraction guidance', () => {
  const normalized = normalizeClientInput({
    visibleMessage: '看看这个视频',
    attachments: [{ id: 'att_v', name: 'clip.mp4', type: 'video', mimeType: 'video/mp4', size: 200, resourceId: 99 }],
  })

  assert.ok(normalized)
  const message = buildRuntimeUserMessage(normalized)
  assert.match(message, /video_payload=metadata_only/)
  assert.match(message, /core_video_extract_frames/)
  assert.doesNotMatch(message, /data:image/)
})

test('normalizeClientInput preserves standard image data URLs', () => {
  const normalized = normalizeClientInput({
    message: 'review',
    attachments: [
      { id: 'att_1', name: 'Board', type: 'image', dataUrl: 'data:image/png;base64,AAAA' },
      { id: 'att_2', name: 'Bad', type: 'image', dataUrl: 'https://example.com/not-data-url.png' },
    ],
  })

  assert.deepEqual(normalized?.attachments, [
    { id: 'att_1', name: 'Board', type: 'image', dataUrl: 'data:image/png;base64,AAAA' },
    { id: 'att_2', name: 'Bad', type: 'image' },
  ])
})
