import { join } from 'path'

import { LOCAL_BACKEND_PORT } from './constants'

export function buildBackendSpawnEnv(input: {
  dataDir: string
  localSecret: string
  inheritedEnv?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  const inheritedEnv = input.inheritedEnv ?? process.env
  const dependencyProfile = inheritedEnv.MOVSCRIPT_DEPENDENCY_PROFILE || 'local'
  const externalDependencies = dependencyProfile === 'external'
  const workspaceBackend = inheritedEnv.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND || inheritedEnv.MOVSCRIPT_WORKSPACE_BACKEND || (externalDependencies ? 'gitea' : 'http')
  const giteaEnabled = workspaceBackend === 'gitea'
  const giteaAdminUsername = inheritedEnv.MOVSCRIPT_GITEA_ADMIN_USERNAME || inheritedEnv.GITEA_ADMIN_USERNAME || (giteaEnabled ? 'movscript' : '')
  const giteaAdminPassword = inheritedEnv.MOVSCRIPT_GITEA_ADMIN_PASSWORD || inheritedEnv.GITEA_ADMIN_PASSWORD || (giteaEnabled ? 'movscript12345' : '')
  return {
    ...inheritedEnv,
    MOVSCRIPT_DEPENDENCY_PROFILE: dependencyProfile,
    MOVSCRIPT_APP_MODE: inheritedEnv.MOVSCRIPT_APP_MODE || 'local',
    MOVSCRIPT_DATA_DIR: inheritedEnv.MOVSCRIPT_DATA_DIR || input.dataDir,
    SERVER_PORT: inheritedEnv.SERVER_PORT || LOCAL_BACKEND_PORT,
    DB_DRIVER: inheritedEnv.DB_DRIVER || (externalDependencies ? 'postgres' : 'sqlite'),
    DB_PATH: inheritedEnv.DB_PATH || join(input.dataDir, 'movscript-frontend.db'),
    STORAGE_BACKEND: inheritedEnv.STORAGE_BACKEND || (externalDependencies ? 'minio' : 'filesystem'),
    FILESYSTEM_STORAGE_ROOT: inheritedEnv.FILESYSTEM_STORAGE_ROOT || join(input.dataDir, 'resources'),
    CACHE_BACKEND: inheritedEnv.CACHE_BACKEND || (externalDependencies ? 'redis' : 'memory'),
    ENCRYPTION_KEY: inheritedEnv.ENCRYPTION_KEY || input.localSecret,
    AUTH_TOKEN_SECRET: inheritedEnv.AUTH_TOKEN_SECRET || input.localSecret,
	MOVSCRIPT_WORKSPACE_BACKEND: inheritedEnv.MOVSCRIPT_WORKSPACE_BACKEND || workspaceBackend,
    MOVSCRIPT_WORKSPACE_STORAGE_BACKEND: workspaceBackend,
    MOVSCRIPT_GIT_HTTP_ROOT: inheritedEnv.MOVSCRIPT_GIT_HTTP_ROOT || join(input.dataDir, 'git'),
    MOVSCRIPT_GIT_BINARY: inheritedEnv.MOVSCRIPT_GIT_BINARY || 'git',
    MOVSCRIPT_GITEA_BASE_URL: inheritedEnv.MOVSCRIPT_GITEA_BASE_URL || (giteaEnabled ? 'http://localhost:3303' : ''),
    MOVSCRIPT_GITEA_TOKEN: inheritedEnv.MOVSCRIPT_GITEA_TOKEN || '',
    MOVSCRIPT_GITEA_ADMIN_USERNAME: giteaAdminUsername,
    MOVSCRIPT_GITEA_ADMIN_PASSWORD: giteaAdminPassword,
    MOVSCRIPT_GITEA_REPO_PREFIX: inheritedEnv.MOVSCRIPT_GITEA_REPO_PREFIX || 'movscript-project-',
    MOVSCRIPT_GITEA_BRANCH: inheritedEnv.MOVSCRIPT_GITEA_BRANCH || 'main',
    MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN: inheritedEnv.MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN || 'users.movscript.local',
    MOVSCRIPT_GITEA_USER_TOKEN_NAME: inheritedEnv.MOVSCRIPT_GITEA_USER_TOKEN_NAME || 'movscript-desktop',
  }
}
