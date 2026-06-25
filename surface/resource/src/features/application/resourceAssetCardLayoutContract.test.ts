import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('resource asset card selection affordance uses explicit card selected state', () => {
  const assetCardSource = readFileSync(resolve('../../packages/ui/src/components/business/resource/asset-card/index.tsx'), 'utf8')
  const assetCardStyles = readFileSync(resolve('../../packages/ui/src/components/business/resource/asset-card/styles.css'), 'utf8')

  assert.match(assetCardSource, /data-selected=\{selected \? "true" : undefined\}/)
  assert.match(assetCardStyles, /\.resource-asset-card\[data-selected="true"\] \.resource-asset-card__select-control \{[\s\S]*opacity: 1;/)
  assert.doesNotMatch(assetCardStyles, /\.resource-asset-card__select-control:has\(:checked\)/)
})
