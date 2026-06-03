import assert from 'node:assert/strict'
import test from 'node:test'
import { fitTextSectionsToBudget } from './textSectionBudgeter.js'

test('text section budgeter drops low-priority skill parts before high-priority behavior', () => {
  const warnings: string[] = []
  const fitted = fitTextSectionsToBudget({
    limit: 180,
    warnings,
    parts: [
      { id: 'runtime.core', kind: 'instruction', title: 'Runtime', content: 'runtime contract' },
      { id: 'skill.low', kind: 'skill', title: 'Low', content: 'low '.repeat(100) },
      { id: 'skill.high', kind: 'skill', title: 'High', content: 'high behavior' },
    ],
    priorityOfPart: (part) => part.id === 'skill.low' ? 50 : 100,
  })

  assert.equal(fitted.parts.some((part) => part.id === 'skill.low'), false)
  assert.equal(fitted.parts.some((part) => part.id === 'skill.high'), true)
  assert.equal(fitted.degraded, 'dropped_low_priority_skills')
  assert.equal(fitted.warnings, warnings)
  assert.ok(warnings.some((warning) => warning.includes('dropped low-priority section skill.low')))
  assert.equal(fitted.initialTextChars > fitted.finalTextChars, true)
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

test('text section budgeter strips examples before failing otherwise required text', () => {
  const fitted = fitTextSectionsToBudget({
    limit: 120,
    parts: [
      {
        id: 'runtime.core',
        kind: 'instruction',
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
  assert.doesNotMatch(fitted.text, /example example/)
  assert.ok(fitted.text.length <= 120)
  assert.equal(fitted.decisions[0]?.action, 'strip_examples')
  assert.equal(fitted.decisions[0]?.stage, 'examples')
  assert.equal(fitted.decisions[0]?.partId, 'runtime.core')
  assert.ok((fitted.decisions[0]?.renderedChars ?? 0) > 0)
  assert.ok((fitted.decisions[0]?.originalChars ?? 0) > (fitted.decisions[0]?.renderedChars ?? 0))
})

test('text section budgeter supports caller-specific low-priority and secondary drop rules', () => {
  const fitted = fitTextSectionsToBudget({
    limit: 160,
    parts: [
      { id: 'instruction.keep', kind: 'instruction', title: 'Runtime', content: 'runtime' },
      { id: 'skill.low', kind: 'skill', title: 'Low Skill', content: 'skill '.repeat(40) },
      { id: 'skill.example', kind: 'skill', title: 'Skill', content: 'task '.repeat(40) },
    ],
    priorityOfPart: (part) => part.id === 'skill.low' ? 50 : 100,
    lowPriorityDropPredicate: (part) => part.kind === 'skill' && part.id === 'skill.low',
    lowPriorityDropWarning: (part) => `drop low priority skill ${part.id}`,
    secondaryDropPredicate: (part) => part.kind === 'skill',
    secondaryDropWarning: (part) => `drop skill ${part.id}`,
  })

  assert.deepEqual(fitted.parts.map((part) => part.id), ['instruction.keep'])
  assert.equal(fitted.degraded, 'dropped_skills')
  assert.deepEqual(fitted.warnings, ['drop low priority skill skill.low', 'drop skill skill.example'])
  assert.deepEqual(fitted.decisions.map((decision) => `${decision.stage}:${decision.partId}`), [
    'low_priority:skill.low',
    'secondary:skill.example',
  ])
})
