import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveAgentPinnedStatusView } from '@/features/agent/presentation/agentPinnedStatusView'

test('resolveAgentPinnedStatusView keeps the selected view while it remains available', () => {
  assert.equal(resolveAgentPinnedStatusView('plan', {
    hasGeneration: true,
    hasSubagents: false,
    hasPlan: true,
  }), 'plan')
})

test('resolveAgentPinnedStatusView moves to generation when the selected view becomes empty', () => {
  assert.equal(resolveAgentPinnedStatusView('plan', {
    hasGeneration: true,
    hasSubagents: false,
    hasPlan: false,
  }), 'generation')
})

test('resolveAgentPinnedStatusView falls back through subagents and plan', () => {
  assert.equal(resolveAgentPinnedStatusView('generation', {
    hasGeneration: false,
    hasSubagents: true,
    hasPlan: true,
  }), 'subagent')
  assert.equal(resolveAgentPinnedStatusView('generation', {
    hasGeneration: false,
    hasSubagents: false,
    hasPlan: true,
  }), 'plan')
})

test('resolveAgentPinnedStatusView uses generation as the inert default when nothing is available', () => {
  assert.equal(resolveAgentPinnedStatusView(undefined, {
    hasGeneration: false,
    hasSubagents: false,
    hasPlan: false,
  }), 'generation')
})
