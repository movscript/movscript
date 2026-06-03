import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyPromptDebugPart,
  promptFragmentForDebugPart,
} from './promptFragments.js'

test('classifyPromptDebugPart treats runtime policy as system-owned run contract', () => {
  assert.deepEqual(
    classifyPromptDebugPart({ id: 'runtime.core', kind: 'runtime' }),
    {
      source: 'runtime_policy',
      owner: 'runtime',
      layer: 'runtime_policy',
      lifecycle: 'run',
      trustLevel: 'runtime',
      instructionAuthority: 'system',
      promptEligibility: 'eligible',
      inclusionReason: 'runtime contract is required for every model turn',
    },
  )
})

test('classifyPromptDebugPart keeps data context separate from executable instruction authority', () => {
  assert.equal(classifyPromptDebugPart({ id: 'context.summary', kind: 'context' }).instructionAuthority, 'data')
  assert.equal(classifyPromptDebugPart({ id: 'thread.continuity', kind: 'context' }).source, 'thread_summary')
  assert.equal(classifyPromptDebugPart({ id: 'context.memories', kind: 'context' }).trustLevel, 'advisory')
})

test('classifyPromptDebugPart grants developer authority only to runtime-approved behavior sources', () => {
  assert.equal(classifyPromptDebugPart({ id: 'command.plan', kind: 'command' }).instructionAuthority, 'developer')
  assert.equal(classifyPromptDebugPart({ id: 'tools.available', kind: 'tool' }).instructionAuthority, 'developer')
  assert.equal(classifyPromptDebugPart({ id: 'skill.test', kind: 'skill' }).instructionAuthority, 'developer')
  assert.equal(classifyPromptDebugPart({ id: 'skills.discovery', kind: 'skill' }).instructionAuthority, 'advisory')
})

test('promptFragmentForDebugPart records stable content hash without exposing prompt content', () => {
  const first = promptFragmentForDebugPart({
    id: 'runtime.core',
    kind: 'runtime',
    title: 'Runtime',
    content: 'Runtime owns prompts.',
  })
  const second = promptFragmentForDebugPart({
    id: 'runtime.core',
    kind: 'runtime',
    title: 'Runtime',
    content: 'Runtime owns prompts.',
  })

  assert.equal(first.contentHash, second.contentHash)
  assert.match(first.contentHash, /^sha256:[a-f0-9]{64}$/)
  assert.equal(first.renderMode, 'system_message')
  assert.equal(first.budgetPriority, 100)
})

