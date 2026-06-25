import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('generation input uses the shared agent composer architecture', () => {
  const source = readFileSync(resolve('src/shared/ui/GenInputCard.tsx'), 'utf8')

  assert.match(source, /\bAgentComposer\b/)
  assert.match(source, /\bAgentComposerToolbar\b/)
  assert.match(source, /\bAgentComposerAction\b/)
  assert.match(source, /\bAgentComposerSubmit\b/)
  assert.match(source, /ms-agent-composer--panel/)
  assert.match(source, /ms-agent-composer__rich-field/)
  assert.doesNotMatch(source, /\bGenerationInputRoot\b/)
  assert.doesNotMatch(source, /\bGenerationActionBar\b/)
  assert.doesNotMatch(source, /\bGenerationGenerateButton\b/)
})
