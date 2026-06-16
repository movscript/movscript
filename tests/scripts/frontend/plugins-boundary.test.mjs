import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pluginsPageSource = readSource('apps/frontend/src/features/plugins/components/ClientPluginsPage.tsx')
const pluginsPageViewsSource = readSource('apps/frontend/src/features/plugins/components/ClientPluginsPageViews.tsx')

test('client plugins page delegates cards and marketplace view composition', () => {
  assert.match(pluginsPageSource, /from '@\/features\/plugins\/components\/ClientPluginsPageViews'/)
  assert.match(pluginsPageSource, /<MarketplaceView/)
  assert.match(pluginsPageSource, /<ProviderPluginCard/)
  assert.match(pluginsPageSource, /<PluginCard/)
  assert.doesNotMatch(pluginsPageSource, /function MarketplaceView/)
  assert.doesNotMatch(pluginsPageSource, /function ProviderPluginCard/)
  assert.doesNotMatch(pluginsPageSource, /function PluginCard/)
  assert.doesNotMatch(pluginsPageSource, /PluginMarketplaceToolbar/)
  assert.doesNotMatch(pluginsPageSource, /PluginSearchInput/)

  assert.match(pluginsPageViewsSource, /export function MarketplaceView/)
  assert.match(pluginsPageViewsSource, /export function ProviderPluginCard/)
  assert.match(pluginsPageViewsSource, /export function PluginCard/)
  assert.match(pluginsPageViewsSource, /PluginMarketplaceToolbar/)
  assert.match(pluginsPageViewsSource, /PluginSearchInput/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
