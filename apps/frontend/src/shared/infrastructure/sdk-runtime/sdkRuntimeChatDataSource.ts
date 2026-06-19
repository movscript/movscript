import type { AgentChatDataSource } from '@movscript/core/agent/chat'
import {
  createAgentRuntimeChatDataSource,
  type AgentRuntimeChatDataSourceOptions,
} from '../agent-runtime/agentRuntimeChatDataSource'
import type { SdkRuntimeClient } from './sdkRuntimeProtocol'

export type SdkRuntimeChatDataSourceOptions = AgentRuntimeChatDataSourceOptions

export function createSdkRuntimeChatDataSource(
  client: SdkRuntimeClient,
  options: SdkRuntimeChatDataSourceOptions,
): AgentChatDataSource {
  return createAgentRuntimeChatDataSource(client, options)
}
