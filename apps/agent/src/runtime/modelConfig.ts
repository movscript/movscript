// Re-export from new location for backwards compatibility
export {
  RuntimeModelConfigStore,
  resolveRuntimeModelConfigPath,
  resolveRuntimeChatModelConfig,
  resolveRuntimeChatFileModelConfig,
  resolveRuntimePlannerModelConfig,
  buildBackendGatewayChatRequest,
  callBackendGatewayChat,
  callBackendGatewayChatWithTrace,
} from './model/modelConfig.js'
export type {
  RuntimeModelConfig,
  RuntimeModelConfigPublic,
  RuntimeModelConfigInput,
  ConfiguredRuntimeModelConfig,
  RuntimeModelAuthContext,
  RuntimeModelRequestSnapshot,
  RuntimeModelResponseSnapshot,
  RuntimeModelHTTPTrace,
  RuntimeModelTestResult,
  RuntimeModelChatToolCall,
  RuntimeModelChatMessage,
  RuntimeModelChatTool,
  RuntimeModelToolChoice,
  RuntimeModelTraceCallback,
} from './model/modelConfig.js'
