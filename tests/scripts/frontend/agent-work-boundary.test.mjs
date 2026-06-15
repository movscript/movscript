import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

function readSource(relativePath) {
  return readFileSync(resolve(relativePath), 'utf8')
}

const agentPackageSource = readSource('packages/ui/src/components/business/agent/index.tsx')
const agentPackageCss = readSource('packages/ui/src/components/business/agent/styles.css')

test('unused agent work shell is not shipped from packages/ui', () => {
  assert.equal(existsSync(resolve('packages/ui/src/components/business/agent/work')), false)
  assert.doesNotMatch(agentPackageSource, /export \* from "\.\/work"/)
  assert.doesNotMatch(agentPackageCss, /@import "\.\/work\/styles\.css"/)
})
