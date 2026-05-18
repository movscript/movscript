import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('canvas output push adds asset slot candidates instead of locking slots directly', () => {
  const source = readFileSync(resolve('src/pages/canvas/CanvasEditorPage.tsx'), 'utf8')
  const nodesSource = readFileSync(resolve('src/pages/canvas/components/CanvasNodes.tsx'), 'utf8')
  const domainCardSource = readFileSync(resolve('src/components/canvas/CanvasDomainEntityCard.tsx'), 'utf8')

  assert.match(source, /entities\/asset-slot-candidates/)
  assert.match(source, /invalidateAssetCandidateConsumers\(qc, canvas\.project_id\)/)
  assert.match(source, /已加入素材候选/)
  assert.doesNotMatch(source, /entities\/asset-slots\/\$\{target\.id\}[\s\S]*resource_id:\s*resourceId/)
  assert.doesNotMatch(source, /status:\s*'locked'/)
  assert.doesNotMatch(source, /role:\s*'final'/)

  assert.match(nodesSource, /label:\s*'加入候选'/)
  assert.doesNotMatch(nodesSource, /label:\s*'推送'/)
  assert.doesNotMatch(nodesSource, /'resource_id',\s*'locked_asset_slot_id'/)

  assert.match(domainCardSource, /label:\s*'加候选'[\s\S]*outputPortId:\s*'candidates'/)
  assert.doesNotMatch(domainCardSource, /outputPortId:\s*'locked_asset_slot_id'/)
  assert.doesNotMatch(domainCardSource, /label:\s*'锁定'/)
})
