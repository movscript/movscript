import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function resolveAgentRuntimeHomeEnv(
  params: {
    provider: { kind?: string }
    runtime: { api?: string }
  },
  workspaceDir: string,
): NodeJS.ProcessEnv {
  if (params.provider.kind === 'claude' || params.runtime.api === 'claude-sdk') {
    return { CLAUDE_CONFIG_DIR: ensureRuntimeHomeDir(join(workspaceDir, '.claude')) }
  }
  if (params.provider.kind === 'mova' || params.runtime.api === 'mova-sdk') {
    const home = ensureRuntimeHomeDir(join(workspaceDir, '.mova'))
    return {
      MOVA_HOME: home,
      CODEX_HOME: home,
    }
  }
  if (params.provider.kind === 'codex' || params.runtime.api === 'codex-sdk') {
    return { CODEX_HOME: ensureRuntimeHomeDir(join(workspaceDir, '.codex')) }
  }
  return {}
}

function ensureRuntimeHomeDir(home: string): string {
  mkdirSync(home, { recursive: true })
  return home
}
