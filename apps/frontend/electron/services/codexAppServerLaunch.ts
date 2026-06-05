import {
  codexSpawnEnvironmentFromDistribution,
  type CodexConfigDistribution,
} from './codexConfigDistribution'
import { existsSync } from 'node:fs'
import type { ElectronCodexAppServerStatus } from '../../src/shared/contracts/electronApi'

export type CodexAppServerLaunchIdentity = {
  executablePath: string
  codexHome: string
  workspaceDir: string
  configHash: string
}

export type CodexAppServerLaunchReusable = {
  executablePath: string
  codexHome: string
  workspaceDir?: string
  configDistribution: Pick<CodexConfigDistribution, 'hash'>
}

export function codexAppServerLaunchIdentity(input: {
  executablePath: string
  codexHome: string
  workspaceDir: string
  configDistribution: Pick<CodexConfigDistribution, 'hash'>
}): CodexAppServerLaunchIdentity {
  return {
    executablePath: input.executablePath,
    codexHome: input.codexHome,
    workspaceDir: input.workspaceDir,
    configHash: input.configDistribution.hash,
  }
}

export function codexAppServerLaunchCanReuse(
  existing: CodexAppServerLaunchReusable,
  target: CodexAppServerLaunchIdentity,
): boolean {
  return existing.configDistribution.hash === target.configHash
    && existing.executablePath === target.executablePath
    && existing.workspaceDir === target.workspaceDir
    && existing.codexHome === target.codexHome
}

export function codexAppServerLaunchEnv(input: {
  profileId: string
  configDistribution: CodexConfigDistribution
  inheritedEnv?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  return {
    ...codexSpawnEnvironmentFromDistribution(input.configDistribution, input.inheritedEnv),
    MOVSCRIPT_CODEX_APP_SERVER_PROFILE_ID: input.profileId,
  }
}

export function codexAppServerAccountMissingStatus(input: {
  profileId: string
  distribution: CodexConfigDistribution
}): ElectronCodexAppServerStatus {
  return {
    ok: false,
    running: false,
    managed: true,
    profileId: input.profileId,
    codexHome: input.distribution.codexHome,
    codexConfig: codexConfigStatusFromDistribution(input.distribution),
    preflight: codexAppServerPreflightFromDistribution(input.distribution),
    error: 'Codex 账号未配置。请先在 MovScript 控制台为 Codex 配置账号，或继承本机 ~/.codex / MovScript 后端 Key / 自定义 API Key。',
  }
}

export function codexAppServerPreflightFromDistribution(distribution: CodexConfigDistribution): NonNullable<ElectronCodexAppServerStatus['preflight']> {
  const configTomlExists = existsSync(distribution.configTomlPath)
  const authJsonExists = existsSync(distribution.authJsonPath)
  const env = codexSpawnEnvironmentFromDistribution(distribution, {})
  const spawnEnvReady = Boolean(env.CODEX_HOME && (!distribution.apiKeyConfigured || env.OPENAI_API_KEY))
  const ok = configTomlExists && (!distribution.accountConfigured || authJsonExists) && distribution.accountConfigured && spawnEnvReady
  return {
    ok,
    configTomlExists,
    authJsonExists,
    spawnEnvReady,
    accountConfigured: distribution.accountConfigured,
    detail: codexAppServerPreflightDetail({
      configTomlExists,
      authJsonExists,
      spawnEnvReady,
      accountConfigured: distribution.accountConfigured,
      apiKeyConfigured: distribution.apiKeyConfigured,
    }),
  }
}

export function codexConfigStatusFromDistribution(distribution: CodexConfigDistribution): NonNullable<ElectronCodexAppServerStatus['codexConfig']> {
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

function codexAppServerPreflightDetail(input: {
  configTomlExists: boolean
  authJsonExists: boolean
  spawnEnvReady: boolean
  accountConfigured: boolean
  apiKeyConfigured: boolean
}): string {
  if (!input.configTomlExists) return 'Codex config.toml has not been distributed.'
  if (!input.accountConfigured) return 'Codex account is not configured in MovScript.'
  if (!input.authJsonExists) return 'Codex auth.json has not been distributed.'
  if (!input.spawnEnvReady) return input.apiKeyConfigured
    ? 'Codex launch environment is missing OPENAI_API_KEY.'
    : 'Codex launch environment is missing CODEX_HOME.'
  return 'Codex config preflight passed.'
}
