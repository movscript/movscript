import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('agent session UI keeps explicit local runtime thread recovery contracts', () => {
  const panelSource = readFileSync(resolve('src/components/layout/AIAgentPanel.tsx'), 'utf8')
  const clientSource = readFileSync(resolve('src/lib/localAgentClient.ts'), 'utf8')
  const sessionStoreSource = readFileSync(resolve('src/store/agentSessionStore.ts'), 'utf8')

  assert.doesNotMatch(clientSource, /getThreadOrCreate/)
  assert.match(clientSource, /threadResolution: AgentThreadResolution/)
  assert.match(clientSource, /if \(!isLocalAgentNotFoundError\(error\)\) throw error/)
  assert.match(clientSource, /runMessageStream[\s\S]*threadResolution: resolvedThread\.resolution/)

  assert.match(sessionStoreSource, /export function conversationIdForLocalThread/)
  assert.match(panelSource, /conversationIdForLocalThread\(\{[\s\S]*localThreadIdsByConversation[\s\S]*conversationRuntimes/)
  assert.match(panelSource, /setActiveConversation\(userId, existingConvId\)[\s\S]*return/)

  assert.match(panelSource, /function threadResolutionActivityEvent/)
  assert.match(panelSource, /本地线程不存在，已创建新线程/)
  assert.match(panelSource, /threadResolutionActivityEvent\(runResult\.threadResolution\)/)
  assert.match(panelSource, /appendAssistantRunResult\(run, thread, liveEvents\)/)
})

test('agent session UI keeps worker trace drilldown contracts', () => {
  const panelSource = readFileSync(resolve('src/components/layout/AIAgentPanel.tsx'), 'utf8')

  assert.match(panelSource, /const \[traceSummaries, setTraceSummaries\]/)
  assert.match(panelSource, /const \[traceEventsByRunId, setTraceEventsByRunId\]/)
  assert.match(panelSource, /localAgentClient\.getRunTraceSummary\(runId\)/)
  assert.match(panelSource, /localAgentClient\.getRunTraceEvents\(runId, \{ limit: 8/)
  assert.match(panelSource, /traceEventHasMoreByRunId/)
  assert.match(panelSource, /traceEventKindFilters/)
  assert.match(panelSource, /轨迹统计/)
  assert.match(panelSource, /运行事件/)
  assert.match(panelSource, /加载更多/)
})

test('agent session UI routes pending input answers before starting a new run', () => {
  const panelSource = readFileSync(resolve('src/components/layout/AIAgentPanel.tsx'), 'utf8')
  const runPageSource = readFileSync(resolve('src/pages/agent/AIAgentRunPage.tsx'), 'utf8')

  assert.match(panelSource, /const activePendingInputRequest = firstPendingInputRequest\(actionableLocalRun\)/)
  assert.match(panelSource, /const answeringPendingInput = !!activePendingInputRequest/)
  assert.match(panelSource, /answeringPendingInput[\s\S]*localAgentClient\.answerRunInput\(run\.id, \{ requestId, \.\.\.answer \}\)/)
  assert.match(panelSource, /formatInputAnswerForChat\(request, answer\)/)
  assert.match(panelSource, /answeringPendingInput \? '回答' : debugBeforeSend/)
  assert.match(panelSource, /disabled=\{loading \|\| buildingSendDraft \|\| \(answeringPendingInput && !canAnswerPendingInputWithText\)\}/)

  const pendingBranch = panelSource.indexOf('if (answeringPendingInput && activePendingInputRequest)')
  const newRunPath = panelSource.indexOf('const draft = await buildSendDraft')
  assert.ok(pendingBranch > 0, 'pending input answer branch must exist in send()')
  assert.ok(newRunPath > pendingBranch, 'pending input must be handled before building a new send draft')

  assert.match(runPageSource, /import \{ LocalAgentInputRequestCard \}/)
  assert.match(runPageSource, /<LocalAgentInputRequestCard/)
  assert.doesNotMatch(runPageSource, /inputDrafts/)
})

test('agent panel keeps recent resources as mention candidates, not automatic context labels', () => {
  const panelSource = readFileSync(resolve('src/components/layout/AIAgentPanel.tsx'), 'utf8')

  assert.doesNotMatch(panelSource, /recentResourcesCount/)
  assert.match(panelSource, /\.\.\.recentResources\.map\(attachmentFromResource\)/)
  assert.match(panelSource, /resourceMentionAttachments\(input, resourceAttachmentIndex\)/)
  assert.match(panelSource, /recentResources: \[\]/)
})
