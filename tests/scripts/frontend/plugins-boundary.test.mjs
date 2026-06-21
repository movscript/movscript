import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pluginsPageSource = readSource('apps/frontend/src/features/plugins/components/ClientPluginsPage.tsx')
const pluginsPageViewsSource = readSource('apps/frontend/src/features/plugins/components/ClientPluginsPageViews.tsx')
const pluginsPageUiSource = readSource('apps/frontend/src/features/plugins/components/PluginsPageUi.tsx')
const pluginsToolPageSource = readSource('apps/frontend/src/features/plugins/components/PluginToolPage.tsx')
const pluginsToolUiSource = readSource('apps/frontend/src/features/plugins/components/PluginsToolUi.tsx')

test('client plugins page delegates cards and marketplace view composition', () => {
  assert.match(pluginsPageSource, /from '@\/features\/plugins\/components\/ClientPluginsPageViews'/)
  assert.match(pluginsPageSource, /<MarketplaceView/)
  assert.match(pluginsPageSource, /<SystemPluginCard/)
  assert.match(pluginsPageSource, /<PluginCard/)
  assert.doesNotMatch(pluginsPageSource, /function MarketplaceView/)
  assert.doesNotMatch(pluginsPageSource, /function SystemPluginCard/)
  assert.doesNotMatch(pluginsPageSource, /function PluginCard/)
  assert.doesNotMatch(pluginsPageSource, /PluginMarketplaceToolbar/)
  assert.doesNotMatch(pluginsPageSource, /PluginSearchInput/)

  assert.match(pluginsPageViewsSource, /export function MarketplaceView/)
  assert.match(pluginsPageViewsSource, /export function SystemPluginCard/)
  assert.match(pluginsPageViewsSource, /export function PluginCard/)
  assert.match(pluginsPageViewsSource, /PluginMarketplaceToolbar/)
  assert.match(pluginsPageViewsSource, /PluginSearchInput/)
})

test('plugin tool route owns tool wrappers outside the plugins page ui module', () => {
  assert.match(pluginsToolPageSource, /from '@\/features\/plugins\/components\/PluginsToolUi'/)
  assert.doesNotMatch(pluginsToolPageSource, /from '@\/features\/plugins\/components\/PluginsPageUi'/)

  assert.doesNotMatch(pluginsPageUiSource, /export (?:function|const) PluginTool[A-Z]/)
  assert.match(pluginsToolUiSource, /export function PluginToolRoot/)
  assert.match(pluginsToolUiSource, /export function PluginToolSurface/)
  assert.match(pluginsToolUiSource, /export const PluginToolIframe/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
