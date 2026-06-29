import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentChatThreadItem } from '@movscript/agent-chat'
import { AgentChatImagePreviewGrid, AgentChatMediaPreviewGrid } from '@/features/agent/components/agent-chat-items/AgentChatThreadItemBlocks'
import { AgentChatThreadItemView } from '@/features/agent/components/agent-chat-items/AgentChatThreadItemView'

test('AgentChatThreadItemView switches over every neutral item type', () => {
  const itemProtocol = readFileSync(resolve('../../packages/agent-chat/src/chat/agentChatThreadItems.ts'), 'utf8')
  const itemView = readFileSync(resolve('src/features/agent/components/agent-chat-items/AgentChatThreadItemView.tsx'), 'utf8')
  const itemTypeAlias = itemProtocol.match(/export type AgentChatThreadItem =([\s\S]*?)\n\nexport function agentChatTextInput/)
  assert.ok(itemTypeAlias)
  const neutralTypes = Array.from(itemTypeAlias[1].matchAll(/type: '([^']+)'/g), (match) => match[1]).sort()
  const switchCases = Array.from(itemView.matchAll(/case '([^']+)'/g), (match) => match[1]).sort()

  assert.deepEqual(switchCases, neutralTypes)
})

test('AgentChatThreadItemView renders every neutral item type fixture', () => {
  for (const [type, item] of Object.entries(agentChatThreadItemFixtures())) {
    const html = renderToStaticMarkup(<AgentChatThreadItemView item={item} />)
    assert.notEqual(html.trim(), '', `${type} should render non-empty markup`)
  }
})

test('AgentChatThreadItemView renders user message structured inputs separately', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'userMessage',
        id: 'user_1',
        clientId: 'client_1',
        content: [
          {
            type: 'text',
            text: 'Inspect this asset',
            textElements: [
              { type: 'mention', path: 'src/a.ts' },
              { placeholder: '@project', byteRange: { start: 8, end: 15 } },
            ],
          },
          { type: 'image', url: 'https://cdn.example.com/frame.png', detail: 'auto', name: 'Frame', mimeType: 'image/png', resourceId: 7 },
          { type: 'localImage', path: '/repo/image.png', detail: 'high', url: 'file:///repo/image.png' },
          { type: 'mention', name: 'Reference 11', path: 'resource:11', kind: 'image', mimeType: 'image/png', url: 'https://cdn.example.com/reference.png' },
          { type: 'mention', name: 'Cut 12', path: 'resource:12', kind: 'video', mimeType: 'video/mp4', url: 'https://cdn.example.com/cut.mp4' },
          { type: 'mention', name: 'Inline frame', path: 'data:image/png;base64,AAAA', kind: 'image', mimeType: 'image/png', url: 'data:image/png;base64,AAAA' },
          { type: 'mention', name: 'Blob cut', path: 'blob:codex-cut', kind: 'video', mimeType: 'video/mp4', url: 'blob:codex-cut' },
          { type: 'mention', name: 'Resource audio', path: '/api/v1/resources/44/file', kind: 'audio', mimeType: 'audio/wav', url: '/api/v1/resources/44/file' },
          { type: 'mention', name: 'Source file', path: 'src/source.ts' },
          { type: 'skill', name: 'reviewer', path: '/skills/reviewer' },
        ],
        raw: { type: 'userMessage', provider: 'codex', metadata: { client: 'composer' } },
      }}
    />,
  )

  assert.match(html, /Inspect this asset/)
  assert.match(html, /Text spans/)
  assert.match(html, /type: mention/)
  assert.match(html, /path: src\/a.ts/)
  assert.match(html, /placeholder: @project/)
  assert.match(html, /bytes: 8-15/)
  assert.match(html, /Inspect/)
  assert.match(html, /textElements/)
  assert.match(html, /<details[^>]*data-tone="neutral"/)
  assert.match(html, /Image attachments/)
  assert.match(html, /src="https:\/\/cdn.example.com\/frame.png"/)
  assert.match(html, /alt="Image attachment 1 \(resource, auto\)"/)
  assert.match(html, /src="file:\/\/\/repo\/image.png"/)
  assert.match(html, /alt="Image attachment 2 \(local, high\)"/)
  assert.match(html, /src="https:\/\/cdn.example.com\/reference.png"/)
  assert.match(html, /alt="Image attachment 3 \(resource\)"/)
  assert.match(html, /src="data:image\/png;base64,AAAA"/)
  assert.match(html, /alt="Image attachment 4 \(resource\)"/)
  assert.match(html, /Media attachments/)
  assert.match(html, /<video[^>]*src="https:\/\/cdn.example.com\/cut.mp4"/)
  assert.match(html, /aria-label="Video attachment 5"/)
  assert.match(html, /<video[^>]*src="blob:codex-cut"/)
  assert.match(html, /aria-label="Video attachment 7"/)
  assert.match(html, /<audio[^>]*src="\/api\/v1\/resources\/44\/file"/)
  assert.match(html, /aria-label="Audio attachment 8"/)
  assert.match(html, /Attachments/)
  assert.match(html, /Image resource Frame resource:7 image\/png https:\/\/cdn.example.com\/frame.png/)
  assert.match(html, /Local image high \/repo\/image.png/)
  assert.match(html, /Image resource Reference 11 resource:11/)
  assert.match(html, /Video resource Cut 12 resource:12/)
  assert.match(html, /Image attachment Inline frame data:image\/png;base64,AAAA/)
  assert.match(html, /Video attachment Blob cut blob:codex-cut/)
  assert.match(html, /Audio attachment Resource audio \/api\/v1\/resources\/44\/file/)
  assert.match(html, /Mention Source file src\/source.ts/)
  assert.match(html, /Skill reviewer \/skills\/reviewer/)
  assert.match(html, /attachments/)
  assert.doesNotMatch(html, /User message details/)
  assert.match(html, /composer/)
})

test('Agent chat media preview grids cap initial mounted media', () => {
  const imageHtml = renderToStaticMarkup(
    <AgentChatImagePreviewGrid
      label="Images"
      images={Array.from({ length: 8 }, (_, index) => ({
        url: `https://cdn.example.com/image-${index + 1}.png`,
        alt: `Image ${index + 1}`,
      }))}
    />,
  )
  assert.equal((imageHtml.match(/<img/g) ?? []).length, 6)
  assert.match(imageHtml, /Show 2 more/)
  assert.match(imageHtml, /loading="lazy"/)
  assert.match(imageHtml, /decoding="async"/)
  assert.doesNotMatch(imageHtml, /image-7\.png/)

  const mediaHtml = renderToStaticMarkup(
    <AgentChatMediaPreviewGrid
      label="Media"
      media={Array.from({ length: 8 }, (_, index) => ({
        url: `https://cdn.example.com/video-${index + 1}.mp4`,
        kind: 'video' as const,
        label: `Video ${index + 1}`,
      }))}
    />,
  )
  assert.equal((mediaHtml.match(/<video/g) ?? []).length, 6)
  assert.match(mediaHtml, /Show 2 more/)
  assert.doesNotMatch(mediaHtml, /video-7\.mp4/)
})

test('AgentChatThreadItemView renders command executions with structured output sections', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'commandExecution',
        id: 'cmd_1',
        command: 'pnpm test',
        cwd: '/repo',
        processId: 'proc_1',
        source: 'agent',
        status: 'completed',
        commandActions: [
          { type: 'read', command: 'cat README.md', name: 'README.md', path: '/repo/README.md' },
          { type: 'listFiles', command: 'ls src', path: 'src' },
          { type: 'search', command: 'rg AgentChat src', query: 'AgentChat', path: 'src' },
          { type: 'unknown', command: 'custom command' },
        ],
        terminalInteractions: [{ processId: 'proc_1', stdin: 'y\n', raw: { sequence: 1 } }],
        aggregatedOutput: 'ok\n',
        exitCode: 0,
        raw: { type: 'commandExecution', status: 'completed', sandbox: 'workspace-write' },
      }}
    />,
  )

  assert.match(html, /ms-agent-message-section--result/)
  assert.match(html, /pnpm test/)
  assert.match(html, /process proc_1/)
  assert.match(html, /Actions/)
  assert.match(html, /Read name=README.md path=\/repo\/README.md command=cat README.md/)
  assert.match(html, /List files path=src command=ls src/)
  assert.match(html, /Search query=AgentChat path=src command=rg AgentChat src/)
  assert.match(html, /unknown command=custom command/)
  assert.match(html, /Terminal input/)
  assert.match(html, /proc_1: y/)
  assert.match(html, /Inspect/)
  assert.match(html, /terminalInput/)
  assert.match(html, /sequence/)
  assert.match(html, /Output/)
  assert.match(html, /ok/)
  assert.doesNotMatch(html, /Command details/)
  assert.match(html, /sandbox/)
})

test('AgentChatThreadItemView renders agent memory citations as readable entries', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'agentMessage',
        id: 'agent_memory_1',
        text: 'Use the project note.',
        phase: 'final_answer',
        memoryCitation: {
          entries: [
            { path: 'notes/project.md', lineStart: 3, lineEnd: 7, note: 'Relevant project constraint' },
          ],
          threadIds: ['thread_memory_1'],
        },
        raw: { type: 'agentMessage', model: 'gpt-5', tokenUsage: { output: 42 } },
      }}
    />,
  )

  assert.match(html, /Use the project note/)
  assert.match(html, /final answer/)
  assert.match(html, /memory citation/)
  assert.match(html, /Memory citations/)
  assert.match(html, /notes\/project.md:3-7 - Relevant project constraint/)
  assert.match(html, /Thread: thread_memory_1/)
  assert.match(html, /Inspect/)
  assert.match(html, /memoryCitations/)
  assert.doesNotMatch(html, /Message details/)
  assert.match(html, /tokenUsage/)
})

test('AgentChatThreadItemView renders failed command executions diagnostically', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'commandExecution',
        id: 'cmd_fail',
        command: 'pnpm test',
        status: 'failed',
        aggregatedOutput: 'failed\n',
        exitCode: 1,
      }}
    />,
  )

  assert.match(html, /ms-agent-message-section--diagnostic/)
  assert.match(html, /exit 1/)
  assert.match(html, /failed/)
})

test('AgentChatThreadItemView renders tool calls with collapsed arguments and result/error sections', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'dynamicToolCall',
        id: 'tool_1',
        namespace: 'workspace',
        tool: 'write_file',
        status: 'completed',
        roundId: 'round_model',
        roundIndex: 1,
        roundLabel: 'Model turn 1',
        arguments: { path: 'a.ts' },
        contentItems: [
          { type: 'inputText', text: 'Rendered preview\nwith extra detail' },
          { type: 'output_text', text: 'Responses text output\nwith body' },
          { type: 'inputImage', imageUrl: 'image://preview/1' },
          { type: 'inputImage', imageUrl: 'https://cdn.example.com/tool-output.png' },
          { type: 'inputAudio', data: 'AAAA', mimeType: 'audio/wav' },
          { type: 'inputVideo', videoUrl: 'https://cdn.example.com/tool-output.mp4', mimeType: 'video/mp4' },
          { type: 'resource', resource: { uri: 'movscript://resource/99', mimeType: 'video/mp4', blob: 'BBBB' } },
          { type: 'resource', resource: { uri: 'file:///repo/output.txt', mimeType: 'text/plain', text: 'Generated file contents\nsecond line' } },
          'Plain dynamic output\nwith body',
        ],
        result: { ok: true },
        success: true,
        sandboxed: true,
        raw: { type: 'dynamicToolCall', callId: 'call_1', provider: 'codex' },
      }}
    />,
  )

  assert.match(html, /write_file/)
  assert.match(html, /Model turn 1/)
  assert.match(html, /round 1/)
  assert.match(html, /round id round_model/)
  assert.match(html, /sandboxed/)
  assert.match(html, /<details[^>]*data-tone="neutral"/)
  assert.match(html, /Arguments/)
  assert.match(html, /Output/)
  assert.match(html, /Text: Rendered preview/)
  assert.match(html, /Output text 1/)
  assert.match(html, /Text: Responses text output/)
  assert.match(html, /Output text 2/)
  assert.match(html, /Responses text output/)
  assert.match(html, /Output resource text 8/)
  assert.match(html, /Generated file contents/)
  assert.match(html, /Output text 9/)
  assert.match(html, /Plain dynamic output/)
  assert.match(html, /Image: image:\/\/preview\/1/)
  assert.match(html, /Output images/)
  assert.match(html, /src="https:\/\/cdn.example.com\/tool-output.png"/)
  assert.match(html, /alt="Tool output image 4"/)
  assert.match(html, /Output media previews/)
  assert.match(html, /<audio[^>]*src="data:audio\/wav;base64,AAAA"/)
  assert.match(html, /aria-label="Tool output audio 5"/)
  assert.match(html, /<video[^>]*src="https:\/\/cdn.example.com\/tool-output.mp4"/)
  assert.match(html, /aria-label="Tool output video 6"/)
  assert.match(html, /<video[^>]*src="data:video\/mp4;base64,BBBB"/)
  assert.match(html, /aria-label="Tool output video resource 7"/)
  assert.match(html, /Output media/)
  assert.match(html, /Audio: inline audio\/wav data/)
  assert.match(html, /Video: https:\/\/cdn.example.com\/tool-output.mp4/)
  assert.match(html, /Resource: movscript:\/\/resource\/99 video\/mp4 blob/)
  assert.match(html, /Resource: file:\/\/\/repo\/output\.txt text\/plain text/)
  assert.match(html, /Inspect/)
  assert.match(html, /dynamicOutput/)
  assert.match(html, /ms-agent-message-section--result/)
  assert.match(html, /Result/)
  assert.doesNotMatch(html, /Tool details/)
  assert.match(html, /call_1/)
})

test('AgentChatThreadItemView renders MCP tool result content and structured content separately', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'mcpToolCall',
        id: 'mcp_1',
        server: 'filesystem',
        tool: 'readFile',
        status: 'completed',
        roundId: 'round_mcp',
        roundIndex: 2,
        roundLabel: 'MCP turn 2',
        arguments: { path: 'README.md' },
        result: {
          content: [
            { type: 'text', text: 'File contents\nsecond line' },
            { type: 'image', url: 'https://cdn.example.com/mcp-result.png' },
            { type: 'resource', uri: 'file:///repo/README.md' },
            { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' },
            { type: 'audio', data: 'BBBB', mimeType: 'audio/mpeg' },
            { type: 'video', videoUrl: 'https://cdn.example.com/mcp-result.mp4', mimeType: 'video/mp4' },
            { type: 'resource', resource: { uri: 'movscript://resource/42', mimeType: 'video/mp4', blob: 'CCCC' } },
            { type: 'resource', resource: { uri: 'file:///repo/README.md', mimeType: 'text/markdown', text: 'Readme resource text\nsecond line' } },
            'Plain MCP output\nwith body',
          ],
          structuredContent: { bytes: 128 },
          _meta: { cached: true },
        },
      }}
    />,
  )

  assert.match(html, /filesystem\/readFile/)
  assert.match(html, /MCP turn 2/)
  assert.match(html, /round 2/)
  assert.match(html, /round id round_mcp/)
  assert.match(html, /Content/)
  assert.match(html, /Text: File contents/)
  assert.match(html, /Content text 1/)
  assert.match(html, /Content resource text 8/)
  assert.match(html, /Readme resource text/)
  assert.match(html, /Content text 9/)
  assert.match(html, /Plain MCP output/)
  assert.match(html, /Image: https:\/\/cdn.example.com\/mcp-result.png/)
  assert.match(html, /Content images/)
  assert.match(html, /src="https:\/\/cdn.example.com\/mcp-result.png"/)
  assert.match(html, /alt="MCP result image 2"/)
  assert.match(html, /Image: inline image\/jpeg data/)
  assert.match(html, /src="data:image\/jpeg;base64,AAAA"/)
  assert.match(html, /alt="MCP result image 4"/)
  assert.match(html, /Content media previews/)
  assert.match(html, /<audio[^>]*src="data:audio\/mpeg;base64,BBBB"/)
  assert.match(html, /aria-label="MCP result audio 5"/)
  assert.match(html, /<video[^>]*src="https:\/\/cdn.example.com\/mcp-result.mp4"/)
  assert.match(html, /aria-label="MCP result video 6"/)
  assert.match(html, /<video[^>]*src="data:video\/mp4;base64,CCCC"/)
  assert.match(html, /aria-label="MCP result video resource 7"/)
  assert.match(html, /Content media/)
  assert.match(html, /Audio: inline audio\/mpeg data/)
  assert.match(html, /Video: https:\/\/cdn.example.com\/mcp-result.mp4/)
  assert.match(html, /Resource: file:\/\/\/repo\/README\.md/)
  assert.match(html, /Resource: movscript:\/\/resource\/42 video\/mp4 blob/)
  assert.match(html, /Resource: file:\/\/\/repo\/README\.md text\/markdown text/)
  assert.match(html, /Structured content/)
  assert.match(html, /bytes/)
  assert.match(html, /Inspect/)
  assert.match(html, /mcpResult/)
  assert.match(html, /cached/)
})

test('AgentChatThreadItemView renders domain setting query as internal MovScript tool UI', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'mcpToolCall',
        id: 'settings_query_1',
        server: 'movscript_workspace',
        tool: 'domain_query_settings',
        status: 'completed',
        arguments: { query: '咖啡馆', kind: 'location', projectId: 7, limit: 3 },
        result: {
          settings: [
            { id: 'setting_cafe', title: '夜间咖啡馆', setting_kind: 'location', path: 'source/settings/setting_cafe/setting.json' },
            { id: 'setting_backroom', name: '后厨通道', kind: 'location' },
          ],
        },
        durationMs: 42,
        raw: { type: 'mcpToolCall', server: 'movscript_workspace', tool: 'domain_query_settings' },
      }}
    />,
  )

  assert.match(html, /查询设定/)
  assert.match(html, /completed/)
  assert.match(html, /location/)
  assert.match(html, /咖啡馆/)
  assert.match(html, /2 result\(s\)/)
  assert.match(html, /42ms/)
  assert.match(html, /Query/)
  assert.match(html, /query=咖啡馆/)
  assert.match(html, /projectId=7/)
  assert.match(html, /Results/)
  assert.match(html, /1\. 夜间咖啡馆 - location - source\/settings\/setting_cafe\/setting\.json/)
  assert.match(html, /2\. 后厨通道 - location/)
  assert.match(html, /Result details/)
  assert.doesNotMatch(html, /movscript_workspace\/domain_query_settings/)
  assert.doesNotMatch(html, /Arguments/)
})

test('AgentChatThreadItemView renders domain setting upsert as internal MovScript tool UI', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'mcpToolCall',
        id: 'settings_upsert_1',
        server: 'movscript_workspace',
        tool: 'domain_upsert_setting',
        status: 'completed',
        arguments: {
          projectId: 7,
          payload: { id: 'setting_cafe', title: '夜间咖啡馆', kind: 'location' },
        },
        result: {
          path: 'settings/setting_cafe/setting.json',
          entityKind: 'setting',
          record: {
            id: 'setting_cafe',
            title: '夜间咖啡馆',
            setting_kind: 'location',
            kind: 'setting',
          },
        },
        durationMs: 64,
        raw: { type: 'mcpToolCall', server: 'movscript_workspace', tool: 'domain_upsert_setting' },
      }}
    />,
  )

  assert.match(html, /写入设定/)
  assert.match(html, /completed/)
  assert.match(html, /location/)
  assert.match(html, /setting setting_cafe/)
  assert.match(html, /settings\/setting_cafe\/setting\.json/)
  assert.match(html, /64ms/)
  assert.match(html, /设定：夜间咖啡馆/)
  assert.match(html, /设定已写入本地工作区/)
  assert.match(html, /title=夜间咖啡馆/)
  assert.match(html, /projectId=7/)
  assert.match(html, /1\. 夜间咖啡馆 - location - settings\/setting_cafe\/setting\.json/)
  assert.match(html, /Result details/)
  assert.doesNotMatch(html, /movscript_workspace\/domain_upsert_setting/)
  assert.doesNotMatch(html, /Arguments/)
})

test('AgentChatThreadItemView renders pending MCP tool calls without result or progress', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'mcpToolCall',
        id: 'call_Ys6DnWNeoWwc3bT6XWAs3eu4',
        server: 'movscript_workspace',
        tool: 'context_current_get',
        status: 'inProgress',
        arguments: {},
        pluginId: 'movscript@movscript-bundled',
        result: null,
        error: null,
        durationMs: null,
      }}
    />,
  )

  assert.match(html, /movscript_workspace\/context_current_get/)
  assert.match(html, /inProgress/)
  assert.match(html, /movscript@movscript-bundled/)
  assert.match(html, /Arguments/)
  assert.match(html, /Pending/)
  assert.match(html, /waiting for MCP approval request or tool result/)
})

test('AgentChatThreadItemView renders MCP surface links from structured content', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'mcpToolCall',
        id: 'mcp_surface',
        server: 'movscript_workspace',
        tool: 'generation_job_get',
        status: 'completed',
        result: {
          content: [{ type: 'text', text: 'generation completed' }],
          structuredContent: {
            surface: {
              kind: 'browser_url',
              intent: 'monitor_generation',
              url: 'http://127.0.0.1:5173/agent/generation/jobs/42?mcpApiBaseURL=http%3A%2F%2F127.0.0.1%3A28765',
              route: '/agent/generation/jobs/42',
              usage: 'Open this generation job surface to monitor status.',
            },
            secondary_surfaces: [
              {
                kind: 'browser_url',
                intent: 'edit_prompt',
                url: 'http://127.0.0.1:5173/agent/content/prompt?contentUnitId=7',
                usage: 'Open this prompt workbench to edit and save the current prompt.',
              },
            ],
          },
        },
      }}
    />,
  )

  assert.match(html, /Surface/)
  assert.match(html, /查看生成任务/)
  assert.match(html, /打开提示词工作台/)
  assert.match(html, /monitor_generation/)
  assert.match(html, /edit_prompt/)
  assert.match(html, /agent-chat-surface-link/)
  assert.match(html, /Open this generation job surface to monitor status\./)
  assert.match(html, /Open this prompt workbench to edit and save the current prompt\./)
  assert.match(html, /\/agent\/generation\/jobs\/42/)
})

test('AgentChatThreadItemView renders failed tool calls diagnostically from status alone', () => {
  const mcpHtml = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'mcpToolCall',
        id: 'mcp_failed',
        server: 'filesystem',
        tool: 'readFile',
        status: 'failed',
        arguments: { path: 'missing.md' },
        result: null,
        error: null,
        durationMs: 12,
      }}
    />,
  )
  const dynamicHtml = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'dynamicToolCall',
        id: 'dynamic_failed',
        namespace: 'workspace',
        tool: 'render',
        status: 'failed',
        arguments: { id: 1 },
        success: false,
        durationMs: 12,
      }}
    />,
  )

  assert.match(mcpHtml, /filesystem\/readFile/)
  assert.match(mcpHtml, /failed/)
  assert.match(mcpHtml, /ms-agent-message-section--diagnostic/)
  assert.match(dynamicHtml, /render/)
  assert.match(dynamicHtml, /failed/)
  assert.match(dynamicHtml, /ms-agent-message-section--diagnostic/)
})

test('AgentChatThreadItemView renders cancelled and rejected tool calls diagnostically', () => {
  const cancelledHtml = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'mcpToolCall',
        id: 'mcp_cancelled',
        server: 'movscript_workspace',
        tool: 'context_current_get',
        status: 'cancelled',
        result: null,
        error: null,
      }}
    />,
  )
  const rejectedHtml = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'dynamicToolCall',
        id: 'dynamic_rejected',
        namespace: 'workspace',
        tool: 'writeFile',
        status: 'rejected',
        success: false,
      }}
    />,
  )

  assert.match(cancelledHtml, /movscript_workspace\/context_current_get/)
  assert.match(cancelledHtml, /cancelled/)
  assert.match(cancelledHtml, /ms-agent-message-section--diagnostic/)
  assert.match(rejectedHtml, /writeFile/)
  assert.match(rejectedHtml, /rejected/)
  assert.match(rejectedHtml, /ms-agent-message-section--diagnostic/)
})

test('AgentChatThreadItemView renders system notices with code as metadata and detail as body', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'systemNotice',
        id: 'notice_1',
        level: 'warning',
        code: 'model/rerouted',
        threadId: 'thread_1',
        turnId: 'turn_1',
        title: 'Model rerouted',
        detail: 'model-a -> model-b',
        raw: { method: 'model/rerouted', params: { reason: 'capacity' } },
      }}
    />,
  )

  assert.match(html, /Model rerouted/)
  assert.match(html, /model\/rerouted/)
  assert.match(html, /thread thread_1/)
  assert.match(html, /turn turn_1/)
  assert.match(html, /model-a -&gt; model-b/)
  assert.match(html, /ms-agent-message-section--diagnostic/)
  assert.match(html, /Inspect/)
  assert.doesNotMatch(html, /Notice details/)
  assert.match(html, /capacity/)
})

test('AgentChatThreadItemView renders approval review details and raw review payload', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'approvalReview',
        id: 'approval-review:1',
        reviewId: 'review_1',
        lifecycle: 'completed',
        targetItemId: 'cmd_1',
        startedAtMs: 1,
        completedAtMs: 2,
        reviewStatus: 'denied',
        riskLevel: 'high',
        rationale: 'Unsafe write',
        decisionSource: 'agent',
        action: { type: 'command', source: 'agent', command: 'rm -rf tmp', cwd: '/repo' },
        review: { status: 'denied', riskLevel: 'high', rationale: 'Unsafe write' },
        raw: { type: 'approvalReview', reviewId: 'review_raw_1', reviewer: 'guardian' },
      }}
    />,
  )

  assert.match(html, /Approval review completed/)
  assert.match(html, /denied/)
  assert.match(html, /high/)
  assert.match(html, /agent/)
  assert.match(html, /Details/)
  assert.match(html, /target: cmd_1/)
  assert.match(html, /action: command: rm -rf tmp/)
  assert.match(html, /Timeline/)
  assert.match(html, /started: 1/)
  assert.match(html, /completed: 2/)
  assert.match(html, /duration: 1ms/)
  assert.match(html, /Action context/)
  assert.match(html, /source: agent/)
  assert.match(html, /cwd: \/repo/)
  assert.match(html, /Inspect/)
  assert.match(html, /approvalReview/)
  assert.doesNotMatch(html, /Review details/)
  assert.match(html, /review_raw_1/)
  assert.match(html, /<details[^>]*data-tone="neutral"/)
})

test('AgentChatThreadItemView renders review mode raw details', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'reviewMode',
        id: 'review_mode_1',
        action: 'entered',
        review: 'Reviewing pending changes',
        raw: { type: 'reviewMode', scope: 'turn', reviewId: 'review_mode_raw_1' },
      }}
    />,
  )

  assert.match(html, /Entered review mode/)
  assert.match(html, /Reviewing pending changes/)
  assert.match(html, /Inspect/)
  assert.match(html, /reviewMode/)
  assert.doesNotMatch(html, /Review mode details/)
  assert.match(html, /review_mode_raw_1/)
})

test('AgentChatThreadItemView renders approval review network action context', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'approvalReview',
        id: 'approval-review:network',
        reviewId: 'review_network',
        lifecycle: 'started',
        targetItemId: null,
        startedAtMs: 10,
        reviewStatus: 'inProgress',
        riskLevel: 'medium',
        action: { type: 'networkAccess', target: 'api.example.com:443', host: 'api.example.com', protocol: 'https', port: 443 },
      }}
    />,
  )

  assert.match(html, /Approval review started/)
  assert.match(html, /ms-agent-message-section--process/)
  assert.match(html, /action: networkAccess: api.example.com/)
  assert.match(html, /target: api.example.com:443/)
  assert.match(html, /protocol: https/)
  assert.match(html, /port: 443/)
})

test('AgentChatThreadItemView renders approval review permission action context', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'approvalReview',
        id: 'approval-review:permissions',
        reviewId: 'review_permissions',
        lifecycle: 'started',
        targetItemId: null,
        startedAtMs: 20,
        reviewStatus: 'inProgress',
        riskLevel: 'medium',
        action: {
          type: 'requestPermissions',
          reason: 'Needs generated asset access',
          permissions: {
            network: { enabled: true },
            fileSystem: {
              read: ['/repo/assets'],
              write: ['/repo/generated', '/tmp/movscript'],
              entries: [
                { path: '/repo/secrets', access: 'deny' },
              ],
              globScanMaxDepth: 4,
            },
          },
        },
      }}
    />,
  )

  assert.match(html, /action: requestPermissions/)
  assert.match(html, /Action context/)
  assert.match(html, /reason: Needs generated asset access/)
  assert.match(html, /network: enabled/)
  assert.match(html, /fs read: 1 path/)
  assert.match(html, /fs read: \/repo\/assets/)
  assert.match(html, /fs write: 2 path/)
  assert.match(html, /fs write: \/repo\/generated/)
  assert.match(html, /fs write: \/tmp\/movscript/)
  assert.match(html, /fs entries: 1/)
  assert.match(html, /fs entry: deny \/repo\/secrets/)
  assert.match(html, /glob scan max depth: 4/)
})

test('AgentChatThreadItemView renders context compaction and unknown item raw details', () => {
  const contextHtml = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'contextCompaction',
        id: 'context-compaction:turn_1',
        raw: { threadId: 'thread_1', turnId: 'turn_1', reason: 'token budget', previousTokens: 42000, nextTokens: 12000, removedTokens: 30000 },
      }}
    />,
  )
  const unknownHtml = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'unknown',
        id: 'unknown_1',
        providerType: 'futureItem',
        raw: { id: 'future_1', type: 'futureItem', status: 'streaming', value: 1 },
      }}
    />,
  )

  assert.match(contextHtml, /Context compacted/)
  assert.match(contextHtml, /Details/)
  assert.match(contextHtml, /thread: thread_1/)
  assert.match(contextHtml, /turn: turn_1/)
  assert.match(contextHtml, /reason: token budget/)
  assert.match(contextHtml, /previous tokens: 42000/)
  assert.match(contextHtml, /next tokens: 12000/)
  assert.match(contextHtml, /removed tokens: 30000/)
  assert.match(contextHtml, /Inspect/)
  assert.match(contextHtml, /contextCompaction/)
  assert.doesNotMatch(contextHtml, /Compaction details/)
  assert.match(contextHtml, /previousTokens/)
  assert.match(unknownHtml, /Unknown item: futureItem/)
  assert.match(unknownHtml, /Details/)
  assert.match(unknownHtml, /id: future_1/)
  assert.match(unknownHtml, /provider type: futureItem/)
  assert.match(unknownHtml, /status: streaming/)
  assert.match(unknownHtml, /Inspect/)
  assert.match(unknownHtml, /unknown/)
  assert.doesNotMatch(unknownHtml, /Raw item/)
  assert.match(unknownHtml, /<details[^>]*data-tone="neutral"/)
  assert.match(unknownHtml, /futureItem/)
})

test('AgentChatThreadItemView renders reasoning summaries and collapses trace content', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'reasoning',
        id: 'reason_1',
        summary: ['Checked protocol coverage'],
        content: ['long hidden chain'],
      }}
    />,
  )

  assert.match(html, /Reasoning/)
  assert.match(html, /1 summary part/)
  assert.match(html, /1 trace part/)
  assert.match(html, /Summary/)
  assert.match(html, /Checked protocol coverage/)
  assert.match(html, /<details[^>]*data-tone="diagnostic"/)
  assert.match(html, /Trace/)
})

test('AgentChatThreadItemView renders runtime message step metadata and structured result details', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'reasoning',
        id: 'runtime_step_message',
        title: 'Checked constraints',
        status: 'failed',
        source: 'final',
        roundId: 'round_final',
        roundIndex: 2,
        roundLabel: 'Final response',
        durationMs: 44,
        summary: ['Checked constraints'],
        content: ['Minor warning'],
        result: { findings: 0 },
        error: { code: 'E_MINOR' },
        raw: { type: 'message', stepId: 'step_reasoning_1', roundSource: 'final' },
      }}
    />,
  )

  assert.match(html, /Checked constraints/)
  assert.match(html, /failed/)
  assert.match(html, /final/)
  assert.match(html, /Final response/)
  assert.match(html, /round 2/)
  assert.match(html, /round id round_final/)
  assert.match(html, /44ms/)
  assert.match(html, /ms-agent-message-section--diagnostic/)
  assert.match(html, /Inspect/)
  assert.match(html, /result/)
  assert.match(html, /findings/)
  assert.match(html, /Error/)
  assert.match(html, /E_MINOR/)
  assert.doesNotMatch(html, /Reasoning details/)
  assert.match(html, /step_reasoning_1/)
})

test('AgentChatThreadItemView renders bracketed plan lines as task cards', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'plan',
        id: 'plan_1',
        text: 'Align UI messages\n[completed] Inspect protocol\n[inProgress] Tune renderer',
      }}
    />,
  )

  assert.match(html, /Plan/)
  assert.match(html, /2 step/)
  assert.match(html, /Context/)
  assert.match(html, /Align UI messages/)
  assert.match(html, /ms-agent-plan-overview-list/)
  assert.match(html, /Inspect protocol/)
  assert.match(html, /Tune renderer/)
})

test('AgentChatThreadItemView renders structured plan items as task cards', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'plan',
        id: 'plan_structured',
        text: 'Runtime plan',
        items: [
          { text: 'Inspect provider session event', status: 'completed', raw: { id: 'step_1', owner: 'runtime' } },
          { text: 'Render neutral plan item', status: 'in_progress', raw: { id: 'step_2', priority: 'high' } },
        ],
        raw: {
          explanation: 'Runtime plan',
          plan: [{ step: 'Inspect provider session event', status: 'completed', id: 'step_1' }],
        },
      }}
    />,
  )

  assert.match(html, /Plan/)
  assert.match(html, /2 step/)
  assert.match(html, /Runtime plan/)
  assert.match(html, /Inspect provider session event/)
  assert.match(html, /Render neutral plan item/)
  assert.match(html, /in_progress/)
  assert.match(html, /Inspect/)
  assert.match(html, /plan/)
  assert.match(html, /step_1/)
  assert.match(html, /priority/)
})

test('AgentChatThreadItemView renders file change summaries with collapsed raw details', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'fileChange',
        id: 'file_1',
        status: 'streaming',
        changes: [
          {
            kind: { type: 'update', move_path: 'src/renamed.ts' },
            path: 'src/a.ts',
            diff: '--- a/src/a.ts\n+++ b/src/renamed.ts\n-old\n+new',
          },
          '--- a/src/b.ts\n+++ b/src/b.ts',
        ],
        raw: { type: 'fileChange', patchId: 'patch_1', status: 'streaming' },
      }}
    />,
  )

  assert.match(html, /File changes/)
  assert.match(html, /2 change/)
  assert.match(html, /Summary/)
  assert.match(html, /update src\/a.ts -&gt; src\/renamed.ts \(\+1 -1\)/)
  assert.match(html, /--- a\/src\/b.ts/)
  assert.match(html, /Patch src\/a.ts -&gt; src\/renamed.ts/)
  assert.match(html, /-old/)
  assert.match(html, /\+new/)
  assert.match(html, /Patch 2/)
  assert.match(html, /<details[^>]*data-tone="process"/)
  assert.match(html, /Details/)
  assert.match(html, /Inspect/)
  assert.match(html, /fileChange/)
  assert.match(html, /patch_1/)

  const failedHtml = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'fileChange',
        id: 'file_failed',
        status: 'failed',
        changes: [{
          kind: { type: 'delete' },
          path: 'src/removed.ts',
          diff: '--- a/src/removed.ts\n+++ /dev/null\n-old',
        }],
      }}
    />,
  )

  assert.match(failedHtml, /failed/)
  assert.match(failedHtml, /ms-agent-message-section--diagnostic/)
  assert.match(failedHtml, /delete src\/removed\.ts \(\+0 -1\)/)
})

test('AgentChatThreadItemView renders hook prompts with hook run metadata and prompt body', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'hookPrompt',
        id: 'hook_prompt_1',
        fragments: [
          { hookRunId: 'hook_run_1', text: 'Injected project standards' },
          { hookRunId: 'hook_run_2', text: 'Extra runtime context' },
        ],
        raw: { type: 'hookPrompt', source: 'project-hook' },
      }}
    />,
  )

  assert.match(html, /Hook prompt/)
  assert.match(html, /2 fragment/)
  assert.match(html, /Hook runs/)
  assert.match(html, /hook_run_1/)
  assert.match(html, /Prompt/)
  assert.match(html, /Injected project standards/)
  assert.doesNotMatch(html, /Hook details/)
  assert.doesNotMatch(html, /project-hook/)
})

test('AgentChatThreadItemView applies shared collapse policy to long prompt content', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'hookPrompt',
        id: 'hook_prompt_long',
        fragments: [
          { hookRunId: 'hook_run_1', text: 'x'.repeat(1300) },
        ],
      }}
    />,
  )

  assert.match(html, /Prompt/)
  assert.match(html, /<details[^>]*data-tone="process"/)
})

test('AgentChatThreadItemView renders web search query and action separately', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'webSearch',
        id: 'web_1',
        query: 'agent protocol UI',
        action: { type: 'findInPage', url: 'https://example.com/protocol', pattern: 'ThreadItem' },
        raw: { type: 'webSearch', source: 'codex', requestId: 'search_request_1' },
      }}
    />,
  )

  assert.match(html, /Web search/)
  assert.match(html, /findInPage/)
  assert.match(html, /Query/)
  assert.match(html, /agent protocol UI/)
  assert.match(html, /Action/)
  assert.match(html, /Page: https:\/\/example.com\/protocol/)
  assert.match(html, /Find: ThreadItem/)
  assert.match(html, /Inspect/)
  assert.match(html, /action/)
  assert.doesNotMatch(html, /Search details/)
  assert.match(html, /search_request_1/)
  assert.match(html, /<details[^>]*data-tone="neutral"/)
})

test('AgentChatThreadItemView renders compatibility web search open actions as summaries', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'webSearch',
        id: 'web_compat',
        query: 'agent protocol UI',
        action: { type: 'open_page', url: 'https://example.com' },
      }}
    />,
  )

  assert.match(html, /openPage/)
  assert.match(html, /Open: https:\/\/example.com/)
})

test('AgentChatThreadItemView renders image generation prompt, result, and saved path', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'imageGeneration',
        id: 'image_1',
        status: 'completed',
        revisedPrompt: 'A clearer product diagram',
        result: 'https://cdn.example.com/generated-diagram.png',
        url: 'https://cdn.example.com/generated-diagram.png',
        savedPath: '/repo/assets/diagram.png',
        raw: { type: 'imageGeneration', result: 'https://cdn.example.com/generated-diagram.png', metadata: { size: '1024x1024' } },
      }}
    />,
  )

  assert.match(html, /Image generation/)
  assert.match(html, /completed/)
  assert.match(html, /saved/)
  assert.match(html, /Revised prompt/)
  assert.match(html, /A clearer product diagram/)
  assert.match(html, /Generated image/)
  assert.match(html, /src="https:\/\/cdn.example.com\/generated-diagram.png"/)
  assert.match(html, /alt="Generated image result"/)
  assert.match(html, /Result/)
  assert.match(html, /https:\/\/cdn.example.com\/generated-diagram.png/)
  assert.match(html, /Saved path/)
  assert.match(html, /Inspect/)
  assert.match(html, /image/)
  assert.match(html, /1024x1024/)
})

test('AgentChatThreadItemView renders image generation previews from normalized base64 data URLs', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'imageGeneration',
        id: 'image_inline',
        status: 'completed',
        revisedPrompt: 'A clearer product diagram',
        result: 'iVBORw0KGgo=',
        url: 'data:image/png;base64,iVBORw0KGgo=',
        savedPath: '/tmp/generated_images/image_inline.png',
      }}
    />,
  )

  assert.match(html, /Generated image/)
  assert.match(html, /src="data:image\/png;base64,iVBORw0KGgo="/)
  assert.match(html, /inline image data \(base64, 12 chars\)/)
  assert.doesNotMatch(html, /src="iVBORw0KGgo="/)
})

test('AgentChatThreadItemView renders image view previews from display URLs', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'imageView',
        id: 'image_view_1',
        path: '/repo/image.png',
        url: 'file:///repo/image.png',
      }}
    />,
  )

  assert.match(html, /Image viewed/)
  assert.match(html, /Image preview/)
  assert.match(html, /src="file:\/\/\/repo\/image.png"/)
  assert.match(html, /alt="Viewed image"/)
  assert.match(html, /Path/)
  assert.match(html, /\/repo\/image.png/)
})

test('AgentChatThreadItemView renders failed image generation diagnostically', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'imageGeneration',
        id: 'image_failed',
        status: 'failed',
        result: '',
        raw: { type: 'imageGeneration', status: 'failed', error: 'quota exceeded' },
      }}
    />,
  )

  assert.match(html, /Image generation/)
  assert.match(html, /ms-agent-message-section--diagnostic/)
  assert.match(html, /Inspect/)
  assert.match(html, /quota exceeded/)
})

test('AgentChatThreadItemView renders collab agent prompt and receiver states', () => {
  const html = renderToStaticMarkup(
    <AgentChatThreadItemView
      item={{
        type: 'collabAgentToolCall',
        id: 'collab_1',
        tool: 'spawnAgent',
        status: 'inProgress',
        senderThreadId: 'thread_parent',
        receiverThreadIds: ['thread_child'],
        prompt: 'Review this protocol mapping.',
        model: 'gpt-5',
        reasoningEffort: 'medium',
        agentsStates: {
          thread_child: { status: 'running', message: 'reading files' },
        },
        raw: { type: 'collabAgentToolCall', requestId: 'collab_request_1', routing: 'spawn' },
      }}
    />,
  )

  assert.match(html, /Spawn agent/)
  assert.match(html, /inProgress/)
  assert.match(html, /1 receiver/)
  assert.match(html, /Prompt/)
  assert.match(html, /Review this protocol mapping/)
  assert.match(html, /Threads/)
  assert.match(html, /sender: thread_parent/)
  assert.match(html, /receiver 1: thread_child/)
  assert.match(html, /Agents/)
  assert.match(html, /thread_child: running - reading files/)
  assert.match(html, /Inspect/)
  assert.match(html, /collabAgentToolCall/)
  assert.match(html, /collab_request_1/)
})

function agentChatThreadItemFixtures(): Record<AgentChatThreadItem['type'], AgentChatThreadItem> {
  return {
    userMessage: {
      type: 'userMessage',
      id: 'fixture_user',
      clientId: 'client_fixture',
      content: [{ type: 'text', text: 'Hello', textElements: [] }],
    },
    hookPrompt: {
      type: 'hookPrompt',
      id: 'fixture_hook',
      fragments: [{ hookRunId: 'hook_run_fixture', text: 'Hook prompt' }],
    },
    agentMessage: {
      type: 'agentMessage',
      id: 'fixture_agent',
      text: 'Agent response',
      phase: null,
      memoryCitation: null,
    },
    plan: {
      type: 'plan',
      id: 'fixture_plan',
      text: '[pending] Do the work',
    },
    reasoning: {
      type: 'reasoning',
      id: 'fixture_reasoning',
      summary: ['Summary'],
      content: ['Trace'],
    },
    commandExecution: {
      type: 'commandExecution',
      id: 'fixture_command',
      command: 'echo ok',
      aggregatedOutput: 'ok',
    },
    fileChange: {
      type: 'fileChange',
      id: 'fixture_file',
      status: 'completed',
      changes: [{ path: 'src/a.ts', kind: 'update' }],
    },
    mcpToolCall: {
      type: 'mcpToolCall',
      id: 'fixture_mcp',
      server: 'fs',
      tool: 'read',
      status: 'completed',
      arguments: { path: 'README.md' },
      result: { ok: true },
    },
    dynamicToolCall: {
      type: 'dynamicToolCall',
      id: 'fixture_dynamic',
      namespace: 'workspace',
      tool: 'write_file',
      status: 'completed',
      arguments: { path: 'a.ts' },
      result: { ok: true },
      success: true,
    },
    collabAgentToolCall: {
      type: 'collabAgentToolCall',
      id: 'fixture_collab',
      tool: 'spawnAgent',
      status: 'inProgress',
      senderThreadId: 'thread_parent',
      receiverThreadIds: ['thread_child'],
      prompt: 'Review this',
      model: null,
      reasoningEffort: null,
      agentsStates: {
        thread_child: { status: 'running', message: null },
      },
    },
    webSearch: {
      type: 'webSearch',
      id: 'fixture_web',
      query: 'agent protocol',
    },
    imageView: {
      type: 'imageView',
      id: 'fixture_image_view',
      path: '/repo/image.png',
    },
    imageGeneration: {
      type: 'imageGeneration',
      id: 'fixture_image_generation',
      status: 'completed',
      result: 'image://fixture',
    },
    reviewMode: {
      type: 'reviewMode',
      id: 'fixture_review_mode',
      action: 'entered',
      review: 'Review mode',
    },
    systemNotice: {
      type: 'systemNotice',
      id: 'fixture_notice',
      level: 'info',
      title: 'Notice',
      detail: 'Details',
    },
    approvalReview: {
      type: 'approvalReview',
      id: 'fixture_approval_review',
      reviewId: 'review_fixture',
      lifecycle: 'started',
      targetItemId: 'fixture_command',
      startedAtMs: 1,
      reviewStatus: 'pending',
    },
    contextCompaction: {
      type: 'contextCompaction',
      id: 'fixture_context',
      raw: { compacted: true },
    },
    unknown: {
      type: 'unknown',
      id: 'fixture_unknown',
      providerType: 'future',
      raw: { type: 'future' },
    },
  }
}
