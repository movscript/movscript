import assert from 'node:assert/strict'
import test from 'node:test'
import { join } from 'node:path'

import {
  appServerExecutionSettings,
  appServerThreadStartParams,
  appServerTurnStartParams,
  appServerTurnSteerParams,
} from './appServerRuntimeParams'

const context = {
  workspaceDir: '/tmp/movscript-workspace',
  config: {
    model_provider: 'workspace-backend',
  },
}

test('app-server thread start params include startup source, config, and run profile fallbacks', () => {
  const params = appServerThreadStartParams({
    provider: provider(),
    runtime: runtime(),
    runProfile: {
      approvalPolicy: 'on-request',
      approvalsReviewer: 'user',
      permissionProfileId: 'default',
      fallbackSandbox: 'workspace-write',
    },
    model: 'gpt-5',
  } as never, context)

  assert.equal(params.sessionStartSource, 'startup')
  assert.equal(params.threadSource, 'user')
  assert.equal(params.cwd, '/tmp/movscript-workspace')
  assert.equal(params.model, 'gpt-5')
  assert.equal(params.approvalPolicy, 'on-request')
  assert.equal(params.approvalsReviewer, 'user')
  assert.equal(params.permissions, 'default')
  assert.deepEqual(params.config, { model_provider: 'workspace-backend' })
})

test('app-server run params resolve project workspace context cwd', () => {
  const projectDir = join(context.workspaceDir, 'demo-project')
  const params = appServerThreadStartParams({
    provider: provider(),
    runtime: runtime(),
    workspaceContext: { scope: 'project', userId: 1, projectDir },
    runProfile: {
      fallbackSandbox: 'workspace-write',
    },
  } as never, context)

  assert.equal(params.cwd, projectDir)
  assert.equal((params.sandbox as unknown), 'workspace-write')
})

test('app-server turn start params map neutral inputs and sandbox policy', () => {
  const params = appServerTurnStartParams({
    provider: provider(),
    runtime: runtime(),
    threadId: 'thread_1',
    clientUserMessageId: 'client_user_1',
    inputs: [
      { type: 'text', text: 'hello', textElements: [{ text: 'hello' }] },
      { type: 'image', url: 'https://example.com/image.png', detail: 'high' },
    ],
    runProfile: {
      fallbackSandbox: 'workspace-write',
    },
  } as never, context)

  assert.equal(params.threadId, 'thread_1')
  assert.equal(params.clientUserMessageId, 'client_user_1')
  assert.deepEqual(params.input, [
    { type: 'text', text: 'hello', text_elements: [{ text: 'hello' }] },
    { type: 'image', url: 'https://example.com/image.png', detail: 'high' },
  ])
  assert.deepEqual(params.sandboxPolicy, {
    type: 'workspaceWrite',
    writableRoots: ['/tmp/movscript-workspace'],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  })
})

test('app-server turn start params resolve project cwd for sandbox policy', () => {
  const projectDir = join(context.workspaceDir, 'demo-project')
  const params = appServerTurnStartParams({
    provider: provider(),
    runtime: runtime(),
    threadId: 'thread_1',
    inputs: [{ type: 'text', text: 'hello', textElements: [] }],
    workspaceContext: { scope: 'project', userId: 1, projectDir },
    runProfile: {
      fallbackSandbox: 'workspace-write',
    },
  } as never, context)

  assert.equal(params.cwd, projectDir)
  assert.deepEqual(params.sandboxPolicy, {
    type: 'workspaceWrite',
    writableRoots: [projectDir],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  })
})

test('app-server turn steer params use expected turn id and neutral inputs', () => {
  const params = appServerTurnSteerParams({
    provider: provider(),
    runtime: runtime(),
    threadId: 'thread_1',
    turnId: 'turn_1',
    clientUserMessageId: 'client_user_2',
    inputs: [
      { type: 'text', text: 'continue', textElements: [] },
    ],
  } as never)

  assert.deepEqual(params, {
    threadId: 'thread_1',
    expectedTurnId: 'turn_1',
    clientUserMessageId: 'client_user_2',
    input: [
      { type: 'text', text: 'continue', text_elements: [] },
    ],
  })
})

test('app-server execution settings mirror runtime update params', () => {
  const settings = appServerExecutionSettings({
    provider: provider(),
    runtime: runtime(),
    threadId: 'thread_1',
    model: 'gpt-5-mini',
    modelProvider: 'openai',
    runProfile: {
      approvalPolicy: 'never',
      fallbackSandbox: 'read-only',
    },
  } as never, context)

  assert.deepEqual(settings, {
    model: 'gpt-5-mini',
    modelProvider: 'openai',
    cwd: '/tmp/movscript-workspace',
    approvalPolicy: 'never',
    sandbox: 'read-only',
    sandboxPolicy: { type: 'readOnly', networkAccess: false },
  })
})

function provider() {
  return {
    id: 'codex',
    kind: 'codex',
  }
}

function runtime() {
  return {
    id: 'codex-app-server',
    api: 'codex-app-server',
    label: 'Codex App Server',
  }
}
