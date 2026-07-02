import { app, clipboard, dialog, Menu, nativeImage, Tray } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { openHomeWindow } from './appWindowRegistry'
import { codexPluginInstallCommand, installMovScriptCodexPlugin } from './codexPluginInstaller'
import {
  ensureDefaultAppServerRuntimePackageInstalled,
} from './appServerRuntimeCommand'
import {
  installSdkRuntimePackageOnce,
  installedSdkRuntimePackageVersion,
  uninstallSdkRuntimePackage,
} from './sdkRuntimePackageStore'
import { broadcastCrossPageNotification } from './crossPageNotifications'
import { resolveAppIconPath, resolveNativeTrayHelperPath, resolveTrayIconPath } from '../appWindow/paths'
import { writeDesktopState } from './desktopStateStore'

let tray: Tray | null = null
let nativeTrayProcess: ChildProcess | null = null
let nativeTrayOutputBuffer = ''
let installing = false
let trayLanguage: 'zh-CN' | 'en-US' = 'en-US'
let trayDiagnostics: AppTrayDiagnostics = initialTrayDiagnostics()
const runtimeOperations = new Map<string, TrayRuntimeOperation>()
const DEFAULT_APP_SERVER_RUNTIME_VERSION = '0.0.1-alpha.13'
const DEFAULT_MACOS_TRAY_TITLE = 'MovScript'

type TrayRuntimeAction = 'download' | 'update' | 'uninstall'
type TrayRuntimeOperationStatus = 'running' | 'success' | 'error'
type TrayCommandId =
  | 'open-home'
  | 'install-codex-plugin'
  | 'copy-codex-install-command'
  | 'quit'
  | `runtime:${TrayRuntimeAgent['id']}:${TrayRuntimeAction}`

interface TrayMenuItemModel {
  id?: TrayCommandId
  type?: 'separator'
  label?: string
  enabled?: boolean
  submenu?: TrayMenuItemModel[]
}

interface NativeTrayCommandMessage {
  type: 'command'
  id: string
}

interface TrayRuntimeAgent {
  id: 'mova' | 'codex' | 'claude'
  labelZh: string
  labelEn: string
  runtimeKind: 'host' | 'sdk'
  packageName: string
  packageVersion?: string
}

interface TrayRuntimeOperation {
  key: string
  agent: TrayRuntimeAgent
  action: TrayRuntimeAction
  status: TrayRuntimeOperationStatus
  detail: string
}

interface AppTrayDiagnostics {
  installed: boolean
  platform: NodeJS.Platform
  appIsPackaged: boolean
  iconPath: string
  iconExists: boolean
  imageEmpty: boolean
  imageSize: { width: number; height: number }
  templateImage: boolean
  usedFallbackIcon: boolean
  titleVisible: boolean
  trayTitle: string
  nativeHelperPath: string
  nativeHelperExists: boolean
  nativeHelperRunning: boolean
  updatedAt: string
  error?: string
}

interface TrayImageResult {
  image: Electron.NativeImage
  iconPath: string
  templateImage: boolean
  usedFallbackIcon: boolean
}

const TRAY_RUNTIME_AGENTS: TrayRuntimeAgent[] = [
  {
    id: 'mova',
    labelZh: 'Mova',
    labelEn: 'Mova',
    runtimeKind: 'host',
    packageName: '@movscript/mova-app-server',
    packageVersion: DEFAULT_APP_SERVER_RUNTIME_VERSION,
  },
  {
    id: 'codex',
    labelZh: 'Codex',
    labelEn: 'Codex',
    runtimeKind: 'host',
    packageName: '@movscript/mova-app-server',
    packageVersion: DEFAULT_APP_SERVER_RUNTIME_VERSION,
  },
  {
    id: 'claude',
    labelZh: 'Claude Code',
    labelEn: 'Claude Code',
    runtimeKind: 'sdk',
    packageName: '@anthropic-ai/claude-agent-sdk',
    packageVersion: '0.3.183',
  },
]
export function installAppTray(): void {
  if (tray) return

  const trayImage = createTrayImage()
  recordTrayDiagnostics(trayDiagnosticsFromImage(trayImage, false))

  try {
    tray = new Tray(trayImage.image)
  } catch (error) {
    recordTrayDiagnostics({
      ...trayDiagnosticsFromImage(trayImage, false),
      error: errorMessage(error),
    })
    throw error
  }

  tray.setToolTip('MovScript')
  const trayTitle = macOSTrayTitle()
  if (trayTitle) {
    tray.setTitle(trayTitle)
  }
  trayLanguage = detectSystemTrayLanguage()
  tray.on('click', () => {
    tray?.popUpContextMenu()
  })
  recordTrayDiagnostics(trayDiagnosticsFromImage(trayImage, true))
  installNativeMacTray()
  refreshTrayMenu()
}

export function isAppTrayInstalled(): boolean {
  return Boolean(tray)
}

export function getAppTrayDiagnostics(): AppTrayDiagnostics {
  return { ...trayDiagnostics, imageSize: { ...trayDiagnostics.imageSize } }
}

export function refreshAppTrayMenu(): void {
  refreshTrayMenu()
}

function refreshTrayMenu(): void {
  const items = buildTrayMenuItems()
  if (tray) {
    tray.setContextMenu(Menu.buildFromTemplate(toElectronMenuTemplate(items)))
  }
  sendNativeTrayMenu(items)
}

function buildTrayMenuItems(): TrayMenuItemModel[] {
  return [
    {
      id: 'open-home',
      label: trayLabel('打开 MovScript', 'Open MovScript'),
    },
    { type: 'separator' },
    {
      label: trayLabel('内置 Agent 运行时', 'Built-in Agent runtimes'),
      submenu: TRAY_RUNTIME_AGENTS.map(runtimeAgentSubmenuModel),
    },
    { type: 'separator' },
    {
      id: 'install-codex-plugin',
      label: installing
        ? trayLabel('正在安装 Codex 的 MovScript 插件...', 'Installing MovScript plugin for Codex...')
        : trayLabel('安装 Codex 的 MovScript 插件', 'Install MovScript plugin for Codex'),
      enabled: !installing,
    },
    {
      id: 'copy-codex-install-command',
      label: trayLabel('复制 Codex 安装命令', 'Copy Codex install command'),
    },
    { type: 'separator' },
    {
      id: 'quit',
      label: trayLabel('退出 MovScript', 'Quit MovScript'),
    },
  ]
}

function toElectronMenuTemplate(items: TrayMenuItemModel[]): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    if (item.type === 'separator') return { type: 'separator' }
    const menuItem: Electron.MenuItemConstructorOptions = {
      label: item.label ?? '',
      enabled: item.enabled ?? true,
    }
    if (item.submenu) {
      menuItem.submenu = toElectronMenuTemplate(item.submenu)
    }
    if (item.id) {
      const commandId = item.id
      menuItem.click = () => {
        dispatchTrayCommand(commandId)
      }
    }
    return menuItem
  })
}

function runtimeAgentSubmenuModel(agent: TrayRuntimeAgent): TrayMenuItemModel {
  const status = runtimeAgentStatus(agent)
  const busy = runtimeOperationBusy(agent)
  return {
    label: `${runtimeAgentLabel(agent)} - ${runtimeStatusLabel(status)}`,
    submenu: [
      {
        label: runtimeStatusDetail(agent, status),
        enabled: false,
      },
      { type: 'separator' },
      {
        id: runtimeCommandId(agent, 'download'),
        label: trayLabel('下载', 'Download'),
        enabled: !busy && !status.installed,
      },
      {
        id: runtimeCommandId(agent, 'update'),
        label: trayLabel('更新', 'Update'),
        enabled: !busy && status.installed,
      },
      {
        id: runtimeCommandId(agent, 'uninstall'),
        label: trayLabel('卸载', 'Uninstall'),
        enabled: !busy && status.installed,
      },
    ],
  }
}

function dispatchTrayCommand(id: string): void {
  if (id === 'open-home') {
    openHomeWindow()
    return
  }
  if (id === 'install-codex-plugin') {
    void installCodexPluginFromTray()
    return
  }
  if (id === 'copy-codex-install-command') {
    clipboard.writeText(codexPluginInstallCommand())
    return
  }
  if (id === 'quit') {
    app.quit()
    return
  }

  const runtimeCommand = parseRuntimeCommandId(id)
  if (!runtimeCommand) {
    console.warn(`[tray] ignored unknown tray command: ${id}`)
    return
  }
  void runRuntimeOperation(runtimeCommand.agent, runtimeCommand.action)
}

function runtimeAgentStatus(agent: TrayRuntimeAgent): { installed: boolean; installedVersion?: string } {
  const installedVersion = installedSdkRuntimePackageVersion(runtimeAgentPackageName(agent))
  const installed = agent.packageVersion ? installedVersion === agent.packageVersion : Boolean(installedVersion)
  return {
    installed,
    ...(installedVersion ? { installedVersion } : {}),
  }
}

function runtimeOperationBusy(agent: TrayRuntimeAgent): boolean {
  return Array.from(runtimeOperations.values()).some((operation) => (
    operation.agent.id === agent.id && operation.status === 'running'
  ))
}

async function runRuntimeOperation(agent: TrayRuntimeAgent, action: TrayRuntimeAction): Promise<void> {
  const key = `${agent.id}:${action}:${Date.now()}`
  runtimeOperations.set(key, {
    key,
    agent,
    action,
    status: 'running',
    detail: runtimeActionRunningDetail(action),
  })
  openHomeWindow()
  broadcastRuntimeOperation(key)
  refreshTrayMenu()
  try {
    if (action === 'uninstall') {
      const packageName = runtimeAgentPackageName(agent)
      const result = uninstallSdkRuntimePackage({ packageName })
      if (!result.ok) throw new Error(result.error || `Failed to uninstall ${packageName}.`)
    } else if (agent.runtimeKind === 'host' && action === 'download') {
      const result = await ensureDefaultAppServerRuntimePackageInstalled()
      if (result && !result.ok) throw new Error(result.error || `Failed to install ${agent.packageName}.`)
    } else {
      const result = await installSdkRuntimePackageOnce({
        packageName: runtimeAgentPackageName(agent),
        ...(agent.packageVersion ? { packageVersion: agent.packageVersion } : {}),
      })
      if (!result.ok) throw new Error(result.error || `Failed to install ${agent.packageName}.`)
    }
    runtimeOperations.set(key, {
      key,
      agent,
      action,
      status: 'success',
      detail: runtimeActionSuccessDetail(action),
    })
  } catch (error) {
    runtimeOperations.set(key, {
      key,
      agent,
      action,
      status: 'error',
      detail: errorMessage(error),
    })
  } finally {
    broadcastRuntimeOperation(key)
    refreshTrayMenu()
  }
}

function broadcastRuntimeOperation(key: string): void {
  const operation = runtimeOperations.get(key)
  if (!operation) return
  const packageName = runtimeAgentPackageName(operation.agent)
  broadcastCrossPageNotification({
    id: `tray-agent-runtime:${operation.key}:${operation.status}:${Date.now()}`,
    topic: 'capability',
    scope: { kind: 'global' },
    transport: 'electron-ipc',
    source: 'electron-tray',
    emittedAt: new Date().toISOString(),
    payload: {
      kind: 'agent-runtime-operation',
      key: operation.key,
      label: `${runtimeAgentLabel(operation.agent)} ${runtimeActionLabel(operation.action)}`,
      packageName,
      ...(operation.agent.packageVersion ? { packageVersion: operation.agent.packageVersion } : {}),
      phase: runtimeOperationPhase(operation.status),
      message: operation.detail,
    },
  })
}

async function installCodexPluginFromTray(): Promise<void> {
  if (installing) return
  installing = true
  refreshTrayMenu()
  try {
    const result = await installMovScriptCodexPlugin()
    dialog.showMessageBox({
      type: 'info',
      title: trayLabel('MovScript 插件已安装', 'MovScript plugin installed'),
      message: trayLabel('已为 Codex 安装 MovScript 插件。', 'MovScript plugin installed for Codex.'),
      detail: `${trayLabel('安装来源', 'Installed from')} ${result.paths.marketplaceRoot}.\n${trayLabel('重启 Codex 或新建 Codex 线程后即可使用。', 'Restart Codex or start a new Codex thread to use it.')}`,
      buttons: [trayLabel('确定', 'OK')],
    })
  } catch (error) {
    const command = codexPluginInstallCommand()
    clipboard.writeText(command)
    dialog.showMessageBox({
      type: 'error',
      title: trayLabel('Codex 插件安装失败', 'Codex plugin install failed'),
      message: trayLabel('MovScript 无法自动安装 Codex 插件。', 'MovScript could not install the Codex plugin automatically.'),
      detail: `${errorMessage(error)}\n\n${trayLabel('安装命令已复制到剪贴板。', 'The install command has been copied to your clipboard.')}`,
      buttons: [trayLabel('确定', 'OK')],
    })
  } finally {
    installing = false
    refreshTrayMenu()
  }
}

function trayLabel(zhCN: string, enUS: string): string {
  return trayLanguage === 'zh-CN' ? zhCN : enUS
}

function runtimeAgentLabel(agent: TrayRuntimeAgent): string {
  return trayLabel(agent.labelZh, agent.labelEn)
}

function runtimeStatusLabel(status: { installed: boolean; installedVersion?: string }): string {
  if (status.installed) return trayLabel('已安装', 'Installed')
  if (status.installedVersion) return trayLabel('需更新', 'Update needed')
  return trayLabel('未下载', 'Not downloaded')
}

function runtimeStatusDetail(agent: TrayRuntimeAgent, status: { installed: boolean; installedVersion?: string }): string {
  const packageName = runtimeAgentPackageName(agent)
  if (status.installedVersion) {
    const version = agent.packageVersion && status.installedVersion !== agent.packageVersion
      ? `${status.installedVersion} -> ${agent.packageVersion}`
      : status.installedVersion
    return `${packageName}@${version}`
  }
  return `${packageName} ${trayLabel('未安装', 'is not installed')}`
}

function runtimeAgentPackageName(agent: TrayRuntimeAgent): string {
  return agent.packageName
}

function runtimeCommandId(agent: TrayRuntimeAgent, action: TrayRuntimeAction): TrayCommandId {
  return `runtime:${agent.id}:${action}`
}

function parseRuntimeCommandId(id: string): { agent: TrayRuntimeAgent; action: TrayRuntimeAction } | null {
  const match = /^runtime:(mova|codex|claude):(download|update|uninstall)$/.exec(id)
  if (!match) return null
  const agent = TRAY_RUNTIME_AGENTS.find((candidate) => candidate.id === match[1])
  if (!agent) return null
  return {
    agent,
    action: match[2] as TrayRuntimeAction,
  }
}

function runtimeActionLabel(action: TrayRuntimeAction): string {
  if (action === 'download') return trayLabel('下载', 'Download')
  if (action === 'update') return trayLabel('更新', 'Update')
  return trayLabel('卸载', 'Uninstall')
}

function runtimeActionRunningDetail(action: TrayRuntimeAction): string {
  if (action === 'uninstall') return trayLabel('正在卸载...', 'Uninstalling...')
  return trayLabel('正在下载...', 'Downloading...')
}

function runtimeActionSuccessDetail(action: TrayRuntimeAction): string {
  if (action === 'uninstall') return trayLabel('已卸载', 'Uninstalled')
  if (action === 'update') return trayLabel('已更新', 'Updated')
  return trayLabel('已下载', 'Downloaded')
}

function runtimeOperationPhase(status: TrayRuntimeOperationStatus): 'installing' | 'success' | 'error' {
  if (status === 'running') return 'installing'
  if (status === 'success') return 'success'
  return 'error'
}

function detectSystemTrayLanguage(): 'zh-CN' | 'en-US' {
  return app.getLocale().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function macOSTrayTitle(): string {
  return process.platform === 'darwin' ? DEFAULT_MACOS_TRAY_TITLE : ''
}

function installNativeMacTray(): void {
  if (process.platform !== 'darwin' || nativeTrayProcess) return

  const helperPath = resolveNativeTrayHelperPath()
  if (!app.isPackaged || !existsSync(helperPath)) {
    recordTrayDiagnostics({
      ...trayDiagnostics,
      nativeHelperPath: helperPath,
      nativeHelperExists: existsSync(helperPath),
      nativeHelperRunning: false,
      updatedAt: new Date().toISOString(),
    })
    return
  }

  nativeTrayOutputBuffer = ''
  const child = spawn(helperPath, [
    String(process.pid),
    resolveMacOSAppBundlePath(),
    DEFAULT_MACOS_TRAY_TITLE,
  ], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  nativeTrayProcess = child
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', handleNativeTrayOutput)
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk) => {
    const text = String(chunk).trim()
    if (text) console.warn(`[tray/native] ${text}`)
  })
  child.stdin?.on('error', (error) => {
    console.warn('[tray/native] failed to write menu update', error)
  })
  child.once('exit', () => {
    if (nativeTrayProcess === child) {
      nativeTrayProcess = null
      recordTrayDiagnostics({
        ...trayDiagnostics,
        nativeHelperRunning: false,
        updatedAt: new Date().toISOString(),
      })
    }
  })
  app.once('before-quit', () => {
    child.kill()
  })
  recordTrayDiagnostics({
    ...trayDiagnostics,
    nativeHelperPath: helperPath,
    nativeHelperExists: true,
    nativeHelperRunning: true,
    updatedAt: new Date().toISOString(),
  })
}

function sendNativeTrayMenu(items = buildTrayMenuItems()): void {
  if (!nativeTrayProcess?.stdin?.writable) return
  nativeTrayProcess.stdin.write(`${JSON.stringify({ type: 'menu', items })}\n`)
}

function handleNativeTrayOutput(chunk: string): void {
  nativeTrayOutputBuffer += chunk
  let lineEnd = nativeTrayOutputBuffer.indexOf('\n')
  while (lineEnd >= 0) {
    const line = nativeTrayOutputBuffer.slice(0, lineEnd).trim()
    nativeTrayOutputBuffer = nativeTrayOutputBuffer.slice(lineEnd + 1)
    if (line) handleNativeTrayLine(line)
    lineEnd = nativeTrayOutputBuffer.indexOf('\n')
  }
}

function handleNativeTrayLine(line: string): void {
  let message: NativeTrayCommandMessage
  try {
    message = JSON.parse(line) as NativeTrayCommandMessage
  } catch (error) {
    console.warn(`[tray/native] ignored invalid helper message: ${errorMessage(error)}`)
    return
  }

  if (message.type !== 'command' || typeof message.id !== 'string') {
    console.warn(`[tray/native] ignored unsupported helper message: ${line}`)
    return
  }
  dispatchTrayCommand(message.id)
}

function resolveMacOSAppBundlePath(): string {
  return dirname(dirname(dirname(process.execPath)))
}

function createTrayImage(): TrayImageResult {
  if (process.platform === 'darwin') {
    const iconPath = resolveTrayIconPath()
    let image = nativeImage.createFromPath(iconPath)
    let imagePath = iconPath
    let usedFallbackIcon = false
    let templateImage = true

    if (image.isEmpty()) {
      imagePath = resolveAppIconPath()
      image = nativeImage.createFromPath(imagePath).resize({ width: 18, height: 18 })
      usedFallbackIcon = true
      templateImage = false
    }

    image.setTemplateImage(templateImage)
    return {
      image,
      iconPath: imagePath,
      templateImage,
      usedFallbackIcon,
    }
  }
  const iconPath = resolveAppIconPath()
  const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  return {
    image,
    iconPath,
    templateImage: false,
    usedFallbackIcon: false,
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function trayDiagnosticsFromImage(input: TrayImageResult, installed: boolean): AppTrayDiagnostics {
  const size = input.image.getSize()
  const trayTitle = macOSTrayTitle()
  return {
    installed,
    platform: process.platform,
    appIsPackaged: app.isPackaged,
    iconPath: input.iconPath,
    iconExists: existsSync(input.iconPath),
    imageEmpty: input.image.isEmpty(),
    imageSize: { width: size.width, height: size.height },
    templateImage: input.templateImage,
    usedFallbackIcon: input.usedFallbackIcon,
    titleVisible: Boolean(trayTitle),
    trayTitle,
    nativeHelperPath: process.platform === 'darwin' ? resolveNativeTrayHelperPath() : '',
    nativeHelperExists: process.platform === 'darwin' && existsSync(resolveNativeTrayHelperPath()),
    nativeHelperRunning: Boolean(nativeTrayProcess),
    updatedAt: new Date().toISOString(),
  }
}

function initialTrayDiagnostics(): AppTrayDiagnostics {
  return {
    installed: false,
    platform: process.platform,
    appIsPackaged: app.isPackaged,
    iconPath: '',
    iconExists: false,
    imageEmpty: true,
    imageSize: { width: 0, height: 0 },
    templateImage: false,
    usedFallbackIcon: false,
    titleVisible: false,
    trayTitle: '',
    nativeHelperPath: '',
    nativeHelperExists: false,
    nativeHelperRunning: false,
    updatedAt: new Date().toISOString(),
  }
}

function recordTrayDiagnostics(next: AppTrayDiagnostics): void {
  trayDiagnostics = next
  console.info(`[tray] installed=${next.installed} icon=${next.iconPath} exists=${next.iconExists} empty=${next.imageEmpty} size=${next.imageSize.width}x${next.imageSize.height} fallback=${next.usedFallbackIcon}`)
  try {
    writeDesktopState({ key: 'movscript-tray-diagnostics-v1', value: next })
  } catch (error) {
    console.warn('[tray] failed to write diagnostics', error)
  }
}
