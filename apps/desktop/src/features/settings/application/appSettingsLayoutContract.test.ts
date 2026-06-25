import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const testDir = dirname(fileURLToPath(import.meta.url))
const frontendRoot = resolve(testDir, '../../../..')
const repoRoot = resolve(frontendRoot, '../..')

test('app settings feedback icon layout is selected by explicit data', () => {
  const settingsSource = readFileSync(resolve(frontendRoot, 'src/features/settings/components/AppSettingsUi.tsx'), 'utf8')
  const settingsStyles = readFileSync(resolve(frontendRoot, 'src/features/settings/components/AppSettingsUi.css'), 'utf8')

  assert.match(settingsSource, /data-has-icon=\{icon \? ['"]true['"] : undefined\}/)
  assert.match(settingsStyles, /\.app-settings-feedback\[data-has-icon="true"\] \{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*gap: 6px;/)
  assert.doesNotMatch(settingsStyles, /\.app-settings-feedback:has\(svg\)/)
})

test('app settings exposes a native directory picker for MovScript Home', () => {
  const pageSource = readFileSync(resolve(frontendRoot, 'src/features/settings/components/AppSettingsPage.tsx'), 'utf8')
  const sectionsSource = readFileSync(resolve(frontendRoot, 'src/features/settings/components/AppSettingsSections.tsx'), 'utf8')
  const dialogPreloadSource = readFileSync(resolve(repoRoot, 'apps/desktop/electron/preload/api/dialog.ts'), 'utf8')
  const dialogIpcSource = readFileSync(resolve(repoRoot, 'apps/desktop/electron/ipc/dialogIpc.ts'), 'utf8')

  assert.match(pageSource, /readElectronApi\(\)\?\.openDirectory\?\.\(\)/)
  assert.match(sectionsSource, /movScriptWorkspaceChooseDirectory/)
  assert.match(dialogPreloadSource, /openDirectory: \(\) => ipcRenderer\.invoke\('dialog:openDirectory'\)/)
  assert.match(dialogIpcSource, /ipcMain\.handle\('dialog:openDirectory'/)
  assert.match(dialogIpcSource, /properties: \['openDirectory', 'createDirectory'\]/)
})
