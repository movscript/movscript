import assert from 'node:assert/strict'
import test from 'node:test'
import {
  agentAttentionStatusRecipe,
  agentAvailabilityStatusRecipe,
  agentConfigStatusRecipe,
  agentDraftStatusRecipe,
  agentGenerationStatusRecipe,
  agentOptionalStatusRecipe,
  agentPerformanceHealthRecipe,
  agentPerformanceLogRecipe,
  agentPerformanceOperationRecipe,
  agentReadinessStatusRecipe,
  agentRunStatusRecipe,
  agentSeverityStatusRecipe,
  agentSlowDiagnosticRecipe,
  agentTestResultRecipe,
  agentToolCallStatusRecipe,
  agentRunInteractionActionStatusRecipe,
  agentRunInteractionStatusRecipe,
} from './agentSemanticUi'

test('agent run statuses map to UI semantic recipes', () => {
  assert.deepEqual(agentRunStatusRecipe('completed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentRunStatusRecipe('completed_with_warnings'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentRunStatusRecipe('requires_action'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentRunStatusRecipe('failed'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentRunStatusRecipe('in_progress'), { intent: 'neutral', emphasis: 'soft' })
})

test('agent run interaction statuses map to UI semantic recipes', () => {
  assert.deepEqual(agentRunInteractionStatusRecipe('completed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionStatusRecipe('done'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionStatusRecipe('running'), { intent: 'info', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionStatusRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionStatusRecipe('cancelled'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionStatusRecipe('unknown'), { intent: 'neutral', emphasis: 'soft' })
})

test('agent run interaction action statuses map to UI semantic recipes', () => {
  assert.deepEqual(agentRunInteractionActionStatusRecipe('approved'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionActionStatusRecipe('answered'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionActionStatusRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionActionStatusRecipe('pending'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentRunInteractionActionStatusRecipe('unknown'), { intent: 'neutral', emphasis: 'soft' })
})

test('agent draft statuses map to UI semantic recipes', () => {
  assert.deepEqual(agentDraftStatusRecipe('applied'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentDraftStatusRecipe('rejected'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentDraftStatusRecipe('accepted'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentDraftStatusRecipe('draft'), { intent: 'neutral', emphasis: 'soft' })
})

test('agent generation badge states map to UI semantic recipes', () => {
  assert.deepEqual(agentGenerationStatusRecipe('completed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentGenerationStatusRecipe('timeout'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentGenerationStatusRecipe('cancelled'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentGenerationStatusRecipe('failed'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentGenerationStatusRecipe('monitoring'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(agentGenerationStatusRecipe('ended'), { intent: 'neutral', emphasis: 'soft' })
})

test('agent tool calls and config checks map to UI semantic recipes', () => {
  assert.deepEqual(agentToolCallStatusRecipe('completed'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentToolCallStatusRecipe('failed'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentToolCallStatusRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentToolCallStatusRecipe('running'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(agentConfigStatusRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentConfigStatusRecipe(false), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentTestResultRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentTestResultRecipe(false), { intent: 'danger', emphasis: 'soft' })
})

test('agent summary attention uses the same semantic recipe shape', () => {
  assert.deepEqual(agentAttentionStatusRecipe(1, 0), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentAttentionStatusRecipe(0, 1), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentAttentionStatusRecipe(0, 0), { intent: 'neutral', emphasis: 'soft' })
})

test('agent boolean status helpers keep common business states semantic', () => {
  assert.deepEqual(agentReadinessStatusRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentReadinessStatusRecipe(false), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentAvailabilityStatusRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentAvailabilityStatusRecipe(false), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentOptionalStatusRecipe(true), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentOptionalStatusRecipe(false), { intent: 'neutral', emphasis: 'soft' })
})

test('agent severities map to UI semantic recipes', () => {
  assert.deepEqual(agentSeverityStatusRecipe('ready'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentSeverityStatusRecipe('action'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentSeverityStatusRecipe('warning'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentSeverityStatusRecipe('unknown'), { intent: 'neutral', emphasis: 'soft' })
})

test('agent performance statuses map to UI semantic recipes', () => {
  assert.deepEqual(agentPerformanceHealthRecipe(false), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceHealthRecipe(true), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceOperationRecipe('error'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceOperationRecipe('blocked'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceOperationRecipe('running'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceOperationRecipe('success', true), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceOperationRecipe('success'), { intent: 'success', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceLogRecipe('error'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceLogRecipe('warning'), { intent: 'warning', emphasis: 'soft' })
  assert.deepEqual(agentPerformanceLogRecipe('info'), { intent: 'neutral', emphasis: 'soft' })
  assert.deepEqual(agentSlowDiagnosticRecipe('error'), { intent: 'danger', emphasis: 'soft' })
  assert.deepEqual(agentSlowDiagnosticRecipe('warning'), { intent: 'warning', emphasis: 'soft' })
})
