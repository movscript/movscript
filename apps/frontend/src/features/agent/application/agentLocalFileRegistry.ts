import type { AgentAttachmentSource } from '@movscript/core/agent/protocol'

interface AgentLocalFileEntry {
  file: File
  dataUrlPromise?: Promise<string>
  createdAt: number
  lastAccessed: number
}

const localFiles = new Map<string, AgentLocalFileEntry>()

export function registerAgentLocalFile(file: File): AgentAttachmentSource {
  const fileId = `local-file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  localFiles.set(fileId, {
    file,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
  })
  return { kind: 'local_file', fileId }
}

export async function resolveAgentLocalFileDataUrl(fileId: string): Promise<string | undefined> {
  const entry = localFiles.get(fileId)
  if (!entry) return undefined
  entry.lastAccessed = Date.now()
  if (!entry.dataUrlPromise) entry.dataUrlPromise = fileToDataURL(entry.file)
  return entry.dataUrlPromise
}

export function releaseAgentLocalFile(fileId: string): void {
  localFiles.delete(fileId)
}

export function __resetAgentLocalFileRegistryForTests(): void {
  localFiles.clear()
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('failed to read local file attachment'))
    reader.readAsDataURL(file)
  })
}
