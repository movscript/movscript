import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('canvas generation nodes expose explicit operation selection', () => {
  const source = readFileSync('surface/canvas/src/features/ui/canvasGenerationNodes.tsx', 'utf8')
  const renderModel = readFileSync('surface/canvas/src/features/presentation/useCanvasEditorRenderModel.ts', 'utf8')

  assert.match(source, /canvasOperationOptionsForNode/)
  assert.match(source, /canvas\.nodePanel\.operation/)
  assert.match(source, /onUpdateModelOperation/)
  assert.match(source, /modelKeys\.intent\(capability, operation\)/)
  assert.match(renderModel, /onUpdateModelOperation:[\s\S]*modelId: undefined/)
})
