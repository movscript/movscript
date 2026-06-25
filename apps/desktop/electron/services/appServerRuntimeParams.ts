import type {
  AgentChatInput,
  AgentThreadExecutionSettings,
} from '@movscript/agent-chat'
import type {
  AgentRuntimeRpcRequestMap,
} from '../../src/shared/infrastructure/agent-runtime/agentRuntimeProtocol'
import {
  resolveDesktopWorkspaceContextPaths,
} from './workspaceRealm'

export interface AppServerRuntimeParamsContext {
  workspaceDir: string
  config?: Record<string, unknown>
}

export function appServerThreadStartParams(
  params: AgentRuntimeRpcRequestMap['thread/start'],
  context: AppServerRuntimeParamsContext,
): Record<string, unknown> {
  return compactParams({
    ...appServerThreadRunOptions(recordFromParams(params), context),
    sessionStartSource: 'startup',
    threadSource: 'user',
    ...(context.config ? { config: context.config } : {}),
  })
}

export function appServerThreadResumeParams(
  params: AgentRuntimeRpcRequestMap['thread/resume'],
  context: AppServerRuntimeParamsContext,
): Record<string, unknown> {
  return compactParams({
    threadId: params.threadId,
    ...appServerThreadRunOptions(recordFromParams(params), context),
    ...(context.config ? { config: context.config } : {}),
  })
}

export function appServerThreadSettingsUpdateParams(
  params: AgentRuntimeRpcRequestMap['thread/settings/update'],
  context: AppServerRuntimeParamsContext,
): Record<string, unknown> {
  return compactParams({
    threadId: params.threadId,
    ...appServerTurnRunOptions(recordFromParams(params), context),
  })
}

export function appServerTurnStartParams(
  params: AgentRuntimeRpcRequestMap['turn/start'],
  context: AppServerRuntimeParamsContext,
): Record<string, unknown> {
  return compactParams({
    threadId: params.threadId,
    clientUserMessageId: params.clientUserMessageId,
    input: params.inputs.map(appServerUserInput),
    ...appServerTurnRunOptions(recordFromParams(params), context),
  })
}

export function appServerTurnSteerParams(
  params: AgentRuntimeRpcRequestMap['turn/steer'],
): Record<string, unknown> {
  return compactParams({
    threadId: params.threadId,
    expectedTurnId: params.turnId,
    clientUserMessageId: params.clientUserMessageId,
    input: params.inputs.map(appServerUserInput),
  })
}

export function appServerExecutionSettings(
  params: AgentRuntimeRpcRequestMap['thread/settings/update'],
  context: AppServerRuntimeParamsContext,
): AgentThreadExecutionSettings {
  const options = appServerNeutralRunOptions(recordFromParams(params), context)
  return compactParams({
    model: options.model,
    modelProvider: options.modelProvider,
    cwd: options.cwd,
    approvalPolicy: options.approvalPolicy,
    approvalsReviewer: options.approvalsReviewer,
    permissions: options.permissions,
    sandbox: options.sandboxMode,
    sandboxPolicy: sandboxPolicyFromMode(options.sandboxMode, options.cwd),
  }) as AgentThreadExecutionSettings
}

function appServerThreadRunOptions(
  input: Record<string, unknown>,
  context: AppServerRuntimeParamsContext,
): Record<string, unknown> {
  const options = appServerNeutralRunOptions(input, context)
  return compactParams({
    cwd: options.cwd,
    model: options.model,
    modelProvider: options.modelProvider,
    approvalPolicy: options.approvalPolicy,
    approvalsReviewer: options.approvalsReviewer,
    ...(options.permissions ? { permissions: options.permissions } : { sandbox: options.sandboxMode }),
  })
}

function appServerTurnRunOptions(
  input: Record<string, unknown>,
  context: AppServerRuntimeParamsContext,
): Record<string, unknown> {
  const options = appServerNeutralRunOptions(input, context)
  return compactParams({
    cwd: options.cwd,
    model: options.model,
    modelProvider: options.modelProvider,
    approvalPolicy: options.approvalPolicy,
    approvalsReviewer: options.approvalsReviewer,
    ...(options.permissions ? { permissions: options.permissions } : { sandboxPolicy: sandboxPolicyFromMode(options.sandboxMode, options.cwd) }),
  })
}

function appServerNeutralRunOptions(
  input: Record<string, unknown>,
  context: AppServerRuntimeParamsContext,
): {
  cwd?: string
  model?: string
  modelProvider?: string
  approvalPolicy?: string
  approvalsReviewer?: string
  permissions?: string
  sandboxMode?: string
} {
  const runProfile = isRecord(input.runProfile) ? input.runProfile : undefined
  return {
    cwd: resolveAppServerRuntimeCwd(input, context.workspaceDir),
    model: stringField(input.model),
    modelProvider: stringField(input.modelProvider),
    approvalPolicy: stringField(input.approvalPolicy) ?? stringField(runProfile?.approvalPolicy),
    approvalsReviewer: stringField(input.approvalsReviewer) ?? stringField(runProfile?.approvalsReviewer),
    permissions: stringField(input.permissions) ?? stringField(runProfile?.permissionProfileId),
    sandboxMode: stringField(input.sandbox) ?? stringField(input.sandboxPolicy) ?? stringField(runProfile?.fallbackSandbox),
  }
}

function resolveAppServerRuntimeCwd(input: Record<string, unknown>, workspaceDir: string): string | undefined {
  const explicitCwd = stringField(input.cwd)
  if (explicitCwd) return explicitCwd
  if (input.cwd === null) return undefined
  const workspaceContext = isRecord(input.workspaceContext) ? input.workspaceContext : undefined
  if (!workspaceContext) return workspaceDir
  return resolveDesktopWorkspaceContextPaths({
    workspaceDir,
    workspaceContext,
  }).providerSessionCwd
}

function sandboxPolicyFromMode(mode: string | undefined, cwd: string | undefined): unknown {
  if (mode === 'danger-full-access') return { type: 'dangerFullAccess' }
  if (mode === 'read-only') return { type: 'readOnly', networkAccess: false }
  if (mode === 'workspace-write') {
    return {
      type: 'workspaceWrite',
      writableRoots: cwd ? [cwd] : [],
      networkAccess: false,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    }
  }
  return undefined
}

function appServerUserInput(input: AgentChatInput): Record<string, unknown> {
  if (input.type === 'text') {
    return {
      type: 'text',
      text: input.text,
      text_elements: input.textElements ?? [],
    }
  }
  if (input.type === 'image') {
    return compactParams({
      type: 'image',
      url: input.url,
      detail: input.detail,
    })
  }
  if (input.type === 'localImage') {
    return compactParams({
      type: 'localImage',
      path: input.path,
      detail: input.detail,
    })
  }
  if (input.type === 'skill') return { type: 'skill', name: input.name, path: input.path }
  return { type: 'mention', name: input.name, path: input.path }
}

function compactParams<T extends object>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function recordFromParams(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
