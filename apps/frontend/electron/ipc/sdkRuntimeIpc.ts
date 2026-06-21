import { ipcMain, type WebContents } from 'electron'
import {
  notifyAgentRuntime,
  registerAgentRuntimeSubscription,
  requestAgentRuntime,
  respondToAgentRuntimeServerRequest,
} from '../services/agentRuntimeHost'
import { installAgentRuntimeDefaultHandlers } from '../services/agentRuntimeDefaultHandlers'
import {
  cancelSdkRuntimePackageInstall,
  installedSdkRuntimePackageVersion,
  resolveSdkRuntimePackageStorePaths,
} from '../services/sdkRuntimePackageStore'
import { ensureDefaultAppServerRuntimePackageInstalled } from '../services/appServerRuntimeCommand'
import type {
  ElectronAppServerRuntimeInstallResult,
  ElectronSdkRuntimeNotifyInput,
  ElectronSdkRuntimePackageCancelInput,
  ElectronSdkRuntimePackageCancelResult,
  ElectronSdkRuntimePackageStatus,
  ElectronSdkRuntimePackageStatusInput,
  ElectronSdkRuntimeRequestInput,
} from '../../src/shared/contracts/electronApi'
import type { AgentRuntimeRpcRequestMap } from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'

const SDK_RUNTIME_IPC_CHANNELS = {
  request: 'sdk-runtime:request',
  packageStatus: 'sdk-runtime:package-status',
  packageInstallCancel: 'sdk-runtime:package-install-cancel',
  appServerPackageInstall: 'sdk-runtime:app-server-package-install',
  notify: 'sdk-runtime:notify',
  response: 'sdk-runtime:server-request-response',
  notification: 'sdk-runtime:notification',
  serverRequest: 'sdk-runtime:server-request',
}

let defaultHandlersInstalled = false

export function registerSdkRuntimeIpcHandlers(): void {
  if (!defaultHandlersInstalled) {
    installAgentRuntimeDefaultHandlers()
    defaultHandlersInstalled = true
  }

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.request, async (_event, input?: ElectronSdkRuntimeRequestInput) => {
    console.log('[Movscript Agent runtime flow] ipc.request', JSON.stringify(agentRuntimeInputLogPayload(input)))
    try {
      return await requestAgentRuntime(input)
    } catch (error) {
      console.error('[Movscript Agent runtime flow] ipc.requestError', JSON.stringify({
        ...agentRuntimeInputLogPayload(input),
        error: errorMessage(error),
      }))
      throw error
    }
  })

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.packageStatus, (_event, input?: ElectronSdkRuntimePackageStatusInput): ElectronSdkRuntimePackageStatus => {
    const packageName = input?.packageName?.trim()
    if (!packageName) throw new Error('SDK runtime packageName is required.')
    const packageVersion = input?.packageVersion?.trim()
    const installedVersion = installedSdkRuntimePackageVersion(packageName)
    const paths = resolveSdkRuntimePackageStorePaths()
    return {
      packageName,
      ...(packageVersion ? { packageVersion } : {}),
      installed: packageVersion ? installedVersion === packageVersion : Boolean(installedVersion),
      ...(installedVersion ? { installedVersion } : {}),
      root: paths.root,
    }
  })

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.packageInstallCancel, (_event, input?: ElectronSdkRuntimePackageCancelInput): ElectronSdkRuntimePackageCancelResult => {
    const packageName = input?.packageName?.trim()
    if (!packageName) throw new Error('SDK runtime packageName is required.')
    const packageVersion = input?.packageVersion?.trim()
    return {
      packageName,
      ...(packageVersion ? { packageVersion } : {}),
      cancelled: cancelSdkRuntimePackageInstall({
        packageName,
        ...(packageVersion ? { packageVersion } : {}),
      }),
    }
  })

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.appServerPackageInstall, async (): Promise<ElectronAppServerRuntimeInstallResult> => {
    const result = await ensureDefaultAppServerRuntimePackageInstalled()
    const paths = resolveSdkRuntimePackageStorePaths()
    return {
      packageName: result?.packageName ?? '@movscript/mova-app-server',
      ...(result?.packageVersion ? { packageVersion: result.packageVersion } : {}),
      installed: true,
      root: paths.root,
      ...(result?.command ? { command: result.command } : {}),
      ...(result?.args ? { args: result.args } : {}),
    }
  })

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.notify, (event, input?: ElectronSdkRuntimeNotifyInput) => {
    const dispose = agentRuntimeSubscriptionForNotify(event.sender, input)
    if (dispose) event.sender.once('destroyed', dispose)
    return notifyAgentRuntime(input)
  })

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.response, (_event, input) => {
    return respondToAgentRuntimeServerRequest(input)
  })
}

function agentRuntimeInputLogPayload(input?: ElectronSdkRuntimeRequestInput): Record<string, unknown> {
  const params = input?.params
  return {
    method: input?.method,
    providerId: params?.provider.id,
    providerKind: params?.provider.kind,
    runtimeId: params?.runtime.id,
    runtimeApi: params?.runtime.api,
    threadId: params && 'threadId' in params ? params.threadId : undefined,
    model: params && 'model' in params ? params.model : undefined,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function agentRuntimeSubscriptionForNotify(sender: WebContents, input?: ElectronSdkRuntimeNotifyInput): (() => void) | undefined {
  if (!input || (input.method !== 'runtime/notify/threadSubscribe' && input.method !== 'runtime/notify/serverRequestsSubscribe')) return undefined
  const params = input.params
  const threadParams = input.method === 'runtime/notify/threadSubscribe'
    ? params as AgentRuntimeRpcRequestMap['runtime/notify/threadSubscribe']
    : undefined
  const subscriptionId = [
    sender.id,
    params.runtime.id,
    params.provider.id,
    threadParams?.threadId ?? 'global',
  ].join(':')
  return registerAgentRuntimeSubscription({
    subscriptionId,
    targetId: String(sender.id),
    runtimeId: params.runtime.id,
    providerId: params.provider.id,
    providerKind: params.provider.kind,
    ...(threadParams ? { threadId: threadParams.threadId } : {}),
    sendNotification: (message) => {
      if (!sender.isDestroyed()) sender.send(SDK_RUNTIME_IPC_CHANNELS.notification, message)
    },
    sendServerRequest: (message) => {
      if (!sender.isDestroyed()) sender.send(SDK_RUNTIME_IPC_CHANNELS.serverRequest, message)
    },
  })
}
