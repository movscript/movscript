import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('app settings feedback icon layout is selected by explicit data', () => {
  const settingsSource = readFileSync(resolve('src/features/settings/components/AppSettingsUi.tsx'), 'utf8')
  const settingsStyles = readFileSync(resolve('src/features/settings/components/AppSettingsUi.css'), 'utf8')

  assert.match(settingsSource, /data-has-icon=\{icon \? ['"]true['"] : undefined\}/)
  assert.match(settingsStyles, /\.app-settings-feedback\[data-has-icon="true"\] \{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*gap: 6px;/)
  assert.doesNotMatch(settingsStyles, /\.app-settings-feedback:has\(svg\)/)
})
