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
  assert.match(source, /DEFAULT_MACOS_TRAY_TITLE/)
  assert.match(source, /nativeHelperRunning: true/)
})
