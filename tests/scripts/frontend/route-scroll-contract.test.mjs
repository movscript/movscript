import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')

function readProjectFile(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

test('route viewport provides a default page-level scroll boundary', () => {
  const layoutSource = readProjectFile('packages/ui/src/components/layout/index.tsx')
  const layoutCss = readProjectFile('packages/ui/src/components/layout/styles.css')

  assert.match(layoutSource, /export type AppRouteViewportScroll = "auto" \| "owned" \| "hidden";/)
  assert.match(layoutSource, /export function AppRouteViewport/)
  assert.match(layoutSource, /scroll = "auto"/)

  assert.match(layoutCss, /\.app-route-viewport\s*\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/)
  assert.match(layoutCss, /\.app-route-viewport\[data-scroll="auto"\]\s*\{[\s\S]*?overflow:\s*auto;/)
  assert.match(
    layoutCss,
    /\.app-route-viewport\[data-scroll="owned"\],[\s\S]*?\.app-route-viewport\[data-scroll="hidden"\]\s*\{[\s\S]*?overflow:\s*hidden;/,
  )
})

test('app shell routes are wrapped in an explicit route viewport', () => {
  const appSource = readProjectFile('apps/frontend/src/App.tsx')

  assert.match(appSource, /AppRouteViewport/)
  assert.match(appSource, /<AppRouteViewport scroll="auto">\s*<RouteErrorBoundary>\{children\}<\/RouteErrorBoundary>\s*<\/AppRouteViewport>/)
  assert.match(appSource, /<AppRouteViewport scroll="owned">\s*<RouteErrorBoundary>\s*<CanvasEditorPage embeddedInShell \/>/)
})
