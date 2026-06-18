import type { AppServerProfile, ProviderSettings } from '@/shared/infrastructure/providerConfigStore'

export const CODEX_PROVIDER_ID = 'codex'
export const MOVA_PROVIDER_ID = 'mova'
export const CLAUDE_PROVIDER_ID = 'claude'
export const PROVIDER_CONFIG_STORAGE_KEY = 'movscript-provider-config'
export const CODEX_MOVSCRIPT_HOME_PROFILE_ID = 'codex-movscript-home'
export const MOVA_MOVSCRIPT_HOME_PROFILE_ID = 'mova-movscript-home'
export const MOVSCRIPT_MANAGED_CODEX_HOME = '.codex'
export const MOVSCRIPT_MANAGED_MOVA_HOME = '.mova'
export const CODEX_RUNTIME_API_ENV = 'MOVSCRIPT_CODEX_RUNTIME_API'
export const CLAUDE_RUNTIME_API_ENV = 'MOVSCRIPT_CLAUDE_RUNTIME_API'
export const CODEX_RUNTIME_PACKAGE_ENV = 'MOVSCRIPT_CODEX_PACKAGE'
export const CODEX_RUNTIME_SDK_PACKAGE_ENV = 'MOVSCRIPT_CODEX_SDK_PACKAGE'
export const CODEX_RUNTIME_PACKAGE_VERSION_ENV = 'MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION'
export const CLAUDE_RUNTIME_PACKAGE_ENV = 'MOVSCRIPT_CLAUDE_SDK_PACKAGE'
export const CLAUDE_RUNTIME_BINARY_PACKAGE_ENV = 'MOVSCRIPT_CLAUDE_BINARY_PACKAGE'
export const CLAUDE_RUNTIME_PACKAGE_VERSION_ENV = 'MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION'

export const DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE: AppServerProfile = {
  id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  label: 'MovScript Codex',
  providerKey: 'codex',
  executableCommand: 'codex',
  executableEnvVar: 'MOVSCRIPT_CODEX_APP_SERVER_BIN',
  compatibilityBinEnvNames: ['MOVSCRIPT_CODEX_BIN'],
  candidateRootRelativePaths: [
    '../app-server-bin/codex',
    '../../app-server-bin/codex',
    '../codex/codex-rs/target/debug',
    '../../codex/codex-rs/target/debug',
    '../../../codex/codex-rs/target/debug',
  ],
  candidateBinaryNames: [
    'app-server',
    'codex-app-server',
    'codex',
  ],
  pathFallbackReady: false,
  home: MOVSCRIPT_MANAGED_CODEX_HOME,
  lifecycle: 'movscript-owned',
}

export const DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE: AppServerProfile = {
  id: MOVA_MOVSCRIPT_HOME_PROFILE_ID,
  label: 'MovScript Mova',
  providerKey: 'mova',
  executableCommand: 'mova',
  executableEnvVar: 'MOVSCRIPT_MOVA_APP_SERVER_BIN',
  compatibilityBinEnvNames: ['MOVSCRIPT_MOVA_BIN'],
  candidateRootRelativePaths: [
    '../app-server-bin/mova',
    '../../app-server-bin/mova',
    '../mova/codex-rs/target/debug',
    '../../mova/codex-rs/target/debug',
    '../../../mova/codex-rs/target/debug',
  ],
  candidateBinaryNames: [
    'app-server',
    'mova-app-server',
    ['codex', 'app-server'].join('-'),
    'codex',
  ],
  pathFallbackReady: false,
  home: MOVSCRIPT_MANAGED_MOVA_HOME,
  compatibilityHomeEnvNames: ['CODEX_HOME'],
  lifecycle: 'movscript-owned',
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  defaultProviderId: MOVA_PROVIDER_ID,
  newConversationProviderId: undefined,
  providers: [
    {
      id: MOVA_PROVIDER_ID,
      kind: 'mova',
      protocol: 'app-server',
      messageAdapter: 'thread-turn-item',
      label: 'MovScript Mova',
      enabled: true,
      runtime: {
        id: 'mova-app-server',
        api: 'app-server',
        label: 'Mova app-server',
      },
      appServerProfile: DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE,
    },
    {
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      protocol: 'app-server',
      messageAdapter: 'thread-turn-item',
      label: 'MovScript Codex',
      enabled: true,
      runtime: {
        id: 'codex-app-server',
        api: 'app-server',
        label: 'Codex app-server',
        packageName: '@openai/codex',
        sdkPackageName: '@openai/codex-sdk',
        apiEnvVar: CODEX_RUNTIME_API_ENV,
        packageNameEnvVar: CODEX_RUNTIME_PACKAGE_ENV,
        sdkPackageNameEnvVar: CODEX_RUNTIME_SDK_PACKAGE_ENV,
        packageVersionEnvVar: CODEX_RUNTIME_PACKAGE_VERSION_ENV,
      },
      appServerProfile: DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
    },
    {
      id: CLAUDE_PROVIDER_ID,
      kind: 'claude',
      protocol: 'claude-code',
      messageAdapter: 'claude-thread-message',
      label: 'Claude',
      enabled: false,
      runtime: {
        id: 'claude-sdk',
        api: 'claude-sdk',
        label: 'Claude Agent SDK',
        packageName: '@anthropic-ai/claude-agent-sdk',
        binaryPackageName: '@anthropic-ai/claude-code',
        apiEnvVar: CLAUDE_RUNTIME_API_ENV,
        packageNameEnvVar: CLAUDE_RUNTIME_PACKAGE_ENV,
        binaryPackageNameEnvVar: CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
        packageVersionEnvVar: CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
      },
    },
  ],
}
