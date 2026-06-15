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
  const shellLayoutSource = readProjectFile('apps/frontend/src/features/app-shell/application/AppShellLayout.tsx')
  const canvasShellRouteSource = readProjectFile('apps/frontend/src/features/app-shell/application/AppCanvasEditorShellRoute.tsx')

  assert.match(shellLayoutSource, /AppRouteViewport/)
  assert.match(shellLayoutSource, /<AppRouteViewport scroll=\{routeViewportScroll\}>[\s\S]*?<RouteErrorBoundary>[\s\S]*?<RouteSuspense>\{children\}<\/RouteSuspense>[\s\S]*?<\/RouteErrorBoundary>[\s\S]*?<\/AppRouteViewport>/)
  assert.match(canvasShellRouteSource, /AppRouteViewport/)
  assert.match(canvasShellRouteSource, /<AppRouteViewport scroll=\{appRouteViewportScrollForMode\(routeLayout\.scrollMode\)\}>[\s\S]*?<RouteErrorBoundary>[\s\S]*?<CanvasEditorPage embeddedInShell \/>/)
})
