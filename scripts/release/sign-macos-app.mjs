#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

import { isDirectRun } from './release-common.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')

if (isDirectRun(import.meta.url)) {
  await runSignMacOSAppCli(process.argv.slice(2))
}

export async function runSignMacOSAppCli(args = [], options = {}) {
  const {
    root = repoRoot,
    exit = process.exit,
    log = console.log,
    logError = console.error,
  } = options
  try {
    const appDir = parseAppArg(args)
    await signMacOSApp(root, appDir)
    assertMainExecutableEntitlement(appDir, 'com.apple.security.cs.disable-library-validation')
    log(`Signed macOS app for unsigned distribution: ${appDir}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    exit(1)
  }
}

export async function signMacOSApp(root, appDir) {
  if (!existsSync(appDir)) {
    throw new Error(`macOS app does not exist: ${appDir}`)
  }
  const desktopRequire = createRequire(resolve(root, 'apps/desktop/package.json'))
  const { signAsync } = desktopRequire('@electron/osx-sign')
  await signAsync({
    app: appDir,
    identity: '-',
    identityValidation: false,
    preAutoEntitlements: false,
    preEmbedProvisioningProfile: false,
    strictVerify: false,
    ignore: (filePath) => isPackagedFFmpegResource(filePath),
    optionsForFile: () => ({
      entitlements: resolve(root, 'apps/desktop/build/entitlements.mac.plist'),
      hardenedRuntime: true,
      timestamp: 'none',
    }),
  })
}

function parseAppArg(args) {
  const appDir = args.find((arg) => arg && !arg.startsWith('-'))
  if (!appDir) {
    throw new Error('Usage: node scripts/release/sign-macos-app.mjs <path-to-app>')
  }
  return resolve(appDir)
}

function isPackagedFFmpegResource(filePath) {
  return filePath.replace(/\\/g, '/').includes('/Contents/Resources/ffmpeg/')
}

function assertMainExecutableEntitlement(appDir, entitlement) {
  const plist = execFileSync('codesign', ['-d', '--entitlements', ':-', appDir], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (!plist.includes(`<key>${entitlement}</key>`)) {
    throw new Error(`Signed macOS app is missing required entitlement: ${entitlement}`)
  }
}
