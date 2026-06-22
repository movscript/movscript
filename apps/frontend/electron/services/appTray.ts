import { app, clipboard, dialog, Menu, nativeImage, Tray } from 'electron'
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
import { resolveAppIconPath, resolveTrayIconPath } from '../appWindow/paths'
import { leaveTrayMode } from './desktopPresence'

let tray: Tray | null = null
let installing = false
let trayLanguage: 'zh-CN' | 'en-US' = 'en-US'
const runtimeOperations = new Map<string, TrayRuntimeOperation>()
const DEFAULT_APP_SERVER_RUNTIME_VERSION = '0.0.1-alpha.13'

type TrayRuntimeAction = 'download' | 'update' | 'uninstall'
type TrayRuntimeOperationStatus = 'running' | 'success' | 'error'

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

  tray = new Tray(createTrayImage())
  tray.setToolTip('MovScript')
  trayLanguage = detectSystemTrayLanguage()
  tray.on('click', () => {
    tray?.popUpContextMenu()
  })
  refreshTrayMenu()
}

export function refreshAppTrayMenu(): void {
  refreshTrayMenu()
}

function refreshTrayMenu(): void {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: trayLabel('打开 MovScript', 'Open MovScript'),
      click: () => {
        leaveTrayMode()
        openHomeWindow()
      },
    },
    { type: 'separator' },
    {
      label: trayLabel('内置 Agent 运行时', 'Built-in Agent runtimes'),
      submenu: TRAY_RUNTIME_AGENTS.map(runtimeAgentSubmenu),
    },
    { type: 'separator' },
    {
      label: installing
        ? trayLabel('正在安装 Codex 的 MovScript 插件...', 'Installing MovScript plugin for Codex...')
        : trayLabel('安装 Codex 的 MovScript 插件', 'Install MovScript plugin for Codex'),
      enabled: !installing,
      click: () => {
        void installCodexPluginFromTray()
      },
    },
    {
      label: trayLabel('复制 Codex 安装命令', 'Copy Codex install command'),
      click: () => {
        clipboard.writeText(codexPluginInstallCommand())
      },
    },
    { type: 'separator' },
    {
      label: trayLabel('退出 MovScript', 'Quit MovScript'),
      click: () => {
        app.quit()
      },
    },
  ]))
}

function runtimeAgentSubmenu(agent: TrayRuntimeAgent): Electron.MenuItemConstructorOptions {
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
        label: trayLabel('下载', 'Download'),
        enabled: !busy && !status.installed,
        click: () => {
          void runRuntimeOperation(agent, 'download')
        },
      },
      {
        label: trayLabel('更新', 'Update'),
        enabled: !busy && status.installed,
        click: () => {
          void runRuntimeOperation(agent, 'update')
        },
      },
      {
        label: trayLabel('卸载', 'Uninstall'),
        enabled: !busy && status.installed,
        click: () => {
          void runRuntimeOperation(agent, 'uninstall')
        },
      },
    ],
  }
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
  leaveTrayMode()
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

function createTrayImage(): Electron.NativeImage {
  if (process.platform === 'darwin') {
    const image = nativeImage.createFromPath(resolveTrayIconPath())
    image.setTemplateImage(true)
    return image
  }
  return nativeImage.createFromPath(resolveAppIconPath()).resize({ width: 16, height: 16 })
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
