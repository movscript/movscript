import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

test('generation input uses the shared generation call composer architecture', () => {
  const source = readFileSync(resolve(__dirname, 'GenInputCard.tsx'), 'utf8')
  const toolDialogSource = readFileSync(resolve(__dirname, '../../features/tools/components/ToolDialog.tsx'), 'utf8')

  assert.match(source, /\bGenerationCallComposerForm\b/)
  assert.match(source, /\bGenerationCallPromptBlock\b/)
  assert.match(source, /\bGenerationCallConfigBlock\b/)
  assert.match(source, /\bGenerationCallMetaRow\b/)
  assert.match(source, /\bGenerationCallField\b/)
  assert.match(source, /\bGenerationCallBadge\b/)
  assert.match(source, /\bGenerationCallMessages\b/)
  assert.match(source, /\bGenerationCallFooter\b/)
  assert.match(source, /\bAgentComposerAction\b/)
  assert.match(source, /\bAgentComposerSubmit\b/)
  assert.match(source, /ms-agent-composer__rich-field/)
  assert.match(source, /intentLabel\?: ReactNode/)
  assert.match(source, /outputLabel\?: ReactNode/)
  assert.match(source, /modelControl\?: ReactNode/)
  assert.match(source, /messages\?: readonly ReactNode\[\]/)
  assert.match(source, /referenceAssets\?: readonly GenInputReferenceAsset\[\]/)
  assert.match(source, /\bGenerationReferenceRoleMenu\b/)
  assert.match(source, /\bgenerationReferenceRoleOptionsForMediaType\b/)
  assert.match(source, /formatResourceMention\(resourceId, \{\s*mediaType: el\.dataset\.mediaType \?\? asset\?\.media_type,\s*role: el\.dataset\.role \?\? asset\?\.role,/)
  assert.match(source, /buildResourceChipElement\(resource, \{\s*mediaType: metadata\.mediaType,\s*role: metadata\.role,/)
  assert.match(source, /sourceLabel: t\('shared\.generation\.referenceSource\.resource'/)
  assert.match(source, /resourceChipDisplayLabel\(\{/)
  assert.doesNotMatch(source, /resourceName[\s\S]{0,80}generationReferenceRoleLabel/)
  assert.match(source, /onRoleSelect=\{selectResourceRole\}/)
  assert.match(toolDialogSource, /intentLabel=\{generationIntentLabel\}/)
  assert.match(toolDialogSource, /outputLabel=\{generationOutputLabel\}/)
  assert.match(toolDialogSource, /modelControl=\{\(/)
  assert.match(toolDialogSource, /messages=\{\[/)
  assert.doesNotMatch(source, /\bGenerationInputRoot\b/)
  assert.doesNotMatch(source, /\bGenerationActionBar\b/)
  assert.doesNotMatch(source, /\bGenerationGenerateButton\b/)
  assert.doesNotMatch(source, /\bAgentComposerToolbar\b/)
})
