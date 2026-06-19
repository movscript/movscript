import { closeSync, fstatSync, openSync, readFileSync, readSync } from 'fs'

export interface BackendOutputCapture {
  append(chunk: Buffer | string): void
  tail(): string
}

export interface BackendProcessDiagnostics {
  binary: string
  cwd: string
  dataDir: string
  logPath: string
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

export function readTextFileTail(path: string, maxBytes = 8000): string {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const length = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, Math.max(0, size - length))
    return buffer.toString('utf8')
  } catch {
    try {
      return readFileSync(path, 'utf8').slice(-maxBytes)
    } catch {
      return ''
    }
  } finally {
    if (fd !== undefined) closeSync(fd)
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
    `Log file: ${input.diagnostics.logPath}`,
  ].filter((line): line is string => Boolean(line))

  const recentOutput = input.diagnostics.recentOutput().trim()
  if (recentOutput) {
    details.push(`Recent backend output:\n${recentOutput}`)
  }

  return details.join('\n')
}
