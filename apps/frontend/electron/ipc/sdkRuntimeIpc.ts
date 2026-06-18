import { ipcMain, type WebContents } from 'electron'
import {
  notifySdkRuntime,
  registerSdkRuntimeSubscription,
  requestSdkRuntime,
  respondToSdkRuntimeServerRequest,
} from '../services/sdkRuntimeHost'
import { installDefaultSdkRuntimeHandlers } from '../services/sdkRuntimeDefaultHandlers'
import type {
  ElectronSdkRuntimeNotifyInput,
  ElectronSdkRuntimeRequestInput,
} from '../../src/shared/contracts/electronApi'
import type { SdkRuntimeRpcRequestMap } from '../../src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol'

const SDK_RUNTIME_IPC_CHANNELS = {
  request: 'sdk-runtime:request',
  notify: 'sdk-runtime:notify',
  response: 'sdk-runtime:server-request-response',
  notification: 'sdk-runtime:notification',
  serverRequest: 'sdk-runtime:server-request',
}

let defaultHandlersInstalled = false

export function registerSdkRuntimeIpcHandlers(): void {
  if (!defaultHandlersInstalled) {
    installDefaultSdkRuntimeHandlers()
    defaultHandlersInstalled = true
  }

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.request, (_event, input?: ElectronSdkRuntimeRequestInput) => {
    return requestSdkRuntime(input)
  })

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.notify, (event, input?: ElectronSdkRuntimeNotifyInput) => {
    const dispose = sdkRuntimeSubscriptionForNotify(event.sender, input)
    if (dispose) event.sender.once('destroyed', dispose)
    return notifySdkRuntime(input)
  })

  ipcMain.handle(SDK_RUNTIME_IPC_CHANNELS.response, (_event, input) => {
    return respondToSdkRuntimeServerRequest(input)
  })
}

function sdkRuntimeSubscriptionForNotify(sender: WebContents, input?: ElectronSdkRuntimeNotifyInput): (() => void) | undefined {
  if (!input || (input.method !== 'runtime/notify/threadSubscribe' && input.method !== 'runtime/notify/serverRequestsSubscribe')) return undefined
  const params = input.params
  const threadParams = input.method === 'runtime/notify/threadSubscribe'
    ? params as SdkRuntimeRpcRequestMap['runtime/notify/threadSubscribe']
    : undefined
  const subscriptionId = [
    sender.id,
    params.runtime.id,
    params.provider.id,
    threadParams?.threadId ?? 'global',
  ].join(':')
  return registerSdkRuntimeSubscription({
    subscriptionId,
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
