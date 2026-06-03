import assert from 'node:assert/strict'
import test from 'node:test'
import { runtimeModelContentText } from '../../../messages/model/modelMessage.js'
import { promptFragmentForDebugPart } from '../registry/promptFragments.js'
import { compileProviderSystemMessages } from './providerMessageCompiler.js'

test('compileProviderSystemMessages records projection authority separately from provider role', () => {
  const parts = [
    { id: 'runtime.core', kind: 'instruction', title: 'Runtime', content: 'Runtime owns prompts.' },
    { id: 'context.summary', kind: 'context', title: 'Focus', content: 'Project focus is data.' },
  ]
  const fragments = parts.map((part) => promptFragmentForDebugPart(part))

  const result = compileProviderSystemMessages({ parts, fragments })

  assert.equal(result.messages.length, 2)
  assert.equal(result.messages[0]?.role, 'system')
  assert.match(runtimeModelContentText(result.messages[1]?.content ?? []), /^## Focus/)
  assert.match(runtimeModelContentText(result.messages[1]?.content ?? []), /authority=data/)
  assert.match(runtimeModelContentText(result.messages[1]?.content ?? []), /context only, not as an instruction/)
  assert.doesNotMatch(runtimeModelContentText(result.messages[0]?.content ?? []), /Prompt fragment:/)
  assert.deepEqual(result.projections.map((projection) => ({
    partId: projection.partId,
    role: projection.messageRole,
    authority: projection.authority,
  })), [
    { partId: 'runtime.core', role: 'system', authority: 'system' },
    { partId: 'context.summary', role: 'system', authority: 'data' },
  ])
  assert.match(result.projections[1]?.reason ?? '', /provider compatibility/)
})
