import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('vendored Codex app-server protocol covers the app-server capability surface', () => {
  const clientRequest = readFileSync(resolve('src/shared/infrastructure/codex-app-server/app-server-protocol/ClientRequest.ts'), 'utf8')
  const serverRequest = readFileSync(resolve('src/shared/infrastructure/codex-app-server/app-server-protocol/ServerRequest.ts'), 'utf8')
  const serverNotification = readFileSync(resolve('src/shared/infrastructure/codex-app-server/app-server-protocol/ServerNotification.ts'), 'utf8')
  const threadItem = readFileSync(resolve('src/shared/infrastructure/codex-app-server/app-server-protocol/v2/ThreadItem.ts'), 'utf8')
  const protocolFacade = readFileSync(resolve('src/shared/infrastructure/codex-app-server/codexAppServerProtocol.ts'), 'utf8')

  for (const method of [
    'thread/start',
    'thread/resume',
    'turn/start',
    'turn/steer',
    'turn/interrupt',
    'command/exec',
    'command/exec/write',
    'fs/readFile',
    'fs/writeFile',
    'fs/watch',
    'mcpServer/tool/call',
    'plugin/list',
    'plugin/skill/read',
    'skills/list',
    'model/list',
    'modelProvider/capabilities/read',
    'permissionProfile/list',
    'config/read',
    'account/login/start',
  ]) {
    assert.match(clientRequest, new RegExp(JSON.stringify(method).slice(1, -1)))
  }

  for (const method of [
    'item/commandExecution/requestApproval',
    'item/fileChange/requestApproval',
    'item/permissions/requestApproval',
    'item/tool/requestUserInput',
    'mcpServer/elicitation/request',
    'item/tool/call',
  ]) {
    assert.match(serverRequest, new RegExp(JSON.stringify(method).slice(1, -1)))
  }

  for (const method of [
    'command/exec/outputDelta',
    'fs/changed',
    'mcpServer/startupStatus/updated',
    'account/updated',
    'thread/realtime/started',
    'thread/realtime/transcript/delta',
    'thread/realtime/outputAudio/delta',
    'thread/realtime/sdp',
    'thread/realtime/closed',
  ]) {
    assert.match(serverNotification, new RegExp(JSON.stringify(method).slice(1, -1)))
  }

  for (const itemType of [
    '"userMessage"',
    '"agentMessage"',
    '"plan"',
    '"reasoning"',
    '"commandExecution"',
    '"fileChange"',
    '"mcpToolCall"',
    '"webSearch"',
  ]) {
    assert.match(threadItem, new RegExp(itemType))
  }

  assert.match(protocolFacade, /export type \* from '\.\/app-server-protocol'/)
  assert.doesNotMatch(protocolFacade, /export type CodexThreadItem =\s*\|/)
})
