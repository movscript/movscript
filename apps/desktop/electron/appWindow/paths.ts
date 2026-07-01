import { app } from 'electron'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const currentDir = dirname(fileURLToPath(import.meta.url))

export function resolvePreloadPath(): string {
  const jsPath = join(currentDir, '../preload/index.js')
  const mjsPath = join(currentDir, '../preload/index.mjs')
  return existsSync(jsPath) ? jsPath : mjsPath
}

export function resolveAppIconPath(): string {
  const packagedIcon = join(process.resourcesPath || '', 'logo.png')
  if (app.isPackaged && existsSync(packagedIcon)) return packagedIcon
  return resolveDevAssetPath('logo.png')
}

export function resolveTrayIconPath(): string {
  const packagedIcon = join(process.resourcesPath || '', 'trayTemplate.png')
  if (app.isPackaged && existsSync(packagedIcon)) return packagedIcon
  return resolveDevAssetPath('trayTemplate.png')
}

export function resolveNativeTrayHelperPath(): string {
  const packagedHelper = join(process.resourcesPath || '', 'native', 'movscript-native-tray')
  if (app.isPackaged && existsSync(packagedHelper)) return packagedHelper
  return resolveDevDesktopPath('native/movscript-native-tray')
}

export function resolveRendererHTMLPath(): string {
  return join(currentDir, '../renderer/index.html')
}

function resolveDevAssetPath(name: string): string {
  const candidates = [
    join(process.cwd(), '../../assets', name),
    join(process.cwd(), 'assets', name),
    join(currentDir, '../../../../assets', name),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function resolveDevDesktopPath(name: string): string {
  const candidates = [
    join(process.cwd(), name),
    join(process.cwd(), 'apps/desktop', name),
    join(currentDir, '../../', name),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}
