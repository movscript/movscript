export function installAgentLogTimestamps(scope: string): void {

  const key = Symbol.for(`movscript.agent.log-timestamps.${scope}`)
  const globalState = globalThis as typeof globalThis & Record<symbol, true | undefined>
  if (globalState[key]) return
  globalState[key] = true
  const startedAt = Date.now()
  for (const method of ['info', 'warn', 'error'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('[agent')) {
        args[0] = `[${new Date().toISOString()} +${Date.now() - startedAt}ms ${scope}] ${args[0]}`
      }
      original(...args)
    }
  }

}
