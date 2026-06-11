import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AGENT_RUN_PROFILE_PRESETS,
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById,
} from '../dist/agent/index.js'

test('core run profile presets expose provider-session permission decisions without UI copy', () => {
  assert.equal(DEFAULT_AGENT_RUN_PROFILE_PRESET_ID, 'default')
  assert.deepEqual(AGENT_RUN_PROFILE_PRESETS.map((preset) => preset.id), [
    'read-only',
    'default',
    'auto-review',
    'full-access',
  ])

  assert.deepEqual(agentRunProfilePresetById('read-only'), {
    id: 'read-only',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'user',
    permissionProfileId: ':read-only',
    fallbackSandbox: 'read-only',
  })
  assert.deepEqual(agentRunProfilePresetById('auto-review'), {
    id: 'auto-review',
    approvalPolicy: 'on-request',
    approvalsReviewer: 'auto_review',
    permissionProfileId: ':workspace',
    fallbackSandbox: 'workspace-write',
  })
  assert.deepEqual(agentRunProfilePresetById('full-access'), {
    id: 'full-access',
    approvalPolicy: 'never',
    approvalsReviewer: 'user',
    permissionProfileId: ':danger-full-access',
    fallbackSandbox: 'danger-full-access',
  })
})

test('core run profile preset lookup falls back to the default strategy', () => {
  assert.equal(agentRunProfilePresetById('missing').id, 'default')
  assert.equal(agentRunProfilePresetById('missing').permissionProfileId, ':workspace')
})
