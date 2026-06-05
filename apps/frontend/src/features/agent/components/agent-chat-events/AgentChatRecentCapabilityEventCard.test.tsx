import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { AgentChatRecentCapabilityEventCard } from '@/features/agent/components/agent-chat-events/AgentChatRecentCapabilityEventCard'

test('AgentChatRecentCapabilityEventCard renders recent capability events with structured details', () => {
  const commandOutputHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'commandOutput',
        processId: 'cmd_proc_1',
        stream: 'stdout',
        deltaBase64: '',
        text: 'install complete',
        capReached: false,
      }}
    />,
  )
  assert.match(commandOutputHtml, /Command output/)
  assert.match(commandOutputHtml, /process cmd_proc_1/)
  assert.match(commandOutputHtml, /stdout/)
  assert.match(commandOutputHtml, /install complete/)

  const processExitedHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'processExited',
        processHandle: 'proc_1',
        exitCode: 1,
        stdout: '',
        stderr: 'failed',
        stdoutCapReached: false,
        stderrCapReached: true,
      }}
    />,
  )
  assert.match(processExitedHtml, /Process exited/)
  assert.match(processExitedHtml, /process proc_1/)
  assert.match(processExitedHtml, /capped/)
  assert.match(processExitedHtml, /stderr: failed/)

  const html = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'fsChanged',
        watchId: 'watch_1',
        changedPaths: ['src/a.ts', 'src/b.ts'],
        raw: { method: 'fs/changed', params: { watchId: 'watch_1' } },
      }}
    />,
  )

  assert.match(html, /Files changed/)
  assert.match(html, /watch_1/)
  assert.match(html, /2 path\(s\)/)
  assert.match(html, /Details/)
  assert.match(html, /src\/a\.ts/)
  assert.match(html, /Event details/)
  assert.match(html, /fs\/changed/)
})

test('AgentChatRecentCapabilityEventCard renders realtime and MCP diagnostics distinctly', () => {
  const realtimeHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'realtime',
        event: 'error',
        threadId: 'thread_1',
        realtimeSessionId: 'rt_1',
        message: 'transport failed',
      }}
    />,
  )
  assert.match(realtimeHtml, /Realtime error/)
  assert.match(realtimeHtml, /thread thread_1/)
  assert.match(realtimeHtml, /session rt_1/)
  assert.match(realtimeHtml, /message: transport failed/)

  const startedHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'realtime',
        event: 'started',
        threadId: 'thread_1',
        realtimeSessionId: 'rt_1',
        version: 'v2',
      }}
    />,
  )
  assert.match(startedHtml, /Realtime started/)
  assert.match(startedHtml, /version: v2/)

  const itemHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'realtime',
        event: 'itemAdded',
        threadId: 'thread_1',
        item: {
          id: 'item_1',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Realtime answer' }],
        },
      }}
    />,
  )
  assert.match(itemHtml, /Realtime item added/)
  assert.match(itemHtml, /id: item_1/)
  assert.match(itemHtml, /type: message/)
  assert.match(itemHtml, /role: assistant/)
  assert.match(itemHtml, /content: 1 part\(s\)/)
  assert.match(itemHtml, /text: Realtime answer/)

  const audioHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'realtime',
        event: 'outputAudioDelta',
        threadId: 'thread_1',
        audio: {
          data: 'QUJDRA==',
          sampleRate: 24000,
          numChannels: 1,
          samplesPerChannel: 480,
          itemId: 'item_audio_1',
        },
      }}
    />,
  )
  assert.match(audioHtml, /Realtime audio delta/)
  assert.match(audioHtml, /sample rate: 24000/)
  assert.match(audioHtml, /channels: 1/)
  assert.match(audioHtml, /samples\/channel: 480/)
  assert.match(audioHtml, /data bytes\(base64\): 8/)
  assert.match(audioHtml, /item: item_audio_1/)

  const transcriptDoneHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'realtime',
        event: 'transcriptDone',
        threadId: 'thread_1',
        role: 'assistant',
        text: 'Final realtime transcript',
      }}
    />,
  )
  assert.match(transcriptDoneHtml, /Realtime transcript done/)
  assert.match(transcriptDoneHtml, /assistant/)
  assert.match(transcriptDoneHtml, /text: Final realtime transcript/)

  const closedHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'realtime',
        event: 'closed',
        threadId: 'thread_1',
        reason: 'client shutdown',
      }}
    />,
  )
  assert.match(closedHtml, /Realtime closed/)
  assert.match(closedHtml, /reason: client shutdown/)

  const mcpHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'mcpStatus',
        server: 'filesystem',
        status: 'failed',
        error: 'missing binary',
      }}
    />,
  )
  assert.match(mcpHtml, /MCP filesystem/)
  assert.match(mcpHtml, /status: failed/)
  assert.match(mcpHtml, /error: missing binary/)

  const noticeHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'systemNotice',
        level: 'warning',
        code: 'guardianWarning',
        threadId: 'thread_guardian',
        turnId: 'turn_guardian',
        title: 'Guardian warning',
        detail: 'Sensitive action detected',
        raw: null,
      }}
    />,
  )
  assert.match(noticeHtml, /Guardian warning/)
  assert.match(noticeHtml, /guardianWarning/)
  assert.match(noticeHtml, /thread thread_guardian/)
  assert.match(noticeHtml, /turn turn_guardian/)
  assert.match(noticeHtml, /Sensitive action detected/)
  assert.match(noticeHtml, /Event details/)
  assert.match(noticeHtml, /null/)
})

test('AgentChatRecentCapabilityEventCard renders account events as readable summaries', () => {
  const rateLimitHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'account',
        event: 'rateLimitsUpdated',
        detail: {
          rateLimits: {
            limitName: 'GPT-5 messages',
            planType: 'pro',
            rateLimitReachedType: 'rate_limit_reached',
            primary: { usedPercent: 100, windowDurationMins: 180, resetsAt: 1780597000 },
            credits: { hasCredits: false, unlimited: false, balance: '0' },
          },
        },
      }}
    />,
  )
  assert.match(rateLimitHtml, /Account rate limits updated/)
  assert.match(rateLimitHtml, /plan pro/)
  assert.match(rateLimitHtml, /limit reached/)
  assert.match(rateLimitHtml, /limit: GPT-5 messages/)
  assert.match(rateLimitHtml, /primary: 100% used 180 min window resets at 1780597000/)
  assert.match(rateLimitHtml, /credits: has credits false unlimited false balance 0/)
  assert.doesNotMatch(rateLimitHtml, /&quot;rateLimits&quot;/)

  const loginHtml = renderToStaticMarkup(
    <AgentChatRecentCapabilityEventCard
      event={{
        type: 'account',
        event: 'loginCompleted',
        detail: { loginId: 'login_1', success: false, error: 'browser cancelled' },
      }}
    />,
  )
  assert.match(loginHtml, /Account login completed/)
  assert.match(loginHtml, /failed/)
  assert.match(loginHtml, /success: false/)
  assert.match(loginHtml, /error: browser cancelled/)
})
