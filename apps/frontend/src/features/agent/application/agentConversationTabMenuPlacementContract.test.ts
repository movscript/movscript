import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('agent conversation tab context menu placement is owned by a presentation helper', () => {
  const conversationHeaderSource = readFileSync(resolve('src/features/agent/components/AgentChatHeaderSection.tsx'), 'utf8')
  const placementSource = readFileSync(resolve('src/features/agent/presentation/agentConversationTabMenuPlacement.ts'), 'utf8')
  const dismissalSource = readFileSync(resolve('src/shared/ui/transientOverlayDismissal.ts'), 'utf8')

  assert.match(placementSource, /export function agentConversationTabMenuPositionFromPointerEvent/)
  assert.match(placementSource, /export function agentConversationTabMenuPositionFromTriggerElement/)
  assert.match(placementSource, /export function agentConversationTabMenuAnchorStyleFromPosition/)
  assert.match(dismissalSource, /export function subscribeTransientOverlayDismissal/)
  assert.match(conversationHeaderSource, /agentConversationTabMenuPositionFromPointerEvent\(event\)/)
  assert.match(conversationHeaderSource, /agentConversationTabMenuPositionFromTriggerElement/)
  assert.match(conversationHeaderSource, /agentConversationTabMenuAnchorStyleFromPosition\(tabContextMenu\)/)
  assert.match(conversationHeaderSource, /subscribeTransientOverlayDismissal\(\{/)
  assert.doesNotMatch(conversationHeaderSource, /event\.clientX/)
  assert.doesNotMatch(conversationHeaderSource, /event\.clientY/)
  assert.doesNotMatch(conversationHeaderSource, /left: tabContextMenu\.x/)
  assert.doesNotMatch(conversationHeaderSource, /top: tabContextMenu\.y/)
  assert.doesNotMatch(conversationHeaderSource, /function clampNumber/)
  assert.doesNotMatch(conversationHeaderSource, /getBoundingClientRect\(\)/)
  assert.doesNotMatch(conversationHeaderSource, /window\.innerWidth/)
  assert.doesNotMatch(conversationHeaderSource, /window\.innerHeight/)
  assert.doesNotMatch(conversationHeaderSource, /window\.addEventListener\('resize'/)
  assert.doesNotMatch(conversationHeaderSource, /window\.innerWidth - 208/)
  assert.doesNotMatch(conversationHeaderSource, /window\.innerHeight - 158/)
})
