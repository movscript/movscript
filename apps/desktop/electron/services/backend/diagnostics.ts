import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'

export interface BackendExitInfo {
  code: number | null
  signal: NodeJS.Signals | string | null
}

export interface BackendDiagnostics {
  binary: string
  cwd: string
  dataDir: string
  logPath: string
  recentOutput: () => string
}

export function createBackendOutputCapture(limit = 8192): { append: (chunk: unknown) => void; tail: () => string; recentOutput: () => string } {
  let buffer = ''
  return {
    append(chunk: unknown) {
      buffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '')
      if (buffer.length > limit) buffer = buffer.slice(buffer.length - limit)
    },
    tail() {
      return buffer
    },
    recentOutput() {
      return buffer
    },
  }
}

export function formatBackendStartupFailure(input: {
  error: unknown
  diagnostics: BackendDiagnostics
  exitInfo?: BackendExitInfo
}): string {
  const message = input.error instanceof Error ? input.error.message : String(input.error)
  const lines = [
    message,
    input.exitInfo ? `Exit: code=${input.exitInfo.code ?? 'null'} signal=${input.exitInfo.signal ?? 'null'}` : '',
    `Binary: ${input.diagnostics.binary}`,
    `CWD: ${input.diagnostics.cwd}`,
    `Data dir: ${input.diagnostics.dataDir}`,
    `Log file: ${input.diagnostics.logPath}`,
    input.diagnostics.recentOutput().trim(),
  ]
  return lines.filter(Boolean).join('\n')
}

export function readTextFileTail(path: string, bytes = 8192): string {
  if (!existsSync(path)) return ''
  const fd = openSync(path, 'r')
  try {
    const size = statSync(path).size
    const length = Math.min(bytes, size)
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } finally {
    closeSync(fd)
  }
}
