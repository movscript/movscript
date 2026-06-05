import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentChatAgentMessageView,
  agentChatHookPromptView,
  agentChatUserMessageView,
} from '@/features/agent/domain/agentChatMessageViews'

test('agent chat user message view extracts text attachments and media previews', () => {
  const view = agentChatUserMessageView({
    type: 'userMessage',
    id: 'user_1',
    clientId: 'client_1',
    content: [
      {
        type: 'text',
        text: 'Review this frame',
        textElements: [
          {
            type: 'mention',
            placeholder: '@scene',
            path: 'src/scene.ts',
            byteRange: { start: 4, end: 10 },
          },
        ],
      },
      { type: 'image', url: 'https://cdn.example.com/frame.png', detail: 'auto', name: 'Frame', mimeType: 'image/png', resourceId: 7 },
      { type: 'localImage', path: '/tmp/local-frame.png', url: 'file:///tmp/local-frame.png', detail: 'high' },
      { type: 'mention', name: 'Reference', path: 'resource:11', kind: 'image', mimeType: 'image/png', url: 'https://cdn.example.com/reference.png' },
      { type: 'mention', name: 'Cut 12', path: 'resource:12', kind: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/cut.mp4' },
      { type: 'mention', name: 'Voiceover', path: 'resource:13', mimeType: 'audio/wav', url: 'https://cdn.example.com/voice.wav' },
      { type: 'mention', name: 'Inline frame', path: 'data:image/png;base64,AAAA', kind: 'image', mimeType: 'image/png', url: 'data:image/png;base64,AAAA' },
      { type: 'mention', name: 'Blob cut', path: 'blob:codex-cut', kind: 'video', mimeType: 'video/mp4', url: 'blob:codex-cut' },
      { type: 'mention', name: 'Resource audio', path: '/api/v1/resources/44/file', kind: 'audio', mimeType: 'audio/wav', url: '/api/v1/resources/44/file' },
      { type: 'skill', name: 'storyboard', path: '/skills/storyboard' },
      { type: 'mention', name: 'Source file', path: 'src/source.ts' },
    ],
    raw: { provider: 'codex' },
  })

  assert.equal(view.text, 'Review this frame')
  assert.deepEqual(view.textElementSummary, [
    'Input 1.1 / placeholder: @scene / type: mention / path: src/scene.ts / bytes: 4-10',
  ])
  assert.deepEqual(view.textElementDetails, [{
    inputIndex: 0,
    textElements: [{
      type: 'mention',
      placeholder: '@scene',
      path: 'src/scene.ts',
      byteRange: { start: 4, end: 10 },
    }],
  }])
  assert.deepEqual(view.imageAttachments, [
    { url: 'https://cdn.example.com/frame.png', alt: 'Image attachment 1 (resource, auto)' },
    { url: 'file:///tmp/local-frame.png', alt: 'Image attachment 2 (local, high)' },
    { url: 'https://cdn.example.com/reference.png', alt: 'Image attachment 3 (resource)' },
    { url: 'data:image/png;base64,AAAA', alt: 'Image attachment 4 (resource)' },
  ])
  assert.deepEqual(view.mediaAttachments, [
    { url: 'https://cdn.example.com/cut.mp4', kind: 'video', label: 'Video attachment 5', mimeType: 'video/mp4' },
    { url: 'https://cdn.example.com/voice.wav', kind: 'audio', label: 'Audio attachment 6', mimeType: 'audio/wav' },
    { url: 'blob:codex-cut', kind: 'video', label: 'Video attachment 8', mimeType: 'video/mp4' },
    { url: '/api/v1/resources/44/file', kind: 'audio', label: 'Audio attachment 9', mimeType: 'audio/wav' },
  ])
  assert.deepEqual(view.attachmentLabels, [
    'Image resource Frame resource:7 image/png https://cdn.example.com/frame.png',
    'Local image high /tmp/local-frame.png',
    'Image resource Reference resource:11',
    'Video resource Cut 12 resource:12',
    'Audio resource Voiceover resource:13',
    'Image attachment Inline frame data:image/png;base64,AAAA',
    'Video attachment Blob cut blob:codex-cut',
    'Audio attachment Resource audio /api/v1/resources/44/file',
    'Skill storyboard /skills/storyboard',
    'Mention Source file src/source.ts',
  ])
  assert.equal(view.attachments.length, 10)
  assert.deepEqual(view.rawDetails, { provider: 'codex' })
})

test('agent chat hook prompt view summarizes fragments and hook runs', () => {
  const view = agentChatHookPromptView({
    type: 'hookPrompt',
    id: 'hook_1',
    fragments: [
      { text: 'Check formatting', hookRunId: 'hook_run_1' },
      { text: 'Check safety', hookRunId: 'hook_run_2' },
      { text: '', hookRunId: '' },
    ],
    raw: { provider: 'codex', type: 'hookPrompt' },
  })

  assert.equal(view.text, 'Check formatting\n\nCheck safety')
  assert.deepEqual(view.hookRunIds, ['hook_run_1', 'hook_run_2'])
  assert.deepEqual(view.meta, ['2 fragment(s)'])
  assert.deepEqual(view.rawDetails, { provider: 'codex', type: 'hookPrompt' })
})

test('agent chat agent message view summarizes phase and memory citations', () => {
  const view = agentChatAgentMessageView({
    type: 'agentMessage',
    id: 'agent_1',
    text: 'Done',
    phase: 'final_answer',
    memoryCitation: {
      entries: [
        { path: 'src/app.ts', lineStart: 4, lineEnd: 9, note: 'Relevant state' },
        { note: 'No path note' },
      ],
      threadIds: ['thread_1', '', 42, 'thread_2'],
    },
    raw: { provider: 'codex', type: 'agentMessage' },
  })

  assert.equal(view.text, 'Done')
  assert.equal(view.phaseLabel, 'final answer')
  assert.equal(view.hasMemoryCitation, true)
  assert.deepEqual(view.memoryCitationSummary, [
    '1.src/app.ts:4-9 - Relevant state',
    '2.memory - No path note',
    'Thread: thread_1',
    'Thread: thread_2',
  ])
  assert.deepEqual(view.memoryCitationDetails, {
    entries: [
      { path: 'src/app.ts', lineStart: 4, lineEnd: 9, note: 'Relevant state' },
      { note: 'No path note' },
    ],
    threadIds: ['thread_1', '', 42, 'thread_2'],
  })
  assert.deepEqual(view.rawDetails, { provider: 'codex', type: 'agentMessage' })
})
