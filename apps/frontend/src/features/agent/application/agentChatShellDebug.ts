import { readBrowserStorageItem } from '@/shared/infrastructure/browserStorage'

const AGENT_CHAT_SHELL_DEBUG_STORAGE_KEY = 'movscript.debugAgentChatShell'

export function debugAgentChatShellLoad(label: string, payload: Record<string, unknown>): void {
  if (!isAgentChatShellDebugEnabled()) return
  console.debug(`[agent-chat-shell ${label}]`, payload)
}

function isAgentChatShellDebugEnabled(): boolean {
  return readBrowserStorageItem('local', AGENT_CHAT_SHELL_DEBUG_STORAGE_KEY) === '1'
}
