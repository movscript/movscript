import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')

function readProjectFile(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

test('workspace stacked layout keeps page shell overlap and content safe area aligned', () => {
  const css = readProjectFile('packages/ui/src/components/layout/workspace/styles.css')

  assert.match(css, /--app-shell-stack-overlap:\s*24px;/)
  assert.match(css, /margin-left:\s*calc\(var\(--app-shell-stack-overlap\) \* -1\);/)
  assert.match(css, /box-shadow:\s*-12px 0 24px -24px rgb\(0 0 0 \/ 0\.34\);/)

  assert.match(
    css,
    /\.app-shell\[data-layout="stacked"\] \.app-shell__slot:has\(\+ \.app-shell__slot\) \{\s*padding-right:\s*var\(--app-shell-stack-overlap\);\s*\}/m,
  )
  assert.doesNotMatch(css, /padding-left:\s*var\(--app-shell-stack-overlap\);/)

  assert.match(css, /border-radius:\s*var\(--app-shell-slot-radius\);/)
  assert.match(css, /border-right:\s*1px solid var\(--ms-color-border\);/)
})

test('workspace stacked layout does not cover the collapsed left rail', () => {
  const css = readProjectFile('packages/ui/src/components/layout/workspace/styles.css')

  assert.match(
    css,
    /\.app-shell\[data-layout="stacked"\] \.app-shell__slot--left\[data-collapsed="true"\],[\s\S]*?padding-right:\s*0;/,
  )
  assert.match(
    css,
    /\.app-shell\[data-layout="stacked"\] \.app-shell__slot--left\[data-collapsed="true"\]\+\.app-shell__slot--center,[\s\S]*?margin-left:\s*0;[\s\S]*?box-shadow:\s*none;/,
  )
})
