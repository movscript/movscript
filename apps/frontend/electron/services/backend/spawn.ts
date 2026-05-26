import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { app } from 'electron'

import { LOCAL_BACKEND_PORT } from './constants'
import {
  resolveAdminDir,
  resolveBackendBinary,
  resolveBackendCwd,
  resolveLocalDataDir,
  resolveLocalSecret,
} from './paths'
import { writeBackendPid } from './pid'

export function spawnBackendProcess(): ChildProcess {
  const bin = resolveBackendBinary()
  const adminDir = resolveAdminDir()
  const dataDir = resolveLocalDataDir()
  const localSecret = resolveLocalSecret(dataDir)

  const child = spawn(bin, [], {
    cwd: resolveBackendCwd(bin),
    detached: app.isPackaged,
    env: {
      ...process.env,
      MOVSCRIPT_APP_MODE: process.env.MOVSCRIPT_APP_MODE || 'local',
      MOVSCRIPT_ADMIN_DIR: process.env.MOVSCRIPT_ADMIN_DIR || adminDir,
      MOVSCRIPT_DATA_DIR: process.env.MOVSCRIPT_DATA_DIR || dataDir,
      SERVER_PORT: process.env.SERVER_PORT || LOCAL_BACKEND_PORT,
      DB_DRIVER: process.env.DB_DRIVER || 'sqlite',
      DB_PATH: process.env.DB_PATH || join(dataDir, 'movscript-frontend.db'),
      STORAGE_BACKEND: process.env.STORAGE_BACKEND || 'filesystem',
      FILESYSTEM_STORAGE_ROOT: process.env.FILESYSTEM_STORAGE_ROOT || join(dataDir, 'resources'),
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || localSecret,
      AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET || localSecret,
    },
    stdio: app.isPackaged ? 'ignore' : 'inherit',
  })

  if (app.isPackaged) child.unref()
  if (child.pid) writeBackendPid(child.pid)
  return child
}
