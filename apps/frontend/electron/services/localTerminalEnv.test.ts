import assert from 'node:assert/strict'
import { delimiter, resolve } from 'node:path'
import test from 'node:test'
import { localTerminalEnv } from './localTerminalEnv'

test('localTerminalEnv injects backend auth and base URL for movcli', () => {
  const workspaceDir = resolve('/tmp/movscript-workspace')
  const projectDir = resolve(workspaceDir, 'realms/local/user/1/projects/project_42')
  const cliBinDir = resolve(workspaceDir, 'bin')
  const env = localTerminalEnv({
    inheritedEnv: {
      PATH: '/usr/bin',
    },
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
  assert.equal(env.MOVSCRIPT_API_BASE_URL, 'http://localhost:8765')
  assert.equal(env.MOVCLI_TOKEN, 'backend-token')
  assert.equal(env.MOVCLI_USER_ID, '42')
  assert.equal(env.MOVSCRIPT_CLI_BIN_DIR, cliBinDir)
  assert.equal(env.PATH, `${cliBinDir}${delimiter}/usr/bin`)
  assert.equal(env.TERM, 'xterm-256color')
  assert.equal(env.COLORTERM, 'truecolor')
})

test('localTerminalEnv preserves inherited terminal settings and env token when backend session is anonymous', () => {
  const workspaceDir = resolve('/tmp/movscript-workspace')
  const env = localTerminalEnv({
    inheritedEnv: {
      PATH: '/custom/bin',
      TERM: 'screen-256color',
      COLORTERM: '24bit',
      MOVCLI_TOKEN: 'inherited-token',
    },
    workspaceDir,
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

  assert.equal(env.MOVSCRIPT_API_BASE_URL, 'http://backend.internal:8765')
  assert.equal(env.MOVCLI_TOKEN, 'inherited-token')
  assert.equal(env.TERM, 'screen-256color')
  assert.equal(env.COLORTERM, '24bit')
  assert.equal(env.PATH, '/custom/bin')
})
