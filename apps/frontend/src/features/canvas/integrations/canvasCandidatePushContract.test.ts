import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function frontendSourcePath(relativePath: string) {
  const appRelativePath = resolve('src', relativePath)
  if (existsSync(appRelativePath)) return appRelativePath
  return resolve('apps/frontend/src', relativePath)
}

test('canvas does not expose entity push actions', () => {
  const typesSource = readFileSync(frontendSourcePath('types/index.ts'), 'utf8')
  const nodeDefinitionsSource = readFileSync(frontendSourcePath('features/canvas/domain/nodeDefinitions.ts'), 'utf8')
  const source = readFileSync(frontendSourcePath('features/canvas/components/CanvasEditorPage.tsx'), 'utf8')
  const integrationSource = readFileSync(frontendSourcePath('features/canvas/integrations/resources.ts'), 'utf8')
  const nodeUiSources = [
    'features/canvas/ui/CanvasNodes.tsx',
    'features/canvas/ui/canvasAssetNodes.tsx',
    'features/canvas/ui/canvasGenerationNodes.tsx',
    'features/canvas/ui/canvasGroupNodes.tsx',
    'features/canvas/ui/canvasIoNodes.tsx',
  ].map((path) => readFileSync(frontendSourcePath(path), 'utf8')).join('\n')

  assert.doesNotMatch(typesSource, /CanvasEntityKind/)
  assert.doesNotMatch(typesSource, /entityKind\?:/)
  assert.doesNotMatch(typesSource, /entityId\?:/)
  assert.doesNotMatch(typesSource, /entityTitle\?:/)
  assert.doesNotMatch(typesSource, /assetSlotKind\?:/)
  assert.match(typesSource, /export type SemanticEntityKind/)
  assert.doesNotMatch(nodeDefinitionsSource, /type:\s*['"]entity['"]/)
  assert.doesNotMatch(nodeDefinitionsSource, /semantic groups/)

  assert.doesNotMatch(source, /pushTargets/)
  assert.doesNotMatch(source, /pushResource/)
  assert.doesNotMatch(source, /onPush/)
  assert.doesNotMatch(integrationSource, /CanvasPushTarget/)
  assert.doesNotMatch(integrationSource, /entities\/asset-slot-candidates/)
  assert.doesNotMatch(integrationSource, /invalidateAssetCandidateConsumers/)
  assert.doesNotMatch(integrationSource, /已加入素材候选/)
  assert.doesNotMatch(integrationSource, /entities\/asset-slots\/\$\{target\.id\}[\s\S]*resource_id:\s*resourceId/)
  assert.doesNotMatch(integrationSource, /status:\s*'locked'/)
  assert.doesNotMatch(integrationSource, /role:\s*'final'/)

  assert.doesNotMatch(nodeUiSources, /function PushBtn/)
  assert.doesNotMatch(nodeUiSources, /Share2/)
  assert.doesNotMatch(nodeUiSources, /label:\s*'加入候选'/)
  assert.doesNotMatch(nodeUiSources, /onPush/)
  assert.doesNotMatch(nodeUiSources, /label:\s*'推送'/)
  assert.doesNotMatch(nodeUiSources, /'resource_id',\s*'locked_asset_slot_id'/)

  assert.equal(existsSync(frontendSourcePath('components/canvas/CanvasDomainEntityCard.tsx')), false)
  assert.equal(existsSync(frontendSourcePath('components/canvas/CanvasEntityActionCard.tsx')), false)
  assert.equal(existsSync(frontendSourcePath('components/canvas/CanvasCandidateGroupCard.tsx')), false)
})
