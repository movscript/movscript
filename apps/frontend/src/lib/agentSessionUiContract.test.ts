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
