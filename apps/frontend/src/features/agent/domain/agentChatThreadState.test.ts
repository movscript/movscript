import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentChatThread } from '@/features/agent/domain/agentChatProtocol'
import {
  appendAgentChatCommandTerminalInteraction,
  appendAgentChatDeltaTurnItem,
  appendAgentChatMcpToolCallProgress,
  appendAgentChatTurnItem,
  applyAgentChatNotificationEventToThread,
  ensureAgentChatReasoningSummaryPart,
  setAgentChatContextCompaction,
  setAgentChatFileChangePatch,
  setAgentChatTurnDiff,
  setAgentChatTurnPlan,
  upsertAgentChatApprovalReview,
  upsertAgentChatSystemNotice,
  upsertAgentChatTurn,
} from '@/features/agent/domain/agentChatThreadState'

test('agent chat thread state appends and replaces provider-neutral items', () => {
  const started = appendAgentChatTurnItem(threadFixture(), 'turn_1', {
    type: 'dynamicToolCall',
    id: 'tool_1',
    namespace: 'model',
    tool: 'search',
    status: 'in_progress',
  })
  const completed = appendAgentChatTurnItem(started, 'turn_1', {
    type: 'dynamicToolCall',
    id: 'tool_1',
    namespace: 'model',
    tool: 'search',
    status: 'completed',
    arguments: { query: 'agent' },
    result: { matches: 2 },
    success: true,
    durationMs: 42,
  })

  assert.equal(completed.turns.length, 1)
  assert.equal(completed.turns[0]?.items.length, 1)
  const item = completed.turns[0]?.items[0]
  assert.equal(item?.type, 'dynamicToolCall')
  if (item?.type === 'dynamicToolCall') {
    assert.equal(item.status, 'completed')
    assert.deepEqual(item.arguments, { query: 'agent' })
    assert.deepEqual(item.result, { matches: 2 })
    assert.equal(item.durationMs, 42)
  }
})

test('agent chat thread state merges streaming deltas by item type', () => {
  const base = upsertAgentChatTurn(threadFixture(), {
    id: 'turn_1',
    items: [{
      type: 'commandExecution',
      id: 'cmd_1',
      command: 'echo hello',
      aggregatedOutput: 'hello',
    }, {
      type: 'reasoning',
      id: 'reason_1',
      summary: ['summary'],
      content: ['body'],
    }],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt: 10,
    completedAt: null,
    durationMs: null,
  })

  const withCommandDelta = appendAgentChatDeltaTurnItem(base, 'turn_1', {
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'Command',
    aggregatedOutput: ' world',
  }, ' world')
  const withReasoningDelta = appendAgentChatDeltaTurnItem(withCommandDelta, 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    summary: [' plus'],
    content: [],
  }, ' plus', 'summary')

  const command = withReasoningDelta.turns[0]?.items.find((item) => item.id === 'cmd_1')
  const reasoning = withReasoningDelta.turns[0]?.items.find((item) => item.id === 'reason_1')
  assert.equal(command?.type === 'commandExecution' ? command.aggregatedOutput : '', 'hello world')
  assert.deepEqual(reasoning?.type === 'reasoning' ? reasoning.summary : [], ['summary plus'])
})

test('agent chat thread state preserves existing items across turn lifecycle updates', () => {
  const base = upsertAgentChatTurn(threadFixture(), {
    id: 'turn_1',
    items: [{
      type: 'agentMessage',
      id: 'agent_1',
      text: 'draft',
      phase: null,
      memoryCitation: null,
    }, {
      type: 'commandExecution',
      id: 'cmd_1',
      command: 'pnpm test',
      status: 'running',
      aggregatedOutput: 'start\n',
    }],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt: 10,
    completedAt: null,
    durationMs: null,
  })
  const completedWithoutItems = upsertAgentChatTurn(base, {
    id: 'turn_1',
    items: [],
    itemsView: 'full',
    status: 'completed',
    error: null,
    startedAt: 10,
    completedAt: 20,
    durationMs: 10000,
  })
  const completedWithPartialItems = upsertAgentChatTurn(base, {
    id: 'turn_1',
    items: [{
      type: 'agentMessage',
      id: 'agent_1',
      text: 'draft final',
      phase: null,
      memoryCitation: null,
    }],
    itemsView: 'full',
    status: 'completed',
    error: null,
    startedAt: 10,
    completedAt: 20,
    durationMs: 10000,
  })
  const completedWithEmptyAgentItem = upsertAgentChatTurn(base, {
    id: 'turn_1',
    items: [{
      type: 'agentMessage',
      id: 'agent_1',
      text: '',
      phase: null,
      memoryCitation: null,
    }],
    itemsView: 'full',
    status: 'completed',
    error: null,
    startedAt: 10,
    completedAt: 20,
    durationMs: 10000,
  })

  assert.equal(completedWithoutItems.turns[0]?.status, 'completed')
  assert.deepEqual(completedWithoutItems.turns[0]?.items.map((item) => item.id), ['agent_1', 'cmd_1'])
  assert.deepEqual(completedWithPartialItems.turns[0]?.items.map((item) => item.id), ['agent_1', 'cmd_1'])
  const agent = completedWithPartialItems.turns[0]?.items.find((item) => item.id === 'agent_1')
  const command = completedWithPartialItems.turns[0]?.items.find((item) => item.id === 'cmd_1')
  const emptyAgent = completedWithEmptyAgentItem.turns[0]?.items.find((item) => item.id === 'agent_1')
  assert.equal(agent?.type === 'agentMessage' ? agent.text : '', 'draft final')
  assert.equal(emptyAgent?.type === 'agentMessage' ? emptyAgent.text : '', 'draft')
  assert.equal(command?.type === 'commandExecution' ? command.aggregatedOutput : '', 'start\n')
})

test('agent chat thread state preserves text-like item deltas across final item updates', () => {
  const planDelta = appendAgentChatDeltaTurnItem(threadFixture(), 'turn_1', {
    type: 'plan',
    id: 'plan_1',
    text: 'Drafting',
  }, 'Drafting')
  const planFinal = appendAgentChatTurnItem(planDelta, 'turn_1', {
    type: 'plan',
    id: 'plan_1',
    text: '',
  })
  const fileDelta = appendAgentChatDeltaTurnItem(threadFixture(), 'turn_1', {
    type: 'fileChange',
    id: 'file_1',
    status: 'streaming',
    changes: ['Applying\n'],
  }, 'Applying\n')
  const fileFinal = appendAgentChatTurnItem(fileDelta, 'turn_1', {
    type: 'fileChange',
    id: 'file_1',
    status: 'completed',
    changes: [{ path: 'src/a.ts', type: 'modify' }],
  })

  const plan = planFinal.turns[0]?.items[0]
  const file = fileFinal.turns[0]?.items[0]
  assert.equal(plan?.type === 'plan' ? plan.text : '', 'Drafting')
  assert.deepEqual(file?.type === 'fileChange' ? file.changes : [], [
    { path: 'src/a.ts', type: 'modify' },
    'Applying\n',
  ])
  assert.equal(file?.type === 'fileChange' ? file.status : undefined, 'completed')
})

test('agent chat thread state preserves reasoning deltas across final item updates', () => {
  const earlySummary = appendAgentChatDeltaTurnItem(threadFixture(), 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    summary: ['thinking'],
    content: [],
  }, 'thinking', 'summary')
  const earlyContent = appendAgentChatDeltaTurnItem(earlySummary, 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    summary: [],
    content: ['trace'],
  }, 'trace')
  const finalWithoutText = appendAgentChatTurnItem(earlyContent, 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    title: 'Reasoning',
    status: 'completed',
    summary: [],
    content: [],
    durationMs: 25,
  })
  const finalWithCompleteText = appendAgentChatTurnItem(earlyContent, 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    title: 'Reasoning',
    status: 'completed',
    summary: ['thinking done'],
    content: ['trace complete'],
    durationMs: 30,
  })

  const emptyFinalItem = finalWithoutText.turns[0]?.items[0]
  const completeFinalItem = finalWithCompleteText.turns[0]?.items[0]
  assert.deepEqual(emptyFinalItem?.type === 'reasoning' ? emptyFinalItem.summary : [], ['thinking'])
  assert.deepEqual(emptyFinalItem?.type === 'reasoning' ? emptyFinalItem.content : [], ['trace'])
  assert.equal(emptyFinalItem?.type === 'reasoning' ? emptyFinalItem.status : '', 'completed')
  assert.deepEqual(completeFinalItem?.type === 'reasoning' ? completeFinalItem.summary : [], ['thinking done'])
  assert.deepEqual(completeFinalItem?.type === 'reasoning' ? completeFinalItem.content : [], ['trace complete'])
})

test('agent chat thread state applies reasoning deltas to indexed parts', () => {
  const summaryDelta = appendAgentChatDeltaTurnItem(threadFixture(), 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    summary: ['second'],
    content: [],
  }, 'second', 'summary', 1)
  const contentDelta = appendAgentChatDeltaTurnItem(summaryDelta, 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    summary: [],
    content: ['trace'],
  }, 'trace', 'content', 2)
  const withPartBeforeItem = ensureAgentChatReasoningSummaryPart(threadFixture(), 'turn_1', 'reason_early', 2)
  const withPartDelta = appendAgentChatDeltaTurnItem(withPartBeforeItem, 'turn_1', {
    type: 'reasoning',
    id: 'reason_early',
    summary: ['late'],
    content: [],
  }, 'late', 'summary', 2)

  const item = contentDelta.turns[0]?.items[0]
  const earlyItem = withPartDelta.turns[0]?.items[0]
  assert.deepEqual(item?.type === 'reasoning' ? item.summary : [], ['', 'second'])
  assert.deepEqual(item?.type === 'reasoning' ? item.content : [], ['', '', 'trace'])
  assert.deepEqual(earlyItem?.type === 'reasoning' ? earlyItem.summary : [], ['', '', 'late'])
})

test('agent chat thread state preserves command output across final item updates', () => {
  const earlyOutput = appendAgentChatDeltaTurnItem(threadFixture(), 'turn_1', {
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'Command',
    aggregatedOutput: 'start\n',
  }, 'start\n')
  const finalWithoutOutput = appendAgentChatTurnItem(earlyOutput, 'turn_1', {
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'pnpm test',
    status: 'completed',
    aggregatedOutput: null,
    exitCode: 0,
  })
  const finalWithCompleteOutput = appendAgentChatTurnItem(earlyOutput, 'turn_1', {
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'pnpm test',
    status: 'completed',
    aggregatedOutput: 'start\nok\n',
    exitCode: 0,
  })
  const finalWithOutputSuffix = appendAgentChatTurnItem(earlyOutput, 'turn_1', {
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'pnpm test',
    status: 'completed',
    aggregatedOutput: 'ok\n',
    exitCode: 0,
  })

  const withoutOutputItem = finalWithoutOutput.turns[0]?.items[0]
  const completeOutputItem = finalWithCompleteOutput.turns[0]?.items[0]
  const outputSuffixItem = finalWithOutputSuffix.turns[0]?.items[0]
  assert.equal(withoutOutputItem?.type === 'commandExecution' ? withoutOutputItem.aggregatedOutput : '', 'start\n')
  assert.equal(completeOutputItem?.type === 'commandExecution' ? completeOutputItem.aggregatedOutput : '', 'start\nok\n')
  assert.equal(outputSuffixItem?.type === 'commandExecution' ? outputSuffixItem.aggregatedOutput : '', 'start\nok\n')
})

test('agent chat thread state applies process events to matching command items', () => {
  const base = upsertAgentChatTurn(threadFixture(), {
    id: 'turn_1',
    items: [{
      type: 'commandExecution',
      id: 'cmd_1',
      processId: 'proc_1',
      command: 'pnpm test',
      status: 'running',
      aggregatedOutput: 'start\n',
    }],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt: 10,
    completedAt: null,
    durationMs: null,
  })

  const withOutput = applyAgentChatNotificationEventToThread(base, {
    type: 'processOutput',
    processHandle: 'proc_1',
    stream: 'stdout',
    deltaBase64: 'b2sK',
    text: 'ok\n',
    capReached: false,
  })
  const withExit = applyAgentChatNotificationEventToThread(withOutput, {
    type: 'processExited',
    processHandle: 'proc_1',
    exitCode: 1,
    stdout: '',
    stderr: 'failed\n',
    stdoutCapReached: false,
    stderrCapReached: false,
  })

  const command = withExit.turns[0]?.items[0]
  assert.equal(command?.type, 'commandExecution')
  if (command?.type === 'commandExecution') {
    assert.equal(command.aggregatedOutput, 'start\nok\n')
    assert.equal(command.exitCode, 1)
    assert.equal(command.status, 'failed')
  }
})

test('agent chat thread state applies command output events to matching command items', () => {
  const base = upsertAgentChatTurn(threadFixture(), {
    id: 'turn_1',
    items: [{
      type: 'commandExecution',
      id: 'cmd_1',
      processId: 'proc_1',
      command: 'pnpm test',
      status: 'running',
      aggregatedOutput: 'start\n',
    }],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt: 10,
    completedAt: null,
    durationMs: null,
  })

  const next = applyAgentChatNotificationEventToThread(base, {
    type: 'commandOutput',
    processId: 'proc_1',
    stream: 'stdout',
    deltaBase64: 'b2sK',
    text: 'ok\n',
    capReached: false,
  })

  const command = next.turns[0]?.items[0]
  assert.equal(command?.type, 'commandExecution')
  assert.equal(command?.type === 'commandExecution' ? command.aggregatedOutput : '', 'start\nok\n')
})

test('agent chat thread state appends MCP tool call progress messages', () => {
  const base = upsertAgentChatTurn(threadFixture(), {
    id: 'turn_1',
    items: [{
      type: 'mcpToolCall',
      id: 'mcp_1',
      server: 'workspace',
      tool: 'read',
      status: 'in_progress',
    }],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt: 10,
    completedAt: null,
    durationMs: null,
  })

  const first = appendAgentChatMcpToolCallProgress(base, 'turn_1', 'mcp_1', 'Reading workspace')
  const second = appendAgentChatMcpToolCallProgress(first, 'turn_1', 'mcp_1', 'Parsing response')
  const completed = appendAgentChatTurnItem(second, 'turn_1', {
    type: 'mcpToolCall',
    id: 'mcp_1',
    server: 'workspace',
    tool: 'read',
    status: 'completed',
    result: { ok: true },
  })
  const earlyProgress = appendAgentChatMcpToolCallProgress(threadFixture(), 'turn_1', 'mcp_early', 'Connecting')
  const completedAfterEarlyProgress = appendAgentChatTurnItem(earlyProgress, 'turn_1', {
    type: 'mcpToolCall',
    id: 'mcp_early',
    server: 'workspace',
    tool: 'read',
    status: 'completed',
    progressMessages: ['Connecting', 'Reading'],
    result: { ok: true },
  })

  const item = completed.turns[0]?.items[0]
  assert.equal(item?.type, 'mcpToolCall')
  assert.deepEqual(item?.type === 'mcpToolCall' ? item.progressMessages : [], ['Reading workspace', 'Parsing response'])
  assert.deepEqual(item?.type === 'mcpToolCall' ? item.result : undefined, { ok: true })
  assert.equal(completed.turns[0]?.items.length, 1)
  const earlyItem = completedAfterEarlyProgress.turns[0]?.items[0]
  assert.equal(earlyItem?.type, 'mcpToolCall')
  assert.equal(earlyItem?.type === 'mcpToolCall' ? earlyItem.server : '', 'workspace')
  assert.equal(earlyItem?.type === 'mcpToolCall' ? earlyItem.tool : '', 'read')
  assert.deepEqual(earlyItem?.type === 'mcpToolCall' ? earlyItem.progressMessages : [], ['Connecting', 'Reading'])
  assert.deepEqual(earlyItem?.type === 'mcpToolCall' ? earlyItem.result : undefined, { ok: true })
})

test('agent chat thread state appends command terminal interactions and preserves them on completion', () => {
  const base = appendAgentChatTurnItem(threadFixture(), 'turn_1', {
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'node repl.js',
    processId: 'proc_1',
    status: 'running',
    aggregatedOutput: null,
  })
  const withInput = appendAgentChatCommandTerminalInteraction(base, 'turn_1', 'cmd_1', {
    processId: 'proc_1',
    stdin: 'yes\n',
  })
  const completed = appendAgentChatTurnItem(withInput, 'turn_1', {
    type: 'commandExecution',
    id: 'cmd_1',
    command: 'node repl.js',
    processId: 'proc_1',
    status: 'completed',
    terminalInteractions: [
      { processId: 'proc_1', stdin: 'yes\n' },
      { processId: 'proc_1', stdin: 'no\n' },
    ],
    aggregatedOutput: 'done\n',
    exitCode: 0,
  })

  const item = completed.turns[0]?.items[0]
  assert.equal(item?.type, 'commandExecution')
  assert.deepEqual(item?.type === 'commandExecution' ? item.terminalInteractions : [], [{
    processId: 'proc_1',
    stdin: 'yes\n',
  }, {
    processId: 'proc_1',
    stdin: 'no\n',
  }])
  assert.equal(item?.type === 'commandExecution' ? item.exitCode : undefined, 0)
})

test('agent chat thread state creates command item for terminal interactions before item start', () => {
  const next = appendAgentChatCommandTerminalInteraction(threadFixture(), 'turn_1', 'cmd_1', {
    processId: 'proc_1',
    stdin: 'q\n',
  })

  const item = next.turns[0]?.items[0]
  assert.equal(item?.type, 'commandExecution')
  assert.equal(item?.type === 'commandExecution' ? item.command : '', 'Terminal interaction')
  assert.deepEqual(item?.type === 'commandExecution' ? item.terminalInteractions : [], [{
    processId: 'proc_1',
    stdin: 'q\n',
  }])
})

test('agent chat thread state upserts approval reviews as stable neutral items', () => {
  const started = upsertAgentChatApprovalReview(threadFixture(), 'turn_1', {
    type: 'approvalReview',
    id: 'approval-review:review_1',
    reviewId: 'review_1',
    lifecycle: 'started',
    targetItemId: 'cmd_1',
    startedAtMs: 100,
    reviewStatus: 'pending',
    riskLevel: 'medium',
    action: { type: 'command', command: 'pnpm test' },
  })
  const completed = upsertAgentChatApprovalReview(started, 'turn_1', {
    type: 'approvalReview',
    id: 'approval-review:review_1',
    reviewId: 'review_1',
    lifecycle: 'completed',
    targetItemId: 'cmd_1',
    startedAtMs: 100,
    completedAtMs: 150,
    reviewStatus: 'approved',
    decisionSource: 'agent',
    action: { type: 'command', command: 'pnpm test' },
  })

  assert.equal(completed.turns[0]?.items.length, 1)
  const item = completed.turns[0]?.items[0]
  assert.equal(item?.type, 'approvalReview')
  assert.equal(item?.type === 'approvalReview' ? item.lifecycle : '', 'completed')
  assert.equal(item?.type === 'approvalReview' ? item.decisionSource : '', 'agent')
})

test('agent chat thread state upserts system notices as stable neutral items', () => {
  const first = upsertAgentChatSystemNotice(threadFixture(), 'turn_1', {
    type: 'systemNotice',
    id: 'model-rerouted:turn_1',
    level: 'warning',
    title: 'Model rerouted',
    detail: 'model-a -> model-b',
    code: 'model/rerouted',
    threadId: 'thread_1',
    turnId: 'turn_1',
  })
  const second = upsertAgentChatSystemNotice(first, 'turn_1', {
    type: 'systemNotice',
    id: 'model-rerouted:turn_1',
    level: 'warning',
    title: 'Model rerouted',
    detail: 'model-a -> model-c',
    code: 'model/rerouted',
    threadId: 'thread_1',
    turnId: 'turn_1',
  })

  assert.equal(second.turns[0]?.items.length, 1)
  const item = second.turns[0]?.items[0]
  assert.equal(item?.type, 'systemNotice')
  assert.equal(item?.type === 'systemNotice' ? item.detail : '', 'model-a -> model-c')
  assert.equal(item?.type === 'systemNotice' ? item.threadId : '', 'thread_1')
  assert.equal(item?.type === 'systemNotice' ? item.turnId : '', 'turn_1')
})

test('agent chat thread state applies file patch updates to file change items', () => {
  const withOutput = appendAgentChatDeltaTurnItem(threadFixture(), 'turn_1', {
    type: 'fileChange',
    id: 'file_1',
    status: 'streaming',
    changes: ['Applying patch\n'],
  }, 'Applying patch\n')
  const created = setAgentChatFileChangePatch(withOutput, 'turn_1', 'file_1', [{ path: 'a.ts', type: 'add' }])
  const updated = setAgentChatFileChangePatch(created, 'turn_1', 'file_1', [{ path: 'b.ts', type: 'modify' }])
  const withLaterOutput = appendAgentChatDeltaTurnItem(updated, 'turn_1', {
    type: 'fileChange',
    id: 'file_1',
    status: 'streaming',
    changes: ['Done\n'],
  }, 'Done\n')

  const item = withLaterOutput.turns[0]?.items[0]
  assert.equal(item?.type, 'fileChange')
  assert.deepEqual(item?.type === 'fileChange' ? item.changes : [], [
    { path: 'b.ts', type: 'modify' },
    'Applying patch\nDone\n',
  ])
  assert.equal(item?.type === 'fileChange' ? item.status : undefined, 'streaming')
})

test('agent chat thread state creates reasoning summary parts before deltas append', () => {
  const base = upsertAgentChatTurn(threadFixture(), {
    id: 'turn_1',
    items: [{
      type: 'reasoning',
      id: 'reason_1',
      summary: ['first'],
      content: [],
    }],
    itemsView: 'full',
    status: 'inProgress',
    error: null,
    startedAt: 10,
    completedAt: null,
    durationMs: null,
  })
  const withPart = ensureAgentChatReasoningSummaryPart(base, 'turn_1', 'reason_1', 1)
  const withDelta = appendAgentChatDeltaTurnItem(withPart, 'turn_1', {
    type: 'reasoning',
    id: 'reason_1',
    summary: ['second'],
    content: [],
  }, 'second', 'summary')

  const item = withDelta.turns[0]?.items[0]
  assert.deepEqual(item?.type === 'reasoning' ? item.summary : [], ['first', 'second'])
})

test('agent chat thread state projects turn-level plan updates into stable plan items', () => {
  const first = setAgentChatTurnPlan(threadFixture(), 'turn_1', 'Drafting', [
    { step: 'Inspect protocol', status: 'completed' },
    { step: 'Patch UI', status: 'inProgress' },
  ])
  const second = setAgentChatTurnPlan(first, 'turn_1', null, [
    { step: 'Verify', status: 'pending' },
  ])

  assert.equal(second.turns[0]?.items.length, 1)
  const item = second.turns[0]?.items[0]
  assert.equal(item?.type, 'plan')
  assert.equal(item?.type === 'plan' ? item.id : '', 'turn-plan:turn_1')
  assert.equal(item?.type === 'plan' ? item.text : '', '[pending] Verify')
  assert.deepEqual(item?.type === 'plan' ? item.items?.map(({ text, status }) => ({ text, status })) : [], [
    { text: 'Verify', status: 'pending' },
  ])
  assert.deepEqual(item?.type === 'plan' ? item.raw : null, {
    explanation: null,
    plan: [{ step: 'Verify', status: 'pending' }],
  })
})

test('agent chat thread state projects turn-level diff updates into stable file change items', () => {
  const first = setAgentChatTurnDiff(threadFixture(), 'turn_1', '--- a/file.ts\n+++ b/file.ts\n')
  const second = setAgentChatTurnDiff(first, 'turn_1', '--- a/next.ts\n+++ b/next.ts\n')

  assert.equal(second.turns[0]?.items.length, 1)
  const item = second.turns[0]?.items[0]
  assert.equal(item?.type, 'fileChange')
  assert.equal(item?.type === 'fileChange' ? item.id : '', 'turn-diff:turn_1')
  assert.deepEqual(item?.type === 'fileChange' ? item.changes : [], [{
    path: 'turn.diff',
    kind: 'update',
    diff: '--- a/next.ts\n+++ b/next.ts\n',
  }])
})

test('agent chat thread state projects compacted notifications into stable context compaction items', () => {
  const first = setAgentChatContextCompaction(threadFixture(), 'turn_1', { reason: 'manual' })
  const second = setAgentChatContextCompaction(first, 'turn_1', { reason: 'auto' })

  assert.equal(second.turns[0]?.items.length, 1)
  const item = second.turns[0]?.items[0]
  assert.equal(item?.type, 'contextCompaction')
  assert.equal(item?.id, 'turn-context-compaction:turn_1')
  assert.deepEqual(item?.raw, { reason: 'auto' })
})

function threadFixture(): AgentChatThread {
  return {
    provider: 'codex',
    id: 'thread_1',
    sessionId: 'session_1',
    preview: '',
    name: null,
    createdAt: 1,
    updatedAt: 1,
    status: 'running',
    turns: [],
  }
}
