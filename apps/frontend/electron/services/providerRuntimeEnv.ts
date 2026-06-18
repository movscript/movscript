export function providerRuntimeEnvSnapshot(env: NodeJS.ProcessEnv): Record<string, string> {
  const output: Record<string, string> = {}
  for (const name of [
    'MOVSCRIPT_CODEX_RUNTIME_API',
    'MOVSCRIPT_CODEX_PACKAGE',
    'MOVSCRIPT_CODEX_SDK_PACKAGE',
    'MOVSCRIPT_CODEX_SDK_PACKAGE_VERSION',
    'MOVSCRIPT_CLAUDE_RUNTIME_API',
    'MOVSCRIPT_CLAUDE_SDK_PACKAGE',
    'MOVSCRIPT_CLAUDE_BINARY_PACKAGE',
    'MOVSCRIPT_CLAUDE_SDK_PACKAGE_VERSION',
    'MOVSCRIPT_DEFAULT_PROVIDER',
    'MOVSCRIPT_NEW_CONVERSATION_PROVIDER',
  ]) {
    const value = env[name]?.trim()
    if (value) output[name] = value
  }
  return output
}
