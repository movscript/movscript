import { join } from 'path'

import { LOCAL_BACKEND_PORT } from './constants'

export function buildBackendSpawnEnv(input: {
  adminDir: string
  dataDir: string
  localSecret: string
  inheritedEnv?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  const inheritedEnv = input.inheritedEnv ?? process.env
  const giteaAdminUsername = inheritedEnv.MOVSCRIPT_GITEA_ADMIN_USERNAME || inheritedEnv.GITEA_ADMIN_USERNAME || 'movscript'
  const giteaAdminPassword = inheritedEnv.MOVSCRIPT_GITEA_ADMIN_PASSWORD || inheritedEnv.GITEA_ADMIN_PASSWORD || 'movscript12345'
  return {
    ...inheritedEnv,
    MOVSCRIPT_APP_MODE: inheritedEnv.MOVSCRIPT_APP_MODE || 'local',
    MOVSCRIPT_ADMIN_DIR: inheritedEnv.MOVSCRIPT_ADMIN_DIR || input.adminDir,
    MOVSCRIPT_DATA_DIR: inheritedEnv.MOVSCRIPT_DATA_DIR || input.dataDir,
    SERVER_PORT: inheritedEnv.SERVER_PORT || LOCAL_BACKEND_PORT,
    DB_DRIVER: inheritedEnv.DB_DRIVER || 'sqlite',
    DB_PATH: inheritedEnv.DB_PATH || join(input.dataDir, 'movscript-frontend.db'),
    STORAGE_BACKEND: inheritedEnv.STORAGE_BACKEND || 'filesystem',
    FILESYSTEM_STORAGE_ROOT: inheritedEnv.FILESYSTEM_STORAGE_ROOT || join(input.dataDir, 'resources'),
    ENCRYPTION_KEY: inheritedEnv.ENCRYPTION_KEY || input.localSecret,
    AUTH_TOKEN_SECRET: inheritedEnv.AUTH_TOKEN_SECRET || input.localSecret,
    MOVSCRIPT_WORKSPACE_BACKEND: inheritedEnv.MOVSCRIPT_WORKSPACE_BACKEND || 'gitea',
    MOVSCRIPT_WORKSPACE_STORAGE_BACKEND: inheritedEnv.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND || inheritedEnv.MOVSCRIPT_WORKSPACE_BACKEND || 'gitea',
    MOVSCRIPT_GITEA_BASE_URL: inheritedEnv.MOVSCRIPT_GITEA_BASE_URL || 'http://localhost:3303',
    MOVSCRIPT_GITEA_TOKEN: inheritedEnv.MOVSCRIPT_GITEA_TOKEN || '',
    MOVSCRIPT_GITEA_ADMIN_USERNAME: giteaAdminUsername,
    MOVSCRIPT_GITEA_ADMIN_PASSWORD: giteaAdminPassword,
    MOVSCRIPT_GITEA_REPO_PREFIX: inheritedEnv.MOVSCRIPT_GITEA_REPO_PREFIX || 'movscript-project-',
    MOVSCRIPT_GITEA_BRANCH: inheritedEnv.MOVSCRIPT_GITEA_BRANCH || 'main',
    MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN: inheritedEnv.MOVSCRIPT_GITEA_USER_EMAIL_DOMAIN || 'users.movscript.local',
    MOVSCRIPT_GITEA_USER_TOKEN_NAME: inheritedEnv.MOVSCRIPT_GITEA_USER_TOKEN_NAME || 'movscript-desktop',
  }
}
