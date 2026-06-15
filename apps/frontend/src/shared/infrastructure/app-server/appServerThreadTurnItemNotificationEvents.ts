import type { AgentChatNotificationEvent } from '@movscript/core/agent/chat'
import type { AppServerJsonRpcNotification } from '@/shared/infrastructure/app-server/appServerProtocol'
import { realtimeEventFromAppServerThreadTurnItem } from '@/shared/infrastructure/app-server/appServerThreadTurnItemRealtimeEvents'
import {
  agentChatConfigWarningDetail,
  agentChatGoalDetail,
  agentChatHookRunDetail,
  agentChatRawResponseItemDetail,
  agentChatRawResponseItemKey,
  agentChatRemoteControlStatusDetail,
  agentChatStringPreview,
  agentChatTokenUsageDetail,
  agentChatWindowsSandboxSetupDetail,
  decodeBase64Utf8,
  isRecord,
  numberField,
  requestIdField,
  stringField,
} from '@/shared/infrastructure/app-server/appServerThreadTurnItemNotificationDetails'

export function agentChatNotificationEventFromAppServerThreadTurnItem(notification: AppServerJsonRpcNotification): AgentChatNotificationEvent | undefined {
  const params = isRecord(notification.params) ? notification.params : {}
  if (notification.method === 'error') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const error = isRecord(params.error) ? params.error : {}
    const title = stringField(error.message) ?? 'Turn error'
    return {
      type: 'systemNotice',
      level: 'error',
      id: turnId ? `turn-error:${turnId}` : undefined,
      code: notification.method,
      threadId,
      turnId,
      title: params.willRetry === true ? `${title} (retrying)` : title,
      detail: stringField(error.additionalDetails) ?? null,
      raw: notification,
    }
  }
  if (notification.method === 'thread/archived' || notification.method === 'thread/unarchived' || notification.method === 'thread/closed') {
    const threadId = stringField(params.threadId)
    if (!threadId) return undefined
    return {
      type: 'threadLifecycle',
      action: notification.method === 'thread/archived' ? 'archived' : notification.method === 'thread/unarchived' ? 'unarchived' : 'closed',
      threadId,
      raw: notification,
    }
  }
  if (notification.method === 'serverRequest/resolved') {
    const requestId = requestIdField(params.requestId)
    if (!requestId) return undefined
    return {
      type: 'serverRequestResolved',
      threadId: stringField(params.threadId),
      requestId,
      raw: notification,
    }
  }
  if (notification.method === 'rawResponseItem/completed') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const item = isRecord(params.item) ? params.item : null
    if (!threadId || !turnId || !item) return undefined
    const itemType = stringField(item.type) ?? 'responseItem'
    return {
      type: 'systemNotice',
      level: 'info',
      id: `raw-response-item:${turnId}:${agentChatRawResponseItemKey(item)}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Raw response item completed',
      detail: agentChatRawResponseItemDetail(itemType, item),
      raw: notification,
    }
  }
  if (notification.method === 'hook/started' || notification.method === 'hook/completed') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const run = isRecord(params.run) ? params.run : {}
    const hookId = stringField(run.id)
    const status = stringField(run.status)
    if (!threadId || !hookId) return undefined
    return {
      type: 'systemNotice',
      level: status === 'failed' || status === 'blocked' ? 'warning' : 'info',
      id: `hook:${hookId}`,
      code: notification.method,
      threadId,
      turnId,
      title: notification.method === 'hook/started' ? 'Hook started' : 'Hook completed',
      detail: agentChatHookRunDetail(run),
      raw: notification,
    }
  }
  if (notification.method === 'thread/goal/updated') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const goal = isRecord(params.goal) ? params.goal : {}
    const objective = stringField(goal.objective)
    if (!threadId || !objective) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `thread-goal:${threadId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Goal updated',
      detail: agentChatGoalDetail(goal),
      raw: notification,
    }
  }
  if (notification.method === 'thread/goal/cleared') {
    const threadId = stringField(params.threadId)
    if (!threadId) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `thread-goal-cleared:${threadId}`,
      code: notification.method,
      threadId,
      title: 'Goal cleared',
      detail: null,
      raw: notification,
    }
  }
  if (notification.method === 'thread/tokenUsage/updated') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    if (!threadId || !turnId) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `turn-token-usage:${turnId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Token usage updated',
      detail: agentChatTokenUsageDetail(params.tokenUsage),
      raw: notification,
    }
  }
  if (notification.method === 'model/rerouted') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const fromModel = stringField(params.fromModel)
    const toModel = stringField(params.toModel)
    if (!threadId || !turnId || !fromModel || !toModel) return undefined
    return {
      type: 'systemNotice',
      level: 'warning',
      id: `model-rerouted:${turnId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Model rerouted',
      detail: [`${fromModel} -> ${toModel}`, stringField(params.reason)].filter(Boolean).join('\n'),
      raw: notification,
    }
  }
  if (notification.method === 'model/verification') {
    const threadId = stringField(params.threadId)
    const turnId = stringField(params.turnId)
    const verifications = Array.isArray(params.verifications) ? params.verifications.filter((item): item is string => typeof item === 'string') : []
    if (!threadId || !turnId) return undefined
    return {
      type: 'systemNotice',
      level: 'info',
      id: `model-verification:${turnId}`,
      code: notification.method,
      threadId,
      turnId,
      title: 'Model verification',
      detail: verifications.join('\n') || null,
      raw: notification,
    }
  }
  if (notification.method === 'command/exec/outputDelta') {
    const processId = stringField(params.processId)
    const stream = stringField(params.stream)
    const deltaBase64 = stringField(params.deltaBase64)
    if (!processId || !stream || !deltaBase64) return undefined
    return {
      type: 'commandOutput',
      processId,
      stream,
      deltaBase64,
      text: decodeBase64Utf8(deltaBase64),
      capReached: params.capReached === true,
      raw: notification,
    }
  }
  if (notification.method === 'process/outputDelta') {
    const processHandle = stringField(params.processHandle)
    const stream = stringField(params.stream)
    const deltaBase64 = stringField(params.deltaBase64)
    if (!processHandle || !stream || !deltaBase64) return undefined
    return {
      type: 'processOutput',
      processHandle,
      stream,
      deltaBase64,
      text: decodeBase64Utf8(deltaBase64),
      capReached: params.capReached === true,
      raw: notification,
    }
  }
  if (notification.method === 'process/exited') {
    const processHandle = stringField(params.processHandle)
    const exitCode = numberField(params.exitCode)
    if (!processHandle || exitCode === undefined) return undefined
    return {
      type: 'processExited',
      processHandle,
      exitCode,
      stdout: stringField(params.stdout) ?? '',
      stderr: stringField(params.stderr) ?? '',
      stdoutCapReached: params.stdoutCapReached === true,
      stderrCapReached: params.stderrCapReached === true,
      raw: notification,
    }
  }
  if (notification.method === 'fs/changed') {
    const watchId = stringField(params.watchId)
    const changedPaths = Array.isArray(params.changedPaths) ? params.changedPaths.filter((path): path is string => typeof path === 'string') : []
    if (!watchId) return undefined
    return {
      type: 'fsChanged',
      watchId,
      changedPaths,
      raw: notification,
    }
  }
  if (notification.method.startsWith('thread/realtime/')) {
    return realtimeEventFromAppServerThreadTurnItem(notification, params)
  }
  if (notification.method === 'account/updated' || notification.method === 'account/rateLimits/updated' || notification.method === 'account/login/completed') {
    return {
      type: 'account',
      event: notification.method === 'account/updated' ? 'updated' : notification.method === 'account/rateLimits/updated' ? 'rateLimitsUpdated' : 'loginCompleted',
      detail: notification.params,
      raw: notification,
    }
  }
  if (notification.method === 'mcpServer/oauthLogin/completed') {
    const server = stringField(params.name)
    if (!server) return undefined
    return {
      type: 'mcpStatus',
      server,
      status: params.success === true ? 'oauthLoginCompleted' : 'oauthLoginFailed',
      error: stringField(params.error) ?? null,
      raw: notification,
    }
  }
  if (notification.method === 'mcpServer/startupStatus/updated') {
    const server = stringField(params.name)
    if (!server) return undefined
    return {
      type: 'mcpStatus',
      server,
      status: stringField(params.status) ?? agentChatStringPreview(params.status),
      error: stringField(params.error) ?? null,
      raw: notification,
    }
  }
  if (notification.method === 'remoteControl/status/changed') {
    return {
      type: 'systemNotice',
      level: 'info',
      code: notification.method,
      title: 'Remote control status changed',
      detail: agentChatRemoteControlStatusDetail(params),
      raw: notification,
    }
  }
  if (notification.method === 'externalAgentConfig/import/completed') {
    return {
      type: 'systemNotice',
      level: 'info',
      code: notification.method,
      title: 'External agent config imported',
      detail: null,
      raw: notification,
    }
  }
  if (notification.method === 'warning' || notification.method === 'guardianWarning') {
    const title = stringField(params.message)
    if (!title) return undefined
    return {
      type: 'systemNotice',
      level: 'warning',
      code: notification.method,
      threadId: stringField(params.threadId),
      title,
      detail: null,
      raw: notification,
    }
  }
  if (notification.method === 'windows/worldWritableWarning') {
    const samplePaths = Array.isArray(params.samplePaths) ? params.samplePaths.filter((item): item is string => typeof item === 'string') : []
    const extraCount = numberField(params.extraCount)
    return {
      type: 'systemNotice',
      level: 'warning',
      code: notification.method,
      title: 'World-writable paths detected',
      detail: [
        ...samplePaths,
        extraCount ? `${extraCount} additional path(s)` : null,
        params.failedScan === true ? 'Scan failed before completing.' : null,
      ].filter(Boolean).join('\n') || null,
      raw: notification,
    }
  }
  if (notification.method === 'windowsSandbox/setupCompleted') {
    const success = params.success === true
    return {
      type: 'systemNotice',
      level: success ? 'info' : 'error',
      code: notification.method,
      title: success ? 'Windows sandbox setup completed' : 'Windows sandbox setup failed',
      detail: agentChatWindowsSandboxSetupDetail(params),
      raw: notification,
    }
  }
  if (notification.method === 'configWarning' || notification.method === 'deprecationNotice') {
    const title = stringField(params.summary)
    if (!title) return undefined
    return {
      type: 'systemNotice',
      level: 'warning',
      code: notification.method,
      title,
      detail: notification.method === 'configWarning'
        ? agentChatConfigWarningDetail(params)
        : stringField(params.details) ?? null,
      raw: notification,
    }
  }
  return undefined
}
