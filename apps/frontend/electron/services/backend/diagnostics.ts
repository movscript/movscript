export interface BackendOutputCapture {
  append(chunk: Buffer | string): void
  tail(): string
}

export interface BackendProcessDiagnostics {
  binary: string
  cwd: string
  dataDir: string
  recentOutput(): string
}

export interface BackendExitInfo {
  code: number | null
  signal: NodeJS.Signals | null
}

export function createBackendOutputCapture(maxChars = 8000): BackendOutputCapture {
  let output = ''
  return {
    append(chunk) {
      output += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
      if (output.length > maxChars) output = output.slice(-maxChars)
    },
    tail() {
      return output
    },
  }
}

export function formatBackendStartupFailure(input: {
  error: unknown
  diagnostics: BackendProcessDiagnostics
  exitInfo?: BackendExitInfo
}): string {
  const message = input.error instanceof Error ? input.error.message : 'Local backend failed to start'
  const details = [
    message,
    input.exitInfo ? `Exit: code=${input.exitInfo.code ?? 'null'} signal=${input.exitInfo.signal ?? 'null'}` : undefined,
    `Binary: ${input.diagnostics.binary}`,
    `CWD: ${input.diagnostics.cwd}`,
    `Data dir: ${input.diagnostics.dataDir}`,
  ].filter((line): line is string => Boolean(line))

  const recentOutput = input.diagnostics.recentOutput().trim()
  if (recentOutput) {
    details.push(`Recent backend output:\n${recentOutput}`)
  }

  return details.join('\n')
}
