export function describeAgentRuntimeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts: string[] = [error.message]
  const anyError = error as Error & { code?: unknown; cause?: unknown }
  if (typeof anyError.code === 'string') parts.push(`code=${anyError.code}`)
  if (anyError.cause && typeof anyError.cause === 'object') {
    const cause = anyError.cause as { code?: unknown; address?: unknown; port?: unknown; syscall?: unknown }
    if (typeof cause.code === 'string') parts.push(`causeCode=${cause.code}`)
    if (typeof cause.syscall === 'string') parts.push(`syscall=${cause.syscall}`)
    if (typeof cause.address === 'string') parts.push(`address=${cause.address}`)
    if (typeof cause.port === 'number' || typeof cause.port === 'string') parts.push(`port=${cause.port}`)
  }
  return parts.join(' ')
}
