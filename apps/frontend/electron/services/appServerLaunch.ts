import {
  appServerSpawnEnvironmentFromDistribution,
  type AppServerConfigDistribution,
} from './appServerConfigDistribution'
import { existsSync } from 'node:fs'
import type { ElectronAppServerStatus } from '../../src/shared/contracts/electronApi'

export type AppServerLaunchIdentity = {
  executablePath: string
  home: string
  workspaceDir: string
  providerSessionCwd: string
  configHash: string
}

export type AppServerLaunchReusable = {
  executablePath: string
  home: string
  workspaceDir?: string
  providerSessionCwd?: string
  configDistribution: Pick<AppServerConfigDistribution, 'hash'>
}

export function appServerLaunchIdentity(input: {
  executablePath: string
  home: string
  workspaceDir: string
  providerSessionCwd: string
  configDistribution: Pick<AppServerConfigDistribution, 'hash'>
}): AppServerLaunchIdentity {
  return {
    executablePath: input.executablePath,
    home: input.home,
    workspaceDir: input.workspaceDir,
    providerSessionCwd: input.providerSessionCwd,
    configHash: input.configDistribution.hash,
  }
}

export function appServerLaunchCanReuse(
  existing: AppServerLaunchReusable,
  target: AppServerLaunchIdentity,
): boolean {
  return existing.configDistribution.hash === target.configHash
    && existing.executablePath === target.executablePath
    && existing.workspaceDir === target.workspaceDir
    && existing.providerSessionCwd === target.providerSessionCwd
    && existing.home === target.home
}

export function appServerLaunchEnv(input: {
  profileId: string
  configDistribution: AppServerConfigDistribution
  inheritedEnv?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  const env = appServerSpawnEnvironmentFromDistribution(input.configDistribution, input.inheritedEnv)
  return {
    ...env,
    RUST_LOG: env.RUST_LOG?.trim() || 'info',
    MOVSCRIPT_APP_SERVER_PROFILE_ID: input.profileId,
  }
}

export function appServerAccountMissingStatus(input: {
  profileId: string
  distribution: AppServerConfigDistribution
}): ElectronAppServerStatus {
  const config = appServerConfigStatusFromDistribution(input.distribution)
  return {
    ok: false,
    running: false,
    managed: true,
    profileId: input.profileId,
    home: input.distribution.home,
    config,
    preflight: appServerPreflightFromDistribution(input.distribution),
    error: 'app-server 账号未配置。请先在 MovScript 控制台为对应 provider 配置账号，或继承本机账号 / MovScript 后端 Key / 自定义 API Key。',
  }
}

export function appServerPreflightFromDistribution(distribution: AppServerConfigDistribution): NonNullable<ElectronAppServerStatus['preflight']> {
  const configTomlExists = existsSync(distribution.configTomlPath)
  const authJsonExists = existsSync(distribution.authJsonPath)
  const env = appServerSpawnEnvironmentFromDistribution(distribution, {})
  const spawnEnvReady = Boolean(env.MOVSCRIPT_APP_SERVER_HOME && (!distribution.apiKeyConfigured || env.OPENAI_API_KEY))
  const ok = configTomlExists && (!distribution.accountConfigured || authJsonExists) && distribution.accountConfigured && spawnEnvReady
  return {
    ok,
    configTomlExists,
    authJsonExists,
    spawnEnvReady,
    accountConfigured: distribution.accountConfigured,
    detail: appServerPreflightDetail({
      configTomlExists,
      authJsonExists,
      spawnEnvReady,
      accountConfigured: distribution.accountConfigured,
      apiKeyConfigured: distribution.apiKeyConfigured,
    }),
  }
}

export function appServerConfigStatusFromDistribution(distribution: AppServerConfigDistribution): NonNullable<ElectronAppServerStatus['config']> {
  return {
    ok: distribution.ok,
    sourceConfigPath: distribution.sourceConfigPath,
    configTomlPath: distribution.configTomlPath,
    authJsonPath: distribution.authJsonPath,
    baseURL: distribution.baseURL,
    apiKind: distribution.apiKind,
    apiKeyConfigured: distribution.apiKeyConfigured,
    accountConfigured: distribution.accountConfigured,
    accountSource: distribution.accountSource,
    distributedAt: distribution.distributedAt,
    ...(distribution.warning ? { warning: distribution.warning } : {}),
  }
}

function appServerPreflightDetail(input: {
  configTomlExists: boolean
  authJsonExists: boolean
  spawnEnvReady: boolean
  accountConfigured: boolean
  apiKeyConfigured: boolean
}): string {
  if (!input.configTomlExists) return 'app-server config.toml has not been distributed.'
  if (!input.accountConfigured) return 'app-server account is not configured in MovScript.'
  if (!input.authJsonExists) return 'app-server auth.json has not been distributed.'
  if (!input.spawnEnvReady) return input.apiKeyConfigured
    ? 'app-server launch environment is missing OPENAI_API_KEY.'
    : 'app-server launch environment is missing provider home.'
  return 'app-server config preflight passed.'
}
