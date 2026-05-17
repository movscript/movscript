import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAgentUpdateState,
  evaluateAgentUpdateCandidate,
  normalizeAgentUpdateCandidate,
  normalizeAgentUpdatePolicy,
} from './updatePolicy.js'

test('default update policy forces critical catalog and policy fixes', () => {
  const result = evaluateAgentUpdateCandidate({
    id: 'movscript.default.local-agent',
    version: '0.1.1',
    kind: 'policy',
    severity: 'critical',
    source: 'builtin',
  })

  assert.equal(result.decision, 'force_apply')
  assert.equal(result.warnings.length, 0)
})

test('remote updates require signatures by default', () => {
  const result = evaluateAgentUpdateCandidate({
    id: 'movscript.remote.skill-pack',
    version: '1.0.0',
    kind: 'skill_catalog',
    severity: 'normal',
    source: 'remote',
    signed: false,
  })

  assert.equal(result.decision, 'reject')
  assert.match(result.reason, /unsigned/)
})

test('runtime code updates are deferred to the signed application updater path', () => {
  const result = evaluateAgentUpdateCandidate({
    id: 'movscript-agent-runtime',
    version: '0.1.1',
    kind: 'runtime_code',
    severity: 'critical',
    source: 'remote',
    signed: true,
  })

  assert.equal(result.decision, 'defer')
  assert.deepEqual(result.warnings, ['Runtime code updates must use the signed application updater path.'])
})

test('custom policy can require approval for normal updates', () => {
  const policy = normalizeAgentUpdatePolicy({
    schema: 'movscript.agent-update-policy.v1',
    channel: 'beta',
    allowRuntimeCodeUpdates: false,
    rules: [
      {
        severity: 'normal',
        decision: 'require_approval',
        description: 'Workspace admin controls all behavior updates.',
      },
    ],
  })
  const result = evaluateAgentUpdateCandidate({
    id: 'movscript.prompt-pack',
    version: '2.0.0',
    kind: 'prompt',
    severity: 'normal',
    source: 'local',
  }, policy)

  assert.equal(policy.channel, 'beta')
  assert.equal(result.decision, 'require_approval')
})

test('buildAgentUpdateState evaluates valid pending candidates and keeps applied versions', () => {
  const state = buildAgentUpdateState({
    runtimeVersion: '0.1.0',
    manifestVersion: '0.1.0',
    applied: [
      {
        id: 'movscript.default.local-agent',
        version: '0.1.0',
        kind: 'policy',
        severity: 'normal',
        source: 'builtin',
      },
    ],
    candidates: [
      {
        id: 'movscript.safe-tool-fix',
        version: '0.1.1',
        kind: 'tool_catalog',
        severity: 'normal',
        source: 'local',
      },
      { id: '', version: 'bad' },
    ],
  })

  assert.equal(state.current.runtimeVersion, '0.1.0')
  assert.equal(state.applied.length, 1)
  assert.equal(state.pending.length, 1)
  assert.equal(state.pending[0].decision, 'auto_apply')
})

test('normalizeAgentUpdateCandidate drops metadata with non-finite JSON numbers', () => {
  const candidate = normalizeAgentUpdateCandidate({
    id: 'movscript.policy-pack',
    version: '1.0.0',
    kind: 'policy',
    severity: 'normal',
    source: 'local',
    metadata: { score: Number.POSITIVE_INFINITY },
  })

  assert.equal(candidate?.id, 'movscript.policy-pack')
  assert.equal(candidate?.metadata, undefined)
})
