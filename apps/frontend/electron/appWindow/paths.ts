import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

export function resolvePreloadPath(): string {
  const jsPath = join(__dirname, '../preload/index.js')
  const mjsPath = join(__dirname, '../preload/index.mjs')
  return existsSync(jsPath) ? jsPath : mjsPath
}

export function resolveAppIconPath(): string {
  const packagedIcon = join(process.resourcesPath || '', 'logo.png')
  if (app.isPackaged && existsSync(packagedIcon)) return packagedIcon
  return join(process.cwd(), '../../assets/logo.png')
}

export function resolveRendererHTMLPath(): string {
  return join(__dirname, '../renderer/index.html')
}
