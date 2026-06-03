import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentMessage } from '../../../state/shared/types.js'
import { runtimeModelContentText } from '../../../messages/model/modelMessage.js'
import { buildPromptBundle } from './promptBundle.js'
import { compilePromptBundleForProviderProjection, estimateRuntimeModelRequestChars } from './providerPromptProjectionCompiler.js'

test('compilePromptBundleForProviderProjection projects bundle sections into provider system messages', () => {
  const promptBundle = buildPromptBundle({
    approvedParts: [
      { id: 'runtime.core', kind: 'instruction', title: 'Runtime Contract', content: 'Runtime owns prompts.' },
      { id: 'context.summary', kind: 'context', title: 'Focus', content: 'Current project focus.' },
    ],
    history: [],
    userMessage: 'Continue',
  })
  const compiled = compilePromptBundleForProviderProjection(promptBundle)

  assert.equal(compiled.providerProjection.systemMessages.length, 2)
  assert.equal(compiled.promptBundle, promptBundle)
  assert.equal(compiled.providerProjection.schema, 'movscript.provider-prompt-projection.v1')
  assert.equal(compiled.providerProjection.promptBundleId, promptBundle.id)
  assert.deepEqual(compiled.providerProjection.systemMessageProjections.map((projection) => ({
    partId: projection.partId,
    authority: projection.authority,
  })), [
    { partId: 'runtime.core', authority: 'system' },
    { partId: 'context.summary', authority: 'data' },
  ])
  assert.equal(compiled.providerProjection.messages[0]?.role, 'system')
  assert.match(runtimeModelContentText(compiled.providerProjection.messages[0]?.content ?? []), /^## Runtime Contract\nRuntime owns prompts\./)
  assert.match(runtimeModelContentText(compiled.providerProjection.messages[1]?.content ?? []), /authority=data/)
  assert.match(compiled.providerProjection.systemPrompt, /authority=data/)
  assert.doesNotMatch(promptBundle.sectionPrompt, /authority=data/)
  assert.match(promptBundle.sectionPrompt, /## Focus\nCurrent project focus\./)
})

test('compilePromptBundleForProviderProjection uses bundle prompt history after runtime filtering', () => {
  const promptBundle = buildPromptBundle({
    approvedParts: [{ id: 'runtime.core', kind: 'instruction', title: 'Runtime', content: 'Runtime' }],
    history: [
      message({ id: 'status', role: 'assistant', content: 'SECRET_STATUS', metadata: { promptEligibility: 'exclude' } }),
      message({ id: 'assistant', role: 'assistant', content: 'visible answer' }),
    ],
    userMessage: 'next',
  })
  const compiled = compilePromptBundleForProviderProjection(promptBundle)
  const text = compiled.providerProjection.messages.map((item) => runtimeModelContentText(item.content)).join('\n')

  assert.doesNotMatch(text, /SECRET_STATUS/)
  assert.match(text, /visible answer/)
  assert.equal(compiled.providerProjection.messages.at(-1)?.role, 'user')
})

test('compilePromptBundleForProviderProjection sends image attachments as image parts and leaves videos metadata-only', () => {
  const promptBundle = buildPromptBundle({
    approvedParts: [],
    history: [],
    userMessage: 'inspect attachments',
    clientInput: {
      visibleMessage: 'inspect attachments',
      attachments: [
        {
          id: 'image_1',
          type: 'image',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AAAA',
        },
        {
          id: 'video_1',
          type: 'video',
          mimeType: 'video/mp4',
          dataUrl: 'data:image/png;base64,BBBB',
        },
      ],
    },
  })
  const compiled = compilePromptBundleForProviderProjection(promptBundle)
  const user = compiled.providerProjection.messages.at(-1)

  assert.equal(user?.role, 'user')
  assert.equal(user?.content.filter((part) => part.type === 'image').length, 1)
  assert.equal(user?.content.find((part) => part.type === 'image')?.source.type, 'data_url')
  assert.equal(estimateRuntimeModelRequestChars(compiled.providerProjection.messages) > 0, true)
})

function message(input: {
  id: string
  role: AgentMessage['role']
  content: string
  metadata?: AgentMessage['metadata']
}): AgentMessage {
  return {
    id: input.id,
    threadId: 'thread_1',
    role: input.role,
    content: input.content,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
}
