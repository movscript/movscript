import i18n from '@/i18n'

export interface APIErrorBody {
  code?: string
  message?: string
  error?: string
  action?: string
}

const CODE_KEYS: Record<string, string> = {
  AUTH_REQUIRED: 'apiErrors.authRequired',
  NOT_FOUND: 'apiErrors.notFound',
  INVALID_INPUT: 'apiErrors.invalidInput',
  FORBIDDEN: 'apiErrors.forbidden',
  INTERNAL_ERROR: 'apiErrors.internalError',
  CYCLE_DETECTED: 'apiErrors.cycleDetected',
  CONFLICT: 'apiErrors.conflict',
}

const EXACT_KEYS: Record<string, string> = {
  '请先登录': 'apiErrors.authRequired',
  '权限不足': 'apiErrors.permissionDenied',
  '未登录': 'apiErrors.authRequired',
  'not authenticated': 'apiErrors.authRequired',
  'invalid MCP token': 'apiErrors.authRequired',
  forbidden: 'apiErrors.forbidden',
  'access denied': 'apiErrors.accessDenied',
  'not found': 'apiErrors.notFound',
  'folder not found': 'apiErrors.folderNotFound',
  'asset not found': 'apiErrors.assetNotFound',
  'feature not found': 'apiErrors.featureNotFound',
  'model config not found': 'apiErrors.modelConfigNotFound',
  'credential not found': 'apiErrors.credentialNotFound',
  'file required': 'apiErrors.fileRequired',
  'failed to read file': 'apiErrors.failedReadFile',
  'failed to store file': 'apiErrors.failedStoreFile',
  'failed to retrieve file': 'apiErrors.failedRetrieveFile',
  '用户名已存在': 'apiErrors.usernameExists',
  '用户名或密码错误': 'apiErrors.invalidCredentials',
  'failed to hash password': 'apiErrors.passwordHashFailed',
  'AI service not configured': 'apiErrors.aiNotConfigured',
  '暂无可用的 AI 提供商，请先在 AI 配置中添加并启用提供商': 'apiErrors.noAIProviderConfigured',
  '剧本不存在': 'apiErrors.scriptNotFound',
  '剧本内容不能为空': 'apiErrors.scriptContentEmpty',
  'AI 返回格式异常，请重试': 'apiErrors.aiBadResponse',
  '项目不存在': 'apiErrors.projectNotFound',
  '制作不存在': 'apiErrors.episodeNotFound',
  '分场不存在': 'apiErrors.sceneNotFound',
  '分镜不存在': 'apiErrors.storyboardNotFound',
  '镜头不存在': 'apiErrors.shotNotFound',
  '成片不存在': 'apiErrors.finalVideoNotFound',
  '该分场已关联到此制作': 'apiErrors.sceneAlreadyLinked',
  '需要导演或所有者权限': 'apiErrors.directorOrOwnerRequired',
  '需要写权限才能上传到此文件夹': 'apiErrors.writePermissionRequired',
  'invalid id': 'apiErrors.invalidId',
  'invalid user id': 'apiErrors.invalidUserId',
  'permission must be read or write': 'apiErrors.invalidPermission',
  'cannot grant permission to yourself': 'apiErrors.cannotGrantSelf',
  'no storage key': 'apiErrors.noStorageKey',
  'job_type is required': 'apiErrors.jobTypeRequired',
  'succeeded jobs cannot be retried': 'apiErrors.succeededJobRetry',
  'running jobs cannot be retried until they fail or time out': 'apiErrors.runningJobRetry',
  'only video generation jobs can be cancelled': 'apiErrors.cancelVideoOnly',
  'finished jobs cannot be cancelled': 'apiErrors.cancelFinishedJob',
  'this provider does not support video task cancellation': 'apiErrors.cancelUnsupported',
  'running jobs must be cancelled before deletion': 'apiErrors.deleteRunningJob',
  'canvas not found': 'apiErrors.canvasNotFound',
  'node not found': 'apiErrors.nodeNotFound',
  'run not found': 'apiErrors.runNotFound',
  'no task': 'apiErrors.noTask',
  'workflow canvases must be run as a workflow': 'apiErrors.workflowRunRequired',
  'only workflow canvases can create run records': 'apiErrors.workflowCanvasRequired',
  'cycle detected in canvas': 'apiErrors.cycleDetected',
  'canvas_type must be inspiration or workflow': 'apiErrors.invalidCanvasType',
  'invalid config_type: must be s3, oss, or tos': 'apiErrors.invalidCloudConfigType',
  'capability or feature query param required': 'apiErrors.capabilityOrFeatureRequired',
  'this provider does not support model listing': 'apiErrors.modelListingUnsupported',
  'custom_capabilities is required (e.g. "text" or "image")': 'apiErrors.customCapabilitiesRequired',
}

const PREFIX_KEYS: Array<[string, string]> = [
  ['unknown adapter type:', 'apiErrors.unknownAdapterType'],
  ['missing required credential:', 'apiErrors.missingCredentialField'],
  ['invalid job_type:', 'apiErrors.invalidJobType'],
  ['failed to load input resources:', 'apiErrors.loadInputResourcesFailed'],
  ['provider cancellation failed:', 'apiErrors.providerCancellationFailed'],
  ['no AI provider available:', 'apiErrors.noAIProviderAvailable'],
  ['encrypt config:', 'apiErrors.encryptConfigFailed'],
  ['AI 分析失败:', 'apiErrors.aiAnalyzeFailed'],
  ['job cannot be cancelled from status', 'apiErrors.cancelStatusInvalid'],
]

export function translateApiError(input: unknown, fallbackKey = 'common.requestFailed'): string {
  const body = input as APIErrorBody | undefined
  const raw = body?.message ?? body?.error

  if (body?.code && CODE_KEYS[body.code]) {
    return i18n.t(CODE_KEYS[body.code], { defaultValue: raw || i18n.t(fallbackKey) })
  }

  if (!raw) return i18n.t(fallbackKey)

  const exactKey = EXACT_KEYS[raw]
  if (exactKey) return i18n.t(exactKey)

  const prefix = PREFIX_KEYS.find(([value]) => raw.startsWith(value))
  if (prefix) {
    const detail = raw.slice(prefix[0].length).trim()
    return i18n.t(prefix[1], { detail })
  }

  return raw
}
