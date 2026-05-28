import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('stacked app shell reserves overlap without shrinking pane content', () => {
  const workspaceStyles = readFileSync(resolve('../../packages/ui/src/components/layout/workspace/styles.css'), 'utf8')

  assert.match(
    workspaceStyles,
    /\.app-shell\[data-layout="stacked"\] \.app-shell__slot:has\(\+ \.app-shell__slot\) \{[\s\S]*box-sizing: content-box;[\s\S]*padding-right: var\(--app-shell-stack-overlap\);/,
  )
})
