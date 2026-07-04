import { join } from 'node:path'

export interface BackendSpawnEnvInput {
  dataDir: string
  localSecret: string
  inheritedEnv?: NodeJS.ProcessEnv
}

export function buildBackendSpawnEnv(input: BackendSpawnEnvInput): NodeJS.ProcessEnv {
  const inherited = input.inheritedEnv ?? process.env
  const dependencyProfile = inherited.MOVSCRIPT_DEPENDENCY_PROFILE?.trim() || 'local'
  const externalDependencies = dependencyProfile === 'external'
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    MOVSCRIPT_DEPENDENCY_PROFILE: dependencyProfile,
    GIN_MODE: inherited.GIN_MODE?.trim() || 'release',
    DB_DRIVER: inherited.DB_DRIVER?.trim() || (externalDependencies ? 'postgres' : 'sqlite'),
    STORAGE_BACKEND: inherited.STORAGE_BACKEND?.trim() || (externalDependencies ? 'minio' : 'filesystem'),
    CACHE_BACKEND: inherited.CACHE_BACKEND?.trim() || (externalDependencies ? 'redis' : 'memory'),
    MOVSCRIPT_DATA_DIR: input.dataDir,
    GIT_PROXY_TOKEN_SECRET: inherited.GIT_PROXY_TOKEN_SECRET?.trim() || input.localSecret,
    MOVSCRIPT_WORKSPACE_BACKEND: inherited.MOVSCRIPT_WORKSPACE_BACKEND?.trim() || (externalDependencies ? 'gitea' : 'http'),
    MOVSCRIPT_WORKSPACE_STORAGE_BACKEND: inherited.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND?.trim() || (externalDependencies ? 'gitea' : 'http'),
    MOVSCRIPT_GIT_HTTP_ROOT: inherited.MOVSCRIPT_GIT_HTTP_ROOT?.trim() || join(input.dataDir, 'git'),
    MOVSCRIPT_GIT_BINARY: inherited.MOVSCRIPT_GIT_BINARY?.trim() || 'git',
    MOVSCRIPT_GITEA_BASE_URL: inherited.MOVSCRIPT_GITEA_BASE_URL?.trim() || (externalDependencies ? 'http://localhost:3303' : ''),
    MOVSCRIPT_GITEA_ADMIN_USERNAME: inherited.MOVSCRIPT_GITEA_ADMIN_USERNAME?.trim() || (externalDependencies ? 'movscript' : ''),
    MOVSCRIPT_GITEA_ADMIN_PASSWORD: inherited.MOVSCRIPT_GITEA_ADMIN_PASSWORD?.trim() || (externalDependencies ? 'movscript12345' : ''),
  }

  if (externalDependencies || inherited.MOVSCRIPT_GITEA_REPO_PREFIX) {
    env.MOVSCRIPT_GITEA_REPO_PREFIX = inherited.MOVSCRIPT_GITEA_REPO_PREFIX?.trim() || 'movscript-project-'
  }
  if (externalDependencies || inherited.MOVSCRIPT_GITEA_BRANCH) {
    env.MOVSCRIPT_GITEA_BRANCH = inherited.MOVSCRIPT_GITEA_BRANCH?.trim() || 'main'
  }
  if (externalDependencies || inherited.MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN) {
    env.MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN = inherited.MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN?.trim() || 'users.movscript.local'
  }
  if (externalDependencies || inherited.MOVSCRIPT_GITEA_USER_TOKEN_NAME) {
    env.MOVSCRIPT_GITEA_USER_TOKEN_NAME = inherited.MOVSCRIPT_GITEA_USER_TOKEN_NAME?.trim() || 'movscript-desktop'
  }
  if (inherited.MOVSCRIPT_GITEA_TOKEN) env.MOVSCRIPT_GITEA_TOKEN = inherited.MOVSCRIPT_GITEA_TOKEN

  return env
}
