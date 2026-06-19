import type { ProviderSettings } from '@/shared/infrastructure/providerConfigStore'

export const CODEX_PROVIDER_ID = 'codex'
export const MOVA_PROVIDER_ID = 'mova'
export const CLAUDE_PROVIDER_ID = 'claude'
export const PROVIDER_CONFIG_STORAGE_KEY = 'movscript-provider-config'
export const CODEX_RUNTIME_API_ENV = 'MOVSCRIPT_CODEX_RUNTIME_API'
export const MOVA_RUNTIME_API_ENV = 'MOVSCRIPT_MOVA_RUNTIME_API'
export const CLAUDE_RUNTIME_API_ENV = 'MOVSCRIPT_CLAUDE_RUNTIME_API'
export const CODEX_RUNTIME_EXECUTABLE_ENV = 'MOVSCRIPT_CODEX_APP_SERVER'
export const MOVA_RUNTIME_EXECUTABLE_ENV = 'MOVSCRIPT_MOVA_APP_SERVER'
export const CODEX_RUNTIME_PACKAGE_ENV = 'MOVSCRIPT_CODEX_PACKAGE'
export const CODEX_RUNTIME_SDK_PACKAGE_ENV = 'MOVSCRIPT_CODEX_SDK_PACKAGE'
export const CODEX_RUNTIME_PACKAGE_VERSION_ENV = 'MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION'
export const MOVA_RUNTIME_PACKAGE_ENV = 'MOVSCRIPT_MOVA_SDK_PACKAGE'
export const MOVA_RUNTIME_BINARY_PACKAGE_ENV = 'MOVSCRIPT_MOVA_PACKAGE'
export const MOVA_RUNTIME_PACKAGE_VERSION_ENV = 'MOVSCRIPT_MOVA_SDK_PACKAGE_VERSION'
export const CLAUDE_RUNTIME_PACKAGE_ENV = 'MOVSCRIPT_CLAUDE_SDK_PACKAGE'
export const CLAUDE_RUNTIME_BINARY_PACKAGE_ENV = 'MOVSCRIPT_CLAUDE_BINARY_PACKAGE'
export const CLAUDE_RUNTIME_PACKAGE_VERSION_ENV = 'MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION'
export const DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION = '0.3.183'

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  defaultProviderId: CODEX_PROVIDER_ID,
  newConversationProviderId: CODEX_PROVIDER_ID,
  providers: [
    {
      id: MOVA_PROVIDER_ID,
      kind: 'mova',
      protocol: 'sdk',
      messageAdapter: 'thread-turn-item',
      label: 'Mova',
      enabled: true,
      runtime: {
        id: 'mova-mova-app-server',
        api: 'mova-app-server',
        label: 'Mova app-server',
        binaryPackageName: '@movscript/mova',
        executableEnvVar: MOVA_RUNTIME_EXECUTABLE_ENV,
        apiEnvVar: MOVA_RUNTIME_API_ENV,
        packageNameEnvVar: MOVA_RUNTIME_PACKAGE_ENV,
        binaryPackageNameEnvVar: MOVA_RUNTIME_BINARY_PACKAGE_ENV,
        packageVersionEnvVar: MOVA_RUNTIME_PACKAGE_VERSION_ENV,
      },
    },
    {
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      protocol: 'sdk',
      messageAdapter: 'thread-turn-item',
      label: 'Codex',
      enabled: true,
      runtime: {
        id: 'codex-codex-app-server',
        api: 'codex-app-server',
        label: 'Codex app-server',
        packageName: '@openai/codex',
        sdkPackageName: '@openai/codex-sdk',
        binaryPackageName: '@movscript/mova',
        executableEnvVar: CODEX_RUNTIME_EXECUTABLE_ENV,
        apiEnvVar: CODEX_RUNTIME_API_ENV,
        packageNameEnvVar: CODEX_RUNTIME_PACKAGE_ENV,
        sdkPackageNameEnvVar: CODEX_RUNTIME_SDK_PACKAGE_ENV,
        packageVersionEnvVar: CODEX_RUNTIME_PACKAGE_VERSION_ENV,
      },
    },
    {
      id: CLAUDE_PROVIDER_ID,
      kind: 'claude',
      protocol: 'claude-code',
      messageAdapter: 'claude-thread-message',
      label: 'Claude Code',
      enabled: true,
      runtime: {
        id: 'claude-sdk',
        api: 'claude-sdk',
        label: 'Claude Agent SDK',
        packageName: '@anthropic-ai/claude-agent-sdk',
        packageVersion: DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION,
        binaryPackageName: '@anthropic-ai/claude-code',
        apiEnvVar: CLAUDE_RUNTIME_API_ENV,
        packageNameEnvVar: CLAUDE_RUNTIME_PACKAGE_ENV,
        binaryPackageNameEnvVar: CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
        packageVersionEnvVar: CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
      },
    },
  ],
}
