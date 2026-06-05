import assert from 'node:assert/strict'
import test from 'node:test'

import {
  agentChatRecentCapabilityEventEntryId,
  agentChatRecentCapabilityEventView,
} from '@/features/agent/domain/agentChatRecentCapabilityEvents'

test('agent chat recent capability event entry ids stay unique for same-ms repeated methods', () => {
  const ids = Array.from({ length: 12 }, (_, index) => agentChatRecentCapabilityEventEntryId({
    method: 'runtime/trace/updated',
    nowMs: 1780593448957,
    sequence: index + 1,
  }))

  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids[5], '1780593448957:6:runtime/trace/updated')
  assert.equal(ids[6], '1780593448957:7:runtime/trace/updated')
})

test('agent chat recent capability event view summarizes capability events without provider protocol details', () => {
  const commandOutputView = agentChatRecentCapabilityEventView({
    type: 'commandOutput',
    processId: 'cmd_proc_1',
    stream: 'stdout',
    deltaBase64: '',
    text: 'install complete',
    capReached: false,
  })
  assert.equal(commandOutputView.title, 'Command output')
  assert.deepEqual(commandOutputView.meta, ['process cmd_proc_1', 'stdout', ''])
  assert.match(commandOutputView.detail, /install complete/)

  const processOutputView = agentChatRecentCapabilityEventView({
    type: 'processOutput',
    processHandle: 'proc_1',
    stream: 'stderr',
    deltaBase64: '',
    text: 'warning',
    capReached: true,
  })
  assert.equal(processOutputView.title, 'Process output')
  assert.deepEqual(processOutputView.meta, ['process proc_1', 'stderr', 'capped'])
  assert.match(processOutputView.detail, /warning/)

  const fsView = agentChatRecentCapabilityEventView({
    type: 'fsChanged',
    watchId: 'watch_1',
    changedPaths: ['src/a.ts', 'src/b.ts'],
  })
  assert.equal(fsView.title, 'Files changed')
  assert.deepEqual(fsView.meta, ['watch_1', '2 path(s)'])
  assert.match(fsView.detail, /src\/a\.ts/)
  assert.equal(fsView.tone, 'process')

  const realtimeErrorView = agentChatRecentCapabilityEventView({
    type: 'realtime',
    event: 'error',
    threadId: 'thread_1',
    realtimeSessionId: 'rt_1',
    message: 'transport failed',
  })
  assert.equal(realtimeErrorView.title, 'Realtime error')
  assert.deepEqual(realtimeErrorView.meta, ['thread thread_1', 'session rt_1', ''])
  assert.match(realtimeErrorView.detail, /message: transport failed/)
  assert.equal(realtimeErrorView.tone, 'diagnostic')

  const realtimeStartedView = agentChatRecentCapabilityEventView({
    type: 'realtime',
    event: 'started',
    threadId: 'thread_1',
    realtimeSessionId: 'rt_1',
    version: 'v2',
  })
  assert.equal(realtimeStartedView.title, 'Realtime started')
  assert.match(realtimeStartedView.detail, /version: v2/)

  const realtimeItemView = agentChatRecentCapabilityEventView({
    type: 'realtime',
    event: 'itemAdded',
    threadId: 'thread_1',
    item: {
      id: 'item_1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'Realtime answer' }],
    },
  })
  assert.equal(realtimeItemView.title, 'Realtime item added')
  assert.match(realtimeItemView.detail, /id: item_1/)
  assert.match(realtimeItemView.detail, /type: message/)
  assert.match(realtimeItemView.detail, /role: assistant/)
  assert.match(realtimeItemView.detail, /status: completed/)
  assert.match(realtimeItemView.detail, /content: 1 part\(s\)/)
  assert.match(realtimeItemView.detail, /text: Realtime answer/)

  const realtimeAudioView = agentChatRecentCapabilityEventView({
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
  })
  assert.equal(realtimeAudioView.title, 'Realtime audio delta')
  assert.match(realtimeAudioView.detail, /sample rate: 24000/)
  assert.match(realtimeAudioView.detail, /channels: 1/)
  assert.match(realtimeAudioView.detail, /samples\/channel: 480/)
  assert.match(realtimeAudioView.detail, /data bytes\(base64\): 8/)
  assert.match(realtimeAudioView.detail, /item: item_audio_1/)

  const mcpView = agentChatRecentCapabilityEventView({
    type: 'mcpStatus',
    server: 'filesystem',
    status: 'failed',
    error: 'missing binary',
  })
  assert.equal(mcpView.title, 'MCP filesystem')
  assert.deepEqual(mcpView.meta, ['failed'])
  assert.match(mcpView.detail, /error: missing binary/)
  assert.equal(mcpView.tone, 'diagnostic')
})

test('agent chat recent capability event view summarizes account events without raw JSON', () => {
  const accountView = agentChatRecentCapabilityEventView({
    type: 'account',
    event: 'updated',
    detail: { authMode: 'chatgpt', planType: 'plus' },
  })
  assert.equal(accountView.title, 'Account updated')
  assert.deepEqual(accountView.meta, ['auth chatgpt', 'plan plus'])
  assert.match(accountView.detail, /auth mode: chatgpt/)
  assert.match(accountView.detail, /plan: plus/)
  assert.doesNotMatch(accountView.detail, /"authMode"/)
  assert.equal(accountView.tone, 'process')

  const rateLimitView = agentChatRecentCapabilityEventView({
    type: 'account',
    event: 'rateLimitsUpdated',
    detail: {
      rateLimits: {
        limitId: 'limit_1',
        limitName: 'GPT-5 messages',
        planType: 'pro',
        rateLimitReachedType: 'rate_limit_reached',
        primary: { usedPercent: 100, windowDurationMins: 180, resetsAt: 1780597000 },
        secondary: { usedPercent: 35, windowDurationMins: 10080, resetsAt: 1781200000 },
        credits: { hasCredits: false, unlimited: false, balance: '0' },
        individualLimit: { used: '20', limit: '20', remainingPercent: 0, resetsAt: 1780598000 },
      },
    },
  })
  assert.equal(rateLimitView.title, 'Account rate limits updated')
  assert.deepEqual(rateLimitView.meta, ['plan pro', 'limit reached'])
  assert.match(rateLimitView.detail, /limit: GPT-5 messages/)
  assert.match(rateLimitView.detail, /reached: rate_limit_reached/)
  assert.match(rateLimitView.detail, /primary: 100% used 180 min window resets at 1780597000/)
  assert.match(rateLimitView.detail, /credits: has credits false unlimited false balance 0/)
  assert.match(rateLimitView.detail, /individual limit: used 20 of 20 0% remaining resets at 1780598000/)
  assert.equal(rateLimitView.tone, 'diagnostic')

  const loginView = agentChatRecentCapabilityEventView({
    type: 'account',
    event: 'loginCompleted',
    detail: { loginId: 'login_1', success: false, error: 'browser cancelled' },
  })
  assert.equal(loginView.title, 'Account login completed')
  assert.deepEqual(loginView.meta, ['failed'])
  assert.match(loginView.detail, /login: login_1/)
  assert.match(loginView.detail, /success: false/)
  assert.match(loginView.detail, /error: browser cancelled/)
  assert.equal(loginView.tone, 'diagnostic')
})

test('agent chat recent capability event view still handles non-recent event variants exhaustively', () => {
  const processView = agentChatRecentCapabilityEventView({
    type: 'processExited',
    processHandle: 'proc_1',
    exitCode: 1,
    stdout: '',
    stderr: 'failed',
    stdoutCapReached: false,
    stderrCapReached: false,
  })
  assert.equal(processView.title, 'Process exited')
  assert.deepEqual(processView.meta, ['process proc_1', '1', ''])
  assert.match(processView.detail, /stderr: failed/)
  assert.equal(processView.tone, 'diagnostic')

  const noticeView = agentChatRecentCapabilityEventView({
    type: 'systemNotice',
    level: 'warning',
    title: 'Config warning',
    code: 'missing-config',
    threadId: 'thread_1',
    turnId: 'turn_1',
    detail: 'No config file',
  })
  assert.equal(noticeView.title, 'Config warning')
  assert.deepEqual(noticeView.meta, ['warning', 'missing-config', 'thread thread_1', 'turn turn_1'])
  assert.match(noticeView.detail, /No config file/)
  assert.equal(noticeView.tone, 'diagnostic')
})
