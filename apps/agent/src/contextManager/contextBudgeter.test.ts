import assert from 'node:assert/strict'
import test from 'node:test'
import { fitPromptPartsToBudget } from './contextBudgeter.js'

test('context budgeter drops low-priority skill parts before high-priority behavior', () => {
  const warnings: string[] = []
  const fitted = fitPromptPartsToBudget({
    limit: 180,
    warnings,
    parts: [
      { id: 'runtime.core', kind: 'policy', title: 'Runtime', content: 'runtime contract' },
      { id: 'skill.low', kind: 'skill', title: 'Low', content: 'low '.repeat(100) },
      { id: 'skill.high', kind: 'skill', title: 'High', content: 'high behavior' },
    ],
    priorityOfPart: (part) => part.id === 'skill.low' ? 50 : 100,
  })

  assert.equal(fitted.parts.some((part) => part.id === 'skill.low'), false)
  assert.equal(fitted.parts.some((part) => part.id === 'skill.high'), true)
  assert.equal(fitted.degraded, 'dropped_policies')
  assert.equal(fitted.warnings, warnings)
  assert.ok(warnings.some((warning) => warning.includes('dropped non-critical skill skill.low')))
  assert.equal(fitted.initialPromptChars > fitted.finalPromptChars, true)
  assert.deepEqual(fitted.decisions.map((decision) => ({
    action: decision.action,
    stage: decision.stage,
    partId: decision.partId,
    renderedChars: decision.renderedChars,
    priority: decision.priority,
  })), [{
    action: 'drop',
    stage: 'low_priority',
    partId: 'skill.low',
    renderedChars: 0,
    priority: 50,
  }])
})

test('context budgeter strips examples before failing an otherwise required prompt', () => {
  const fitted = fitPromptPartsToBudget({
    limit: 120,
    parts: [
      {
        id: 'runtime.core',
        kind: 'policy',
        title: 'Runtime',
        content: [
          'Keep the runtime contract.',
          'Examples:',
          'example '.repeat(80),
        ].join('\n'),
      },
    ],
  })

  assert.equal(fitted.degraded, 'dropped_examples')
  assert.doesNotMatch(fitted.prompt, /example example/)
  assert.ok(fitted.prompt.length <= 120)
  assert.equal(fitted.decisions[0]?.action, 'strip_examples')
  assert.equal(fitted.decisions[0]?.stage, 'examples')
  assert.equal(fitted.decisions[0]?.partId, 'runtime.core')
  assert.ok((fitted.decisions[0]?.renderedChars ?? 0) > 0)
  assert.ok((fitted.decisions[0]?.originalChars ?? 0) > (fitted.decisions[0]?.renderedChars ?? 0))
})

test('context budgeter supports composer-specific policy and workflow drop rules', () => {
  const fitted = fitPromptPartsToBudget({
    limit: 160,
    parts: [
      { id: 'policy.low', kind: 'policy', title: 'Low Policy', content: 'policy '.repeat(40) },
      { id: 'workflow.low', kind: 'workflow', title: 'Workflow', content: 'workflow '.repeat(40) },
      { id: 'persona.keep', kind: 'persona', title: 'Persona', content: 'persona' },
    ],
    priorityOfPart: (part) => part.id === 'policy.low' ? 50 : 100,
    lowPriorityDropPredicate: (part) => part.kind === 'policy' && part.id === 'policy.low',
    lowPriorityDropWarning: (part) => `drop policy ${part.id}`,
    secondaryDropPredicate: (part) => part.kind === 'workflow',
    secondaryDropWarning: (part) => `drop workflow ${part.id}`,
  })

  assert.deepEqual(fitted.parts.map((part) => part.id), ['persona.keep'])
  assert.equal(fitted.degraded, 'dropped_workflows')
  assert.deepEqual(fitted.warnings, ['drop policy policy.low', 'drop workflow workflow.low'])
  assert.deepEqual(fitted.decisions.map((decision) => `${decision.stage}:${decision.partId}`), [
    'low_priority:policy.low',
    'secondary:workflow.low',
  ])
})
