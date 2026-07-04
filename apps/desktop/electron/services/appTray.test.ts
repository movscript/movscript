import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('macOS tray always gets a visible title', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'appTray.ts'), 'utf8')

  assert.match(source, /const DEFAULT_MACOS_TRAY_TITLE = 'MovScript'/)
  assert.match(source, /const trayTitle = macOSTrayTitle\(\)/)
  assert.match(source, /if \(trayTitle\) \{\s*tray\.setTitle\(trayTitle\)\s*\}/)
  assert.match(source, /process\.platform === 'darwin' \? DEFAULT_MACOS_TRAY_TITLE : ''/)
  assert.doesNotMatch(source, /MOVSCRIPT_TRAY_DEBUG_TITLE/)
})

test('tray diagnostics report title visibility', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'appTray.ts'), 'utf8')

  assert.match(source, /titleVisible: Boolean\(trayTitle\)/)
  assert.match(source, /trayTitle,/)
  assert.match(source, /titleVisible: false/)
  assert.match(source, /trayTitle: ''/)
})

test('macOS tray starts the native visible status item helper', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'appTray.ts'), 'utf8')

  assert.match(source, /resolveNativeTrayHelperPath/)
  assert.match(source, /function installNativeMacTray\(\)/)
  assert.match(source, /spawn\(helperPath/)
  assert.match(source, /stdio: \['pipe', 'pipe', 'pipe'\]/)
  assert.match(source, /DEFAULT_MACOS_TRAY_TITLE/)
  assert.match(source, /nativeHelperRunning: true/)
})

test('native macOS tray receives menu models and dispatches commands back to Electron', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'appTray.ts'), 'utf8')

  assert.match(source, /function buildTrayMenuItems\(\)/)
  assert.match(source, /id: 'open-home'/)
  assert.match(source, /runtimeDescriptorMenuModel\(\)/)
  assert.match(source, /getElectronRuntimeConfig\(\)/)
  assert.match(source, /label: trayLabel\('MovScript Runtime', 'MovScript Runtime'\)/)
  assert.match(source, /Runtime owner/)
  assert.match(source, /Daemon status/)
  assert.match(source, /Data plane/)
  assert.match(source, /Plugin current/)
  assert.match(source, /Plugin root/)
  assert.match(source, /Daemon gateway/)
  assert.match(source, /id: 'install-agent-provider-targets'/)
  assert.match(source, /id: 'copy-codex-install-command'/)
  assert.match(source, /id: 'quit'/)
  assert.match(source, /function sendNativeTrayMenu/)
  assert.match(source, /JSON\.stringify\(\{ type: 'menu', items \}\)/)
  assert.match(source, /function handleNativeTrayLine/)
  assert.match(source, /message\.type !== 'command'/)
  assert.match(source, /dispatchTrayCommand\(message\.id\)/)
})

test('desktop app uses a single instance lock and focuses the existing app on relaunch', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../main.ts'), 'utf8')

  assert.match(source, /app\.requestSingleInstanceLock\(\)/)
  assert.match(source, /app\.on\('second-instance'/)
  assert.match(source, /openHomeWindow\(\)/)
  assert.match(source, /app\.on\('activate', \(\) => \{\s*openHomeWindow\(\)\s*\}/)
})
