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

test('app settings surfaces the Desktop runtime descriptor summary', () => {
  const pageSource = readFileSync(resolve(frontendRoot, 'src/features/settings/components/AppSettingsPage.tsx'), 'utf8')
  const sectionsSource = readFileSync(resolve(frontendRoot, 'src/features/settings/components/AppSettingsSections.tsx'), 'utf8')
  const zhCN = readFileSync(resolve(frontendRoot, 'src/i18n/locales/zh-CN.json'), 'utf8')
  const enUS = readFileSync(resolve(frontendRoot, 'src/i18n/locales/en-US.json'), 'utf8')

  assert.match(pageSource, /refreshRuntimeConfigSnapshot\(\)/)
  assert.match(pageSource, /runtimeConfig=\{runtimeConfig\}/)
  assert.match(pageSource, /applyRuntimeBundleAction\(\{ action \}\)/)
  assert.match(pageSource, /runtimeBundleActionState=\{runtimeBundleActionState\}/)
  assert.match(sectionsSource, /runtimeConfig: ElectronRuntimeConfig \| null/)
  assert.match(sectionsSource, /applyRuntimeBundleAction: \(\) => void/)
  assert.match(sectionsSource, /runtimeConfig\?\.movScriptHomeDir/)
  assert.match(sectionsSource, /runtimeConfig\?\.runtime\.runtime\.name/)
  assert.match(sectionsSource, /runtimeConfig\?\.runtimeConnection\.gatewayBaseURL/)
  assert.match(sectionsSource, /runtimePluginCurrentLabel\(runtimeConfig\)/)
  assert.match(sectionsSource, /runtimeBundleStatusLabel\(runtimeConfig, t\)/)
  assert.match(sectionsSource, /runtimeBundleActionCanApply\(runtimeConfig\)/)
  assert.match(sectionsSource, /runtimeBundleActionButtonLabel\(runtimeConfig, t\)/)
  assert.match(sectionsSource, /if \(action === 'rollback'\) return t\('appSettings\.runtimeBundleApplyRollback'\)/)
  assert.match(sectionsSource, /runtimeCompatibilityLabel\(runtimeConfig\)/)
  assert.match(zhCN, /"runtimeOverviewTitle": "本机 Runtime"/)
  assert.match(zhCN, /"runtimeBundleStatus": "Runtime bundle"/)
  assert.match(zhCN, /"upgrade": "可升级"/)
  assert.match(zhCN, /"rollback": "可回退"/)
  assert.match(zhCN, /"runtimeBundleApplyUpgrade": "升级 Home current"/)
  assert.match(zhCN, /"runtimeBundleApplyRollback": "回退到 previous"/)
  assert.match(enUS, /"runtimeOverviewTitle": "Local Runtime"/)
  assert.match(enUS, /"runtimeBundleStatus": "Runtime bundle"/)
  assert.match(enUS, /"upgrade": "Upgrade available"/)
  assert.match(enUS, /"rollback": "Rollback available"/)
  assert.match(enUS, /"runtimeBundleApplyUpgrade": "Upgrade Home current"/)
  assert.match(enUS, /"runtimeBundleApplyRollback": "Rollback to previous"/)
})
