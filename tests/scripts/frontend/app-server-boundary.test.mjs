import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const appServerChatDataSource = readSource('apps/frontend/src/shared/infrastructure/app-server/appServerChatDataSource.ts')
const appServerChatCapabilities = readSource('apps/frontend/src/shared/infrastructure/app-server/appServerChatCapabilities.ts')
const appServerRpcClient = readSource('apps/frontend/src/shared/infrastructure/app-server/appServerRpcClient.ts')
const appServerRpcRequestParams = readSource('apps/frontend/src/shared/infrastructure/app-server/appServerRpcRequestParams.ts')
const appServerRpcTransport = readSource('apps/frontend/src/shared/infrastructure/app-server/appServerRpcTransport.ts')

test('app-server chat capabilities are isolated from the data source factory', () => {
  assert.match(appServerChatDataSource, /from '@\/shared\/infrastructure\/app-server\/appServerChatCapabilities'/)
  assert.match(appServerChatDataSource, /createAppServerChatCapabilities\(client, provider, adapter\)/)
  assert.match(appServerChatDataSource, /appServerThreadIdFromParams\(notification\.params\)/)
  assert.doesNotMatch(appServerChatDataSource, /request\('command\/exec'/)
  assert.doesNotMatch(appServerChatDataSource, /request\('fs\/readFile'/)
  assert.doesNotMatch(appServerChatDataSource, /request\('mcpServerStatus\/list'/)
  assert.doesNotMatch(appServerChatDataSource, /function createAppServerChatCapabilities/)

  assert.match(appServerChatCapabilities, /export function createAppServerChatCapabilities/)
  assert.match(appServerChatCapabilities, /request\('command\/exec'/)
  assert.match(appServerChatCapabilities, /request\('fs\/readFile'/)
  assert.match(appServerChatCapabilities, /request\('mcpServerStatus\/list'/)
  assert.match(appServerChatCapabilities, /export function appServerThreadIdFromParams/)
})

test('app-server rpc transports are isolated from request state management', () => {
  assert.match(appServerRpcClient, /from '@\/shared\/infrastructure\/app-server\/appServerRpcTransport'/)
  assert.match(appServerRpcClient, /createAppServerRpcTransport\(\{/)
  assert.doesNotMatch(appServerRpcClient, /new WebSocket/)
  assert.doesNotMatch(appServerRpcClient, /onAppServerMessage/)
  assert.doesNotMatch(appServerRpcClient, /appServerConnect/)
  assert.doesNotMatch(appServerRpcClient, /relay:connected/)

  assert.match(appServerRpcTransport, /export async function createAppServerRpcTransport/)
  assert.match(appServerRpcTransport, /new WebSocket/)
  assert.match(appServerRpcTransport, /onAppServerMessage/)
  assert.match(appServerRpcTransport, /appServerConnect/)
  assert.match(appServerRpcTransport, /relay:connected/)
})

test('app-server rpc protocol params are isolated from request state management', () => {
  assert.match(appServerRpcClient, /from '@\/shared\/infrastructure\/app-server\/appServerRpcRequestParams'/)
  assert.match(appServerRpcClient, /appServerInitializeParams\(\)/)
  assert.match(appServerRpcClient, /appServerThreadListParams\(input\)/)
  assert.match(appServerRpcClient, /appServerThreadReadParams\(threadId, input\)/)
  assert.match(appServerRpcClient, /appServerTextTurnParams\(input\)/)
  assert.doesNotMatch(appServerRpcClient, /const APP_SERVER_THREAD_LIST_SOURCE_KINDS/)
  assert.doesNotMatch(appServerRpcClient, /private initializeParams/)
  assert.doesNotMatch(appServerRpcClient, /sourceKinds: APP_SERVER_THREAD_LIST_SOURCE_KINDS/)
  assert.doesNotMatch(appServerRpcClient, /includeTurns: input\.includeTurns/)
  assert.doesNotMatch(appServerRpcClient, /appServerTextInput\(text\)/)

  assert.match(appServerRpcRequestParams, /export function appServerInitializeParams/)
  assert.match(appServerRpcRequestParams, /export function appServerThreadListParams/)
  assert.match(appServerRpcRequestParams, /export function appServerThreadReadParams/)
  assert.match(appServerRpcRequestParams, /export function appServerTextTurnParams/)
  assert.match(appServerRpcRequestParams, /const APP_SERVER_THREAD_LIST_SOURCE_KINDS/)
  assert.match(appServerRpcRequestParams, /sourceKinds: APP_SERVER_THREAD_LIST_SOURCE_KINDS/)
  assert.match(appServerRpcRequestParams, /includeTurns: input\.includeTurns \?\? true/)
  assert.match(appServerRpcRequestParams, /appServerTextInput\(text\)/)
})

function readSource(path) {
  return readFileSync(resolve(path), 'utf8')
}
