import assert from 'node:assert/strict'
import test from 'node:test'

import { agentChatSystemItemView } from '@/features/agent/domain/agentChatSystemItemViews'

test('agent chat system item view summarizes approval reviews and permission context', () => {
  const view = agentChatSystemItemView({
    type: 'approvalReview',
    id: 'approval_review_1',
    reviewId: 'review_1',
    lifecycle: 'completed',
    targetItemId: 'cmd_1',
    startedAtMs: 100,
    completedAtMs: 250,
    reviewStatus: 'approved',
    riskLevel: 'medium',
    rationale: 'Command is read-only.',
    decisionSource: 'strict-auto-review',
    action: {
      type: 'requestPermissions',
      reason: 'Need workspace access',
      permissions: {
        network: { enabled: false },
        fileSystem: {
          read: ['/repo'],
          write: ['/repo/out'],
          entries: [{ access: 'read', path: '/repo/README.md' }],
          globScanMaxDepth: 4,
        },
      },
    },
    review: { status: 'approved' },
  })

  assert.equal(view.title, 'Approval review completed')
  assert.equal(view.tone, 'result')
  assert.deepEqual(view.meta, ['approved', 'medium', 'strict-auto-review'])
  assert.equal(view.detail, [
    'target: cmd_1',
    'status: approved',
    'risk: medium',
    'decision: strict-auto-review',
    'action: requestPermissions',
    'rationale: Command is read-only.',
  ].join('\n'))
  assert.deepEqual(view.timeline, ['started: 100', 'completed: 250', 'duration: 150ms'])
  assert.deepEqual(view.actionContext, [
    'reason: Need workspace access',
    'network: disabled',
    'fs read: 1 path(s)',
    'fs read: /repo',
    'fs write: 1 path(s)',
    'fs write: /repo/out',
    'fs entries: 1',
    'fs entry: read /repo/README.md',
    'glob scan max depth: 4',
  ])
  assert.deepEqual(view.reviewDetails, { status: 'approved' })
})

test('agent chat system item view marks risky reviews and warnings diagnostic', () => {
  assert.deepEqual(agentChatSystemItemView({
    type: 'systemNotice',
    id: 'notice_1',
    level: 'warning',
    title: 'Model rerouted',
    detail: 'capacity',
    code: 'model/rerouted',
    threadId: 'thread_1',
    turnId: 'turn_1',
  }), {
    title: 'Model rerouted',
    detail: 'capacity',
    meta: ['warning', 'model/rerouted', 'thread thread_1', 'turn turn_1'],
    tone: 'diagnostic',
    timeline: [],
    actionContext: [],
  })

  const review = agentChatSystemItemView({
    type: 'approvalReview',
    id: 'approval_review_2',
    reviewId: 'review_2',
    lifecycle: 'completed',
    targetItemId: null,
    startedAtMs: null,
    completedAtMs: null,
    reviewStatus: 'denied',
    riskLevel: 'critical',
    decisionSource: null,
    action: { type: 'networkAccess', target: 'api.example.com:443', protocol: 'https', host: 'api.example.com', port: 443 },
  })
  assert.equal(review.tone, 'diagnostic')
  assert.match(review.detail, /action: networkAccess: api\.example\.com/)
  assert.deepEqual(review.actionContext, ['target: api.example.com:443', 'protocol: https', 'port: 443'])
})

test('agent chat system item view summarizes compaction and unknown raw items', () => {
  assert.deepEqual(agentChatSystemItemView({
    type: 'contextCompaction',
    id: 'compact_1',
    raw: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      reason: 'token budget',
      previousTokens: 42000,
      nextTokens: 12000,
      removedTokens: 30000,
    },
  }), {
    title: 'Context compacted',
    detail: [
      'thread: thread_1',
      'turn: turn_1',
      'reason: token budget',
      'previous tokens: 42000',
      'next tokens: 12000',
      'removed tokens: 30000',
    ].join('\n'),
    meta: [],
    tone: 'process',
    timeline: [],
    actionContext: [],
    rawDetailsLabel: 'Compaction details',
    rawDetails: {
      threadId: 'thread_1',
      turnId: 'turn_1',
      reason: 'token budget',
      previousTokens: 42000,
      nextTokens: 12000,
      removedTokens: 30000,
    },
  })

  assert.deepEqual(agentChatSystemItemView({
    type: 'unknown',
    id: 'future_1',
    providerType: 'futureItem',
    raw: { id: 'future_1', type: 'futureItem', status: 'streaming' },
  }), {
    title: 'Unknown item: futureItem',
    detail: ['id: future_1', 'provider type: futureItem', 'status: streaming'].join('\n'),
    meta: [],
    tone: 'neutral',
    timeline: [],
    actionContext: [],
    rawDetailsLabel: 'Raw item',
    rawDetails: { id: 'future_1', type: 'futureItem', status: 'streaming' },
  })
})
