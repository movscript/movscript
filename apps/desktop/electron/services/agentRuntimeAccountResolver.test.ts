import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeMovScriptDataServiceAuth, writeMovScriptDataServiceConfig } from '@movscript/data-client'
import {
  MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
  resolveMovScriptWorkspacePaths,
  writeMovScriptWorkspaceConfig,
} from '@movscript/workspace/home'
import { resolveAgentRuntimeAccountConfig } from './agentRuntimeAccountResolver'
import { writeAgentRuntimeApiKey } from './appSettingsSecrets'

test('agent runtime account resolver uses data service session as model endpoint credentials without writing provider files', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-account-backend-'))
  writeMovScriptDataServiceConfig(workspaceDir, { baseURL: 'http://localhost:8766/api/v1' })
  writeMovScriptDataServiceAuth(workspaceDir, { token: 'mv1.backend-session-token' })
  writeMovScriptWorkspaceConfig(resolveMovScriptWorkspacePaths(workspaceDir).configPath, {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: '2026-06-18T00:00:00.000Z',
    providers: {
      codex: {
        providerRef: 'backend:501',
        config: { mode: 'backendKey', modelProviderRef: 'backend:501' },
        auth: { mode: 'backendKey', modelProviderRef: 'backend:501' },
      },
    },
  })

  const account = resolveAgentRuntimeAccountConfig({
    workspaceDir,
    providerKey: 'codex',
    provider: { id: 'codex', kind: 'codex' },
    runtimeApi: 'codex-sdk',
    preferBackendSession: true,
  })

  assert.equal(account.kind, 'apiKey')
  assert.equal(account.apiKind, 'openai_responses')
  assert.equal(account.accountSource, 'movscript-data-service-session')
  assert.equal(account.modelEndpointBaseURL, 'http://127.0.0.1:8766/v1')
  assert.equal(existsSync(join(workspaceDir, '.codex', 'config.toml')), false)
  assert.equal(existsSync(join(workspaceDir, '.codex', 'auth.json')), false)
})

test('agent runtime account resolver can use local data service without login token', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-account-local-data-service-'))
  writeMovScriptDataServiceConfig(workspaceDir, { baseURL: 'http://localhost:8766/api/v1', realm: { kind: 'local', id: 'local' } })
  writeMovScriptWorkspaceConfig(resolveMovScriptWorkspacePaths(workspaceDir).configPath, {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: '2026-06-18T00:00:00.000Z',
    providers: {
      codex: {
        providerRef: 'backend:local',
        config: { mode: 'backendKey', modelProviderRef: 'backend:local' },
      },
    },
  })

  const account = resolveAgentRuntimeAccountConfig({
    workspaceDir,
    providerKey: 'codex',
    provider: { id: 'codex', kind: 'codex' },
    runtimeApi: 'codex-sdk',
    preferBackendSession: true,
  })

  assert.equal(account.kind, 'apiKey')
  assert.equal(account.apiKey, 'movscript-local-owner')
  assert.equal(account.accountSource, 'movscript-local-data-service')
  assert.equal(account.modelEndpointBaseURL, 'http://127.0.0.1:8766/v1')
})

test('agent runtime account resolver treats Claude as Anthropic by default and reads saved Agent Console keys', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-account-claude-'))
  writeAgentRuntimeApiKey(workspaceDir, {
    providerKey: 'claude-code',
    apiKey: 'sk-ant-saved-key',
  })

  const account = resolveAgentRuntimeAccountConfig({
    workspaceDir,
    providerKey: 'claude',
    provider: { id: 'claude', kind: 'claude' },
    runtimeApi: 'claude-sdk',
    preferBackendSession: false,
  })

  assert.equal(account.kind, 'apiKey')
  assert.equal(account.apiKind, 'anthropic_messages')
  assert.equal(account.accountSource, 'movscript-app-settings')
  assert.equal(account.modelEndpointBaseURL, 'https://api.anthropic.com')
})

test('agent runtime account resolver keeps provider-scoped Anthropic endpoint separate from backend API URL', () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'movscript-agent-runtime-account-anthropic-endpoint-'))
  writeMovScriptWorkspaceConfig(resolveMovScriptWorkspacePaths(workspaceDir).configPath, {
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: '2026-06-18T00:00:00.000Z',
    providers: {
      claude: {
        config: {
          apiKind: 'anthropic_messages',
          modelEndpointBaseURL: 'https://anthropic-proxy.example/v1/',
        },
        auth: {
          mode: 'apiKey',
          apiKey: 'sk-ant-workspace-key',
        },
      },
    },
  })

  const account = resolveAgentRuntimeAccountConfig({
    workspaceDir,
    providerKey: 'claude',
    provider: { id: 'claude', kind: 'claude' },
    runtimeApi: 'claude-sdk',
    preferBackendSession: false,
  })

  assert.equal(account.kind, 'apiKey')
  assert.equal(account.apiKind, 'anthropic_messages')
  assert.equal(account.accountSource, 'movscript-account')
  assert.equal(account.modelEndpointBaseURL, 'https://anthropic-proxy.example/v1')
})
