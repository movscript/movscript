import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('agent composer mention menu placement is owned by the presentation helper', () => {
  const composerSource = readFileSync(resolve('src/features/agent/components/AgentComposerSection.tsx'), 'utf8')
  const placementSource = readFileSync(resolve('src/features/agent/presentation/agentComposerMentionMenuPlacement.ts'), 'utf8')

  assert.match(placementSource, /export function agentComposerMentionMenuPositionFromEditorRect/)
  assert.match(placementSource, /export function agentComposerMentionMenuPositionFromEditorElement/)
  assert.match(placementSource, /export function subscribeAgentComposerMentionMenuPlacement/)
  assert.match(placementSource, /export function agentComposerMentionMenuPositionEqual/)
  assert.match(placementSource, /export function agentComposerMentionMenuStyleFromPosition/)
  assert.match(composerSource, /agentComposerMentionMenuPositionFromEditorElement\(editor\)/)
  assert.match(composerSource, /subscribeAgentComposerMentionMenuPlacement\(updateMentionMenuPosition\)/)
  assert.match(composerSource, /agentComposerMentionMenuPositionEqual\(current, nextPosition\)/)
  assert.match(composerSource, /agentComposerMentionMenuStyleFromPosition\(mentionMenuPosition\)/)
  assert.doesNotMatch(composerSource, /mentionMenuPosition\.maxHeight/)
  assert.doesNotMatch(composerSource, /bottom: mentionMenuPosition\.bottom/)
  assert.doesNotMatch(composerSource, /left: mentionMenuPosition\.left/)
  assert.doesNotMatch(composerSource, /width: mentionMenuPosition\.width/)
  assert.doesNotMatch(composerSource, /getBoundingClientRect\(/)
  assert.doesNotMatch(composerSource, /window\.innerWidth/)
  assert.doesNotMatch(composerSource, /window\.innerHeight/)
  assert.doesNotMatch(composerSource, /window\.addEventListener\('resize'/)
  assert.doesNotMatch(composerSource, /const viewportPadding = 8/)
  assert.doesNotMatch(composerSource, /const availableAbove = Math\.max\(120/)
})
