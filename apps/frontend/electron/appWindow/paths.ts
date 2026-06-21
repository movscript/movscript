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
  return join(process.cwd(), '../../assets/logo.png')
}

export function resolveTrayIconPath(): string {
  const packagedIcon = join(process.resourcesPath || '', 'trayTemplate.png')
  if (app.isPackaged && existsSync(packagedIcon)) return packagedIcon
  return join(process.cwd(), '../../assets/trayTemplate.png')
}

export function resolveRendererHTMLPath(): string {
  return join(currentDir, '../renderer/index.html')
}
