import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { routeLayoutSpecForPathname } from '@/routes/routeLayoutRegistry'
import { PLUGIN_TOOL_NATIVE_MAIN_PANE_ID } from '@/features/plugins/presentation/pluginToolLayoutSpec'

test('plugin tool route declares and renders the native host layout pane', () => {
  const route = routeLayoutSpecForPathname('/tools/plugin/example-plugin')
  assert.equal(route.scrollMode, 'workspace')
  assert.match(route.notes ?? '', /native disabled host layout/)

  const nativeMainPane = route.panes.find((pane) => pane.id === PLUGIN_TOOL_NATIVE_MAIN_PANE_ID)
  assert.equal(nativeMainPane?.owner, 'workbench')
  assert.equal(nativeMainPane?.side, 'left')
  assert.equal(nativeMainPane?.overlapMode, 'none')

  const pageSource = readFileSync(resolve('src/features/plugins/components/PluginToolPage.tsx'), 'utf8')
  assert.match(pageSource, /data-layout-pane-id=\{PLUGIN_TOOL_NATIVE_MAIN_PANE_ID\}/)
})
