import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentChatCollabAgentToolCallView,
  agentChatCommandExecutionView,
  agentChatDynamicToolOutputView,
  agentChatFileChangeView,
  agentChatImageItemView,
  agentChatMcpToolPendingSummary,
  agentChatMcpToolResultView,
  agentChatToolCallView,
  agentChatWebSearchView,
} from '@/features/agent/domain/agentChatToolResultViews'

test('agent chat dynamic tool output view extracts text images and media resources', () => {
  const view = agentChatDynamicToolOutputView([
    'Plain dynamic output\nwith body',
    { type: 'inputText', text: 'Rendered preview\nwith extra detail' },
    { type: 'output_text', text: 'Responses text output\nwith body' },
    { type: 'inputImage', imageUrl: 'image://preview/1' },
    { type: 'inputImage', imageUrl: 'https://cdn.example.com/tool-output.png' },
    { type: 'inputAudio', data: 'AAAA', mimeType: 'audio/wav' },
    { type: 'inputVideo', videoUrl: 'https://cdn.example.com/tool-output.mp4', mimeType: 'video/mp4' },
    { type: 'resource', resource: { uri: 'movscript://resource/99', mimeType: 'video/mp4', blob: 'BBBB' } },
    { type: 'resource', resource: { uri: 'movscript://resource/100', direct_url: 'https://cdn.example.com/resource-image.png', mimeType: 'image/png' } },
    { type: 'resource', resource: { uri: 'file:///repo/output.txt', mimeType: 'text/plain', text: 'Generated file contents\nsecond line' } },
  ])

  assert.deepEqual(view.summary, [
    '1. Plain dynamic output',
    '2. Text: Rendered preview',
    '3. Text: Responses text output',
    '4. Image: image://preview/1',
    '5. Image: https://cdn.example.com/tool-output.png',
    '6. Audio: inline audio/wav data',
    '7. Video: https://cdn.example.com/tool-output.mp4',
    '8. Resource: movscript://resource/99 video/mp4 blob',
  ])
  assert.deepEqual(view.texts, [
    { key: 'dynamic-output-text:0', label: 'Output text 1', value: 'Plain dynamic output\nwith body' },
    { key: 'dynamic-output-text:1', label: 'Output text 2', value: 'Rendered preview\nwith extra detail' },
    { key: 'dynamic-output-text:2', label: 'Output text 3', value: 'Responses text output\nwith body' },
    { key: 'dynamic-output-resource-text:9', label: 'Output resource text 10', value: 'Generated file contents\nsecond line' },
  ])
  assert.deepEqual(view.images, [
    { url: 'image://preview/1', alt: 'Tool output image 4' },
    { url: 'https://cdn.example.com/tool-output.png', alt: 'Tool output image 5' },
    { url: 'https://cdn.example.com/resource-image.png', alt: 'Tool output image 9' },
  ])
  assert.deepEqual(view.mediaPreviews, [
    { url: 'data:audio/wav;base64,AAAA', kind: 'audio', label: 'Tool output audio 6', mimeType: 'audio/wav' },
    { url: 'https://cdn.example.com/tool-output.mp4', kind: 'video', label: 'Tool output video 7', mimeType: 'video/mp4' },
    { url: 'data:video/mp4;base64,BBBB', kind: 'video', label: 'Tool output video resource 8', mimeType: 'video/mp4' },
  ])
  assert.deepEqual(view.media, [
    '6. Audio: inline audio/wav data',
    '7. Video: https://cdn.example.com/tool-output.mp4',
    '8. Resource: movscript://resource/99 video/mp4 blob',
    '9. Resource: movscript://resource/100 image/png',
    '10. Resource: file:///repo/output.txt text/plain text',
  ])
})

test('agent chat MCP tool result view extracts content and structured payloads', () => {
  const view = agentChatMcpToolResultView({
    content: [
      'Plain MCP output\nwith body',
      { type: 'text', text: 'File contents\nsecond line' },
      { type: 'image', url: 'https://cdn.example.com/mcp-result.png' },
      { type: 'resource', uri: 'file:///repo/README.md' },
      { type: 'image', blob: 'AAAA', mimeType: 'image/jpeg' },
      { type: 'image', image_url: 'https://cdn.example.com/mcp-snake-image.png' },
      { type: 'audio', audio_url: 'https://cdn.example.com/mcp-result.wav', mimeType: 'audio/wav' },
      { type: 'video', video_url: 'https://cdn.example.com/mcp-result.mp4', mimeType: 'video/mp4' },
      { type: 'resource', resource: { uri: 'resource:42', direct_url: 'https://cdn.example.com/resource-video.mp4', mimeType: 'video/mp4' } },
      { type: 'resource', resource: { uri: 'resource:43', directUrl: 'https://cdn.example.com/resource-image.png', mimeType: 'image/png' } },
      { type: 'resource', resource: { uri: 'file:///repo/README.md', mimeType: 'text/markdown', text: 'Readme resource text\nsecond line' } },
      { type: 'resource', resource: { uri: 'resource:44', mimeType: 'audio/wav', data: 'CCCC' } },
    ],
    structuredContent: { bytes: 128 },
  })

  assert.ok(view)
  assert.deepEqual(view.summary, [
    '1. Plain MCP output',
    '2. Text: File contents',
    '3. Image: https://cdn.example.com/mcp-result.png',
    '4. Resource: file:///repo/README.md',
    '5. Image: inline image/jpeg data',
    '6. Image: https://cdn.example.com/mcp-snake-image.png',
    '7. Audio: https://cdn.example.com/mcp-result.wav',
    '8. Video: https://cdn.example.com/mcp-result.mp4',
  ])
  assert.deepEqual(view.texts, [
    { key: 'mcp-result-text:0', label: 'Content text 1', value: 'Plain MCP output\nwith body' },
    { key: 'mcp-result-text:1', label: 'Content text 2', value: 'File contents\nsecond line' },
    { key: 'mcp-result-resource-text:10', label: 'Content resource text 11', value: 'Readme resource text\nsecond line' },
  ])
  assert.deepEqual(view.images, [
    { url: 'https://cdn.example.com/mcp-result.png', alt: 'MCP result image 3' },
    { url: 'data:image/jpeg;base64,AAAA', alt: 'MCP result image 5' },
    { url: 'https://cdn.example.com/mcp-snake-image.png', alt: 'MCP result image 6' },
    { url: 'https://cdn.example.com/resource-image.png', alt: 'MCP result image 10' },
  ])
  assert.deepEqual(view.mediaPreviews, [
    { url: 'https://cdn.example.com/mcp-result.wav', kind: 'audio', label: 'MCP result audio 7', mimeType: 'audio/wav' },
    { url: 'https://cdn.example.com/mcp-result.mp4', kind: 'video', label: 'MCP result video 8', mimeType: 'video/mp4' },
    { url: 'https://cdn.example.com/resource-video.mp4', kind: 'video', label: 'MCP result video resource 9', mimeType: 'video/mp4' },
    { url: 'data:audio/wav;base64,CCCC', kind: 'audio', label: 'MCP result audio resource 12', mimeType: 'audio/wav' },
  ])
  assert.deepEqual(view.media, [
    '4. Resource: file:///repo/README.md',
    '7. Audio: https://cdn.example.com/mcp-result.wav',
    '8. Video: https://cdn.example.com/mcp-result.mp4',
    '9. Resource: resource:42 video/mp4',
    '10. Resource: resource:43 image/png',
    '11. Resource: file:///repo/README.md text/markdown text',
    '12. Resource: resource:44 audio/wav blob',
  ])
  assert.deepEqual(view.structuredContent, { bytes: 128 })
})

test('agent chat MCP pending summary only appears for unresolved in-progress calls', () => {
  assert.deepEqual(agentChatMcpToolPendingSummary({
    type: 'mcpToolCall',
    id: 'call_1',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    result: null,
    error: null,
  }), ['waiting for MCP approval request or tool result'])
  assert.deepEqual(agentChatMcpToolPendingSummary({
    type: 'mcpToolCall',
    id: 'call_1',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    progressMessages: ['running'],
    result: null,
    error: null,
  }), [])
})

test('agent chat command execution view builds title meta tone and terminal summaries', () => {
  const view = agentChatCommandExecutionView({
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'pnpm test',
    status: 'failed',
    source: 'codex',
    cwd: '/repo',
    processId: 'proc_1',
    durationMs: 120,
    exitCode: 2,
    aggregatedOutput: 'failed',
    commandActions: [
      { type: 'read', name: 'package', path: 'package.json', command: 'cat package.json' },
      { type: 'search', query: 'agentChat', path: 'src', command: 'rg agentChat src' },
    ],
    terminalInteractions: [
      { processId: 'proc_1', stdin: 'y\nconfirm\n', raw: { sequence: 1 } },
    ],
    raw: { provider: 'codex', type: 'commandExecution' },
  })

  assert.equal(view.title, 'pnpm test')
  assert.deepEqual(view.meta, ['failed', 'codex', '/repo', 'process proc_1', '120ms', 'exit 2'])
  assert.equal(view.tone, 'diagnostic')
  assert.deepEqual(view.actions, [
    'Read name=package path=package.json command=cat package.json',
    'Search query=agentChat path=src command=rg agentChat src',
  ])
  assert.deepEqual(view.terminalInput, ['proc_1: y'])
  assert.deepEqual(view.terminalInputDetails, [{ processId: 'proc_1', stdin: 'y\nconfirm\n', raw: { sequence: 1 } }])
  assert.equal(view.output, 'failed')
  assert.deepEqual(view.rawDetails, { provider: 'codex', type: 'commandExecution' })
})

test('agent chat tool call view builds provider-neutral metadata and pending state', () => {
  const mcpView = agentChatToolCallView({
    type: 'mcpToolCall',
    id: 'call_1',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    arguments: { resource: 'focus' },
    pluginId: 'movscript@movscript-bundled',
    roundLabel: 'Tool round',
    roundIndex: 3,
    roundId: 'round_3',
    mcpAppResourceUri: 'mcp://resource/1',
    result: null,
    error: null,
    raw: { provider: 'agent-runtime' },
  })

  assert.equal(mcpView.title, 'movscript_workspace/movscript_focus_get')
  assert.deepEqual(mcpView.meta, ['inProgress', 'movscript@movscript-bundled', 'Tool round', 'round 3', 'round id round_3', undefined, undefined, 'mcp://resource/1'])
  assert.equal(mcpView.tone, 'process')
  assert.deepEqual(mcpView.argumentsDetails, { resource: 'focus' })
  assert.deepEqual(mcpView.mcpPending, ['waiting for MCP approval request or tool result'])
  assert.deepEqual(mcpView.rawDetails, { provider: 'agent-runtime' })
  assert.equal(mcpView.dynamicOutput, null)

  const dynamicView = agentChatToolCallView({
    type: 'dynamicToolCall',
    id: 'dyn_1',
    tool: 'shell',
    namespace: 'codex',
    status: 'completed',
    success: true,
    sandboxed: true,
    durationMs: 5,
    arguments: { command: 'echo done' },
    contentItems: [{ type: 'text', text: 'done' }],
    result: { ok: true },
    raw: { provider: 'codex' },
  })

  assert.equal(dynamicView.title, 'shell')
  assert.deepEqual(dynamicView.meta, ['completed', 'codex', undefined, undefined, undefined, 'sandboxed', '5ms', undefined])
  assert.equal(dynamicView.tone, 'result')
  assert.deepEqual(dynamicView.argumentsDetails, { command: 'echo done' })
  assert.deepEqual(dynamicView.dynamicOutput?.summary, ['1. Text: done'])
  assert.deepEqual(dynamicView.dynamicOutputDetails, [{ type: 'text', text: 'done' }])
  assert.deepEqual(dynamicView.dynamicResult, { ok: true })
  assert.deepEqual(dynamicView.rawDetails, { provider: 'codex' })

  const progressMcpView = agentChatToolCallView({
    type: 'mcpToolCall',
    id: 'call_2',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'inProgress',
    progressMessages: ['approval requested'],
    result: { content: [{ type: 'text', text: 'approved' }] },
    error: null,
  })

  assert.deepEqual(progressMcpView.mcpProgress, ['approval requested'])
  assert.deepEqual(progressMcpView.mcpPending, [])
  assert.deepEqual(progressMcpView.mcpResultDetails, { content: [{ type: 'text', text: 'approved' }] })

  const failedDynamicView = agentChatToolCallView({
    type: 'dynamicToolCall',
    id: 'dyn_2',
    tool: 'shell',
    namespace: null,
    status: 'failed',
    error: { message: 'failed' },
  })

  assert.deepEqual(failedDynamicView.dynamicError, { message: 'failed' })

  const failedMcpView = agentChatToolCallView({
    type: 'mcpToolCall',
    id: 'call_3',
    server: 'movscript_workspace',
    tool: 'movscript_focus_get',
    status: 'failed',
    result: null,
    error: { message: 'denied' },
  })

  assert.deepEqual(failedMcpView.mcpError, { message: 'denied' })
  assert.equal(failedMcpView.tone, 'diagnostic')
  for (const status of ['cancelled', 'rejected', 'denied'] as const) {
    const view = agentChatToolCallView({
      type: 'mcpToolCall',
      id: `call_${status}`,
      server: 'movscript_workspace',
      tool: 'movscript_focus_get',
      status,
      result: null,
      error: null,
    })

    assert.equal(view.tone, 'diagnostic')
    assert.equal(view.meta[0], status)
  }
})

test('agent chat file change view summarizes patches and details', () => {
  const view = agentChatFileChangeView({
    type: 'fileChange',
    id: 'file_1',
    status: 'completed',
    changes: [
      {
        kind: { type: 'modify' },
        path: 'src/app.ts',
        patch: '--- a/src/app.ts\n+++ b/src/app.ts\n-old\n+new\n+next',
      },
      'raw text patch',
    ],
    raw: { provider: 'codex', type: 'fileChange' },
  })

  assert.deepEqual(view.meta, ['completed', '2 change(s)'])
  assert.equal(view.tone, 'result')
  assert.deepEqual(view.summary, [
    '1. modify src/app.ts (+2 -1)',
    '2. raw text patch',
  ])
  assert.deepEqual(view.patches.map((patch) => [patch.label, patch.value]), [
    ['Patch src/app.ts', '--- a/src/app.ts\n+++ b/src/app.ts\n-old\n+new\n+next'],
    ['Patch 2', 'raw text patch'],
  ])
  assert.match(view.details ?? '', /src\/app\.ts/)
  assert.deepEqual(view.rawDetails, { provider: 'codex', type: 'fileChange' })
})

test('agent chat collab web search and image item views keep summaries out of renderers', () => {
  const collabView = agentChatCollabAgentToolCallView({
    type: 'collabAgentToolCall',
    id: 'collab_1',
    tool: 'spawnAgent',
    status: 'inProgress',
    prompt: 'Inspect',
    senderThreadId: 'thread_parent',
    receiverThreadIds: ['thread_child'],
    agentsStates: {
      thread_child: { status: 'running', message: 'reading files' },
    },
    model: 'gpt-5',
    reasoningEffort: 'medium',
    raw: { provider: 'codex', type: 'collabAgentToolCall' },
  })
  assert.equal(collabView.title, 'Spawn agent')
  assert.deepEqual(collabView.meta, ['inProgress', 'gpt-5', 'medium', '1 receiver(s)'])
  assert.equal(collabView.prompt, 'Inspect')
  assert.deepEqual(collabView.threads, ['sender: thread_parent', 'receiver 1: thread_child'])
  assert.deepEqual(collabView.agentStates, ['thread_child: running - reading files'])
  assert.deepEqual(collabView.rawDetails, { provider: 'codex', type: 'collabAgentToolCall' })

  const webView = agentChatWebSearchView({
    type: 'webSearch',
    id: 'web_1',
    query: 'codex protocol',
    action: { type: 'find_in_page', url: 'https://example.com', pattern: 'protocol' },
    raw: { provider: 'codex', type: 'webSearch' },
  })
  assert.deepEqual(webView.meta, ['findInPage'])
  assert.equal(webView.query, 'codex protocol')
  assert.deepEqual(webView.actionSummary, ['Page: https://example.com', 'Find: protocol'])
  assert.deepEqual(webView.actionDetails, { type: 'find_in_page', url: 'https://example.com', pattern: 'protocol' })
  assert.deepEqual(webView.rawDetails, { provider: 'codex', type: 'webSearch' })

  const imageView = agentChatImageItemView({
    type: 'imageGeneration',
    id: 'img_1',
    revisedPrompt: 'clear diagram',
    result: 'https://cdn.example.com/generated.png',
    status: 'completed',
    savedPath: '/tmp/generated.png',
    raw: { provider: 'codex', type: 'imageGeneration' },
  })
  assert.equal(imageView.title, 'Image generation')
  assert.deepEqual(imageView.meta, ['completed', 'saved'])
  assert.equal(imageView.tone, 'result')
  assert.equal(imageView.revisedPrompt, 'clear diagram')
  assert.equal(imageView.result, 'https://cdn.example.com/generated.png')
  assert.equal(imageView.savedPath, '/tmp/generated.png')
  assert.deepEqual(imageView.generatedImages, [{ url: 'https://cdn.example.com/generated.png', alt: 'Generated image result' }])
  assert.deepEqual(imageView.rawDetails, { provider: 'codex', type: 'imageGeneration' })

  const viewedImage = agentChatImageItemView({
    type: 'imageView',
    id: 'view_1',
    path: '/repo/frame.png',
    url: 'file:///repo/frame.png',
  })
  assert.equal(viewedImage.path, '/repo/frame.png')
  assert.deepEqual(viewedImage.viewedImages, [{ url: 'file:///repo/frame.png', alt: 'Viewed image' }])
})
