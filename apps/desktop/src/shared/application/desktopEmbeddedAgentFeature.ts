export const DESKTOP_EMBEDDED_AGENT_ENV_FLAG = 'VITE_MOVSCRIPT_DESKTOP_EMBEDDED_AGENT'

export function desktopEmbeddedAgentEnabled(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  return env?.[DESKTOP_EMBEDDED_AGENT_ENV_FLAG] === '1'
}
