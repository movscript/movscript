import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('canvas generation nodes expose explicit operation selection', () => {
  const source = readFileSync('surface/canvas/src/features/ui/canvasGenerationNodes.tsx', 'utf8')
  const inputPanelSource = readFileSync('surface/canvas/src/features/ui/canvasGenerationInputPanel.tsx', 'utf8')
  const renderModel = readFileSync('surface/canvas/src/features/presentation/useCanvasEditorRenderModel.ts', 'utf8')

  assert.match(source, /\bCanvasGenerationCallPanel\b/)
  assert.match(source, /\bGenerationCallComposerRoot\b/)
  assert.match(source, /\bGenerationCallPromptBlock\b/)
  assert.match(source, /\bGenerationCallConfigBlock\b/)
  assert.match(source, /\bGenerationCallMetaRow\b/)
  assert.match(source, /\bGenerationCallField\b/)
  assert.match(source, /\bGenerationCallBadge\b/)
  assert.match(source, /canvasOperationOptionsForNode/)
  assert.match(source, /canvas\.nodePanel\.operation/)
  assert.match(source, /onUpdateModelOperation/)
  assert.match(source, /surfaceModelReferenceAssetsKey\(referenceAssets\)/)
  assert.match(source, /modelKeys\.intent\(capability, operation, referenceAssetsKey\)/)
  assert.match(source, /canvasGenerationModelQuery\(capability, operation, referenceAssets\)/)
  assert.match(inputPanelSource, /parseResourceMentions\(prompt\)/)
  assert.match(inputPanelSource, /\bGenerationReferenceRoleMenu\b/)
  assert.match(inputPanelSource, /\bgenerationReferenceRoleOptionsForMediaType\b/)
  assert.match(inputPanelSource, /formatResourceMention\(Number\(el\.dataset\.resourceId\), \{\s*mediaType: el\.dataset\.mediaType,\s*role: el\.dataset\.role,/)
  assert.match(inputPanelSource, /onRoleSelect=\{selectResourceRole\}/)
  assert.match(renderModel, /onUpdateModelOperation:[\s\S]*modelId: undefined/)
})
