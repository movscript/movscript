import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const generationCardsSource = readSource('apps/frontend/src/features/agent/components/GenerationCards.tsx')
const generationDiagnosticsSource = readSource('apps/frontend/src/features/agent/components/GenerationDiagnosticsCards.tsx')
const activityFeedBuilderSource = readSource('apps/frontend/src/features/agent/presentation/agent-activity-feed/builder.ts')
const activityFeedItemIndexSource = readSource('apps/frontend/src/features/agent/presentation/agent-activity-feed/activityItemIndex.ts')
const activityFeedRoundsSource = readSource('apps/frontend/src/features/agent/presentation/agent-activity-feed/rounds.ts')

test('generation cards keep diagnostics in a companion component module', () => {
  assert.match(generationCardsSource, /export \{ GenerationParamAuditCard, GenerationValidationErrorCard \} from '@\/features\/agent\/components\/GenerationDiagnosticsCards'/)
  assert.match(generationCardsSource, /export function GenerationProgressCard/)
  assert.match(generationCardsSource, /export function GenerationJobSummaryCard/)
  assert.match(generationCardsSource, /export function GenerationTraceSummaryCard/)
  assert.doesNotMatch(generationCardsSource, /export function GenerationParamAuditCard/)
  assert.doesNotMatch(generationCardsSource, /export function GenerationValidationErrorCard/)
  assert.doesNotMatch(generationCardsSource, /formatSuggestedFix/)
  assert.doesNotMatch(generationCardsSource, /formatDroppedParam/)

  assert.match(generationDiagnosticsSource, /export function GenerationParamAuditCard/)
  assert.match(generationDiagnosticsSource, /export function GenerationValidationErrorCard/)
  assert.match(generationDiagnosticsSource, /agentReadinessStatusRecipe/)
  assert.match(generationDiagnosticsSource, /formatSuggestedFix/)
  assert.match(generationDiagnosticsSource, /formatDroppedParam/)
})

test('agent activity feed builder delegates item indexing and round assembly', () => {
  assert.match(activityFeedBuilderSource, /from '\.\/activityItemIndex'/)
  assert.match(activityFeedBuilderSource, /from '\.\/rounds'/)
  assert.match(activityFeedBuilderSource, /buildActivityItemIndex\(activity\)/)
  assert.match(activityFeedBuilderSource, /buildRoundIndexActivityRounds\(activity, runActivityRoundIndex, snapshot\.rounds, itemIndex\)/)
  assert.match(activityFeedBuilderSource, /filterHiddenActionItems\(/)
  assert.doesNotMatch(activityFeedBuilderSource, /function runLifecycleEventText/)
  assert.doesNotMatch(activityFeedBuilderSource, /function activityRoundStatus/)
  assert.doesNotMatch(activityFeedBuilderSource, /function repeatableActivityKey/)

  assert.match(activityFeedItemIndexSource, /export function buildActivityItemIndex/)
  assert.match(activityFeedItemIndexSource, /function runLifecycleEventText/)
  assert.match(activityFeedItemIndexSource, /function modelHttpActivityText/)
  assert.match(activityFeedItemIndexSource, /function repeatableActivityKey/)
  assert.match(activityFeedItemIndexSource, /export function compareActivityItems/)
  assert.match(activityFeedRoundsSource, /export function buildRoundIndexActivityRounds/)
  assert.match(activityFeedRoundsSource, /export function filterHiddenActionItems/)
  assert.match(activityFeedRoundsSource, /function activityRoundStatus/)
  assert.match(activityFeedRoundsSource, /function activityRoundKeyForItem/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
