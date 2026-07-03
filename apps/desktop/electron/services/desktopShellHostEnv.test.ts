import assert from 'node:assert/strict'
import { delimiter, resolve } from 'node:path'
import test from 'node:test'
import { desktopShellHostEnv } from './desktopShellHostEnv'

test('desktopShellHostEnv injects data service auth and base URL for movscript CLI', () => {
  const workspaceDir = resolve('/tmp/movscript-workspace')
  const projectDir = resolve(workspaceDir, 'projects/demo-film')
  const cliBinDir = resolve(workspaceDir, 'bin')
  const env = desktopShellHostEnv({
    inheritedEnv: {
      PATH: '/usr/bin',
    },
    platform: 'darwin',
    workspaceDir,
    projectDir,
    userId: 'user_1',
    orgId: 'org_1',
    projectId: '42',
    resolveBackendSession: () => ({
      workspaceDir,
      baseURL: 'http://localhost:8765',
      apiBaseURL: 'http://localhost:8765/api/v1',
      token: 'backend-token',
      tokenType: 'Bearer',
      userId: '42',
      configPath: resolve(workspaceDir, 'backend/config.json'),
      authPath: resolve(workspaceDir, 'backend/auth.json'),
    }),
    resolveCliBinDir: () => cliBinDir,
  })

  assert.equal(env.MOVSCRIPT_WORKSPACE_DIR, workspaceDir)
  assert.equal(env.MOVSCRIPT_PROJECT_DIR, projectDir)
  assert.equal(env.MOVSCRIPT_USER_ID, 'user_1')
  assert.equal(env.MOVSCRIPT_ORG_ID, 'org_1')
  assert.equal(env.MOVSCRIPT_PROJECT_ID, '42')
  assert.equal(env.MOVSCRIPT_DATA_SERVICE_URL, 'http://localhost:8765')
  assert.equal(env.MOVSCRIPT_DATA_SERVICE_TOKEN, 'backend-token')
  assert.equal(env.MOVSCRIPT_CLI_BIN_DIR, cliBinDir)
  assert.equal(env.PATH, [
    cliBinDir,
    '/usr/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(delimiter))
  assert.equal(env.TERM, 'xterm-256color')
  assert.equal(env.COLORTERM, 'truecolor')
})

test('desktopShellHostEnv preserves inherited terminal settings and strips legacy backend env when data service session is anonymous', () => {
  const workspaceDir = resolve('/tmp/movscript-workspace')
  const env = desktopShellHostEnv({
    inheritedEnv: {
      PATH: '/custom/bin',
      TERM: 'screen-256color',
      COLORTERM: '24bit',
      MOVSCRIPT_API_BASE_URL: 'http://legacy.example',
      MOVSCRIPT_BACKEND_AUTH_TOKEN: 'legacy-backend-token',
    },
    workspaceDir,
    platform: 'darwin',
    resolveBackendSession: () => ({
      workspaceDir,
      baseURL: 'http://backend.internal:8765',
      apiBaseURL: 'http://backend.internal:8765/api/v1',
      tokenType: 'Bearer',
      configPath: resolve(workspaceDir, 'backend/config.json'),
      authPath: resolve(workspaceDir, 'backend/auth.json'),
    }),
    resolveCliBinDir: () => undefined,
  })

  assert.equal(env.MOVSCRIPT_DATA_SERVICE_URL, 'http://backend.internal:8765')
  assert.equal(env.MOVSCRIPT_API_BASE_URL, undefined)
  assert.equal(env.MOVSCRIPT_BACKEND_AUTH_TOKEN, undefined)
  assert.equal(env.TERM, 'screen-256color')
  assert.equal(env.COLORTERM, '24bit')
  assert.equal(env.PATH, [
    '/custom/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ].join(delimiter))
})

test('desktopShellHostEnv preserves Windows Path key and delimiter', () => {
  const workspaceDir = 'C:\\Users\\me\\AppData\\Local\\MovScript\\Home'
  const cliBinDir = 'C:\\Users\\me\\AppData\\Local\\MovScript\\Home\\bin'
  const env = desktopShellHostEnv({
    inheritedEnv: {
      Path: 'C:\\Windows',
    },
    workspaceDir,
    platform: 'win32',
    resolveBackendSession: () => ({
      workspaceDir,
      baseURL: 'http://localhost:8765',
      apiBaseURL: 'http://localhost:8765/api/v1',
      tokenType: 'Bearer',
      configPath: `${workspaceDir}\\backend\\config.json`,
      authPath: `${workspaceDir}\\backend\\auth.json`,
    }),
    resolveCliBinDir: () => cliBinDir,
  })

  assert.equal(env.Path, `${cliBinDir};C:\\Windows;C:\\Windows\\System32;C:\\Windows\\System32\\Wbem`)
  assert.equal(env.PATH, undefined)
  assert.equal(env.MOVSCRIPT_WORKSPACE_DIR, workspaceDir)
})
