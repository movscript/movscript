import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isRecord } from '../../shared/json/jsonValue.js'
import { InMemoryReferenceStore, type ReferenceStore } from '../store/referenceStore.js'
import type { LocalReferenceChunk, LocalReferenceSet } from '../shared/types.js'

export const AGENT_REFERENCE_DIR_ENV = 'MOVSCRIPT_AGENT_REFERENCE_DIR'

export interface AgentReferenceStoreOptions {
  referenceDir?: string | null
}

export function loadAgentReferenceStore(options: AgentReferenceStoreOptions = {}): InMemoryReferenceStore {
  const stores: ReferenceStore[] = [loadBuiltinReferenceStore()]
  const referenceDir = resolveConfiguredReferenceDir(options)
  if (referenceDir) stores.push(loadReferenceStore(referenceDir))
  return mergeReferenceStores(stores)
}

export function loadBuiltinReferenceStore(): InMemoryReferenceStore {
  return loadReferenceStore(resolveBuiltinReferenceDir())
}

export function loadReferenceStore(rootDir: string): InMemoryReferenceStore {
  const referenceSets: LocalReferenceSet[] = []
  const chunks: LocalReferenceChunk[] = []
  if (!existsSync(rootDir)) return new InMemoryReferenceStore({ referenceSets, chunks })
  for (const indexPath of listReferenceIndexFiles(rootDir)) {
    const parsed = readReferenceIndex(indexPath)
    if (!isRecord(parsed)) continue
    const referenceSet = normalizeReferenceSet(parsed)
    if (!referenceSet) continue
    const referenceSetDir = dirname(indexPath)
    const referenceSetChunks = referenceSet.chunkIds.flatMap((resourcePath) => {
      const chunkPath = resolveInside(referenceSetDir, resourcePath)
      const chunkContent = chunkPath ? readLocalReferenceChunk(chunkPath) : undefined
      return chunkPath && chunkContent !== undefined ? normalizeChunk(chunkContent, chunkPath, referenceSet) : []
    })
    referenceSets.push({
      ...referenceSet,
      chunkIds: referenceSetChunks.map((chunk) => chunk.id),
      chunks: referenceSetChunks.map((chunk) => ({
        id: chunk.id,
        title: chunk.title,
        charCount: chunk.charCount,
        contentHash: chunk.contentHash,
        ...(chunk.sourcePath ? { sourcePath: chunk.sourcePath } : {}),
      })),
    })
    chunks.push(...referenceSetChunks)
  }
  return new InMemoryReferenceStore({ referenceSets, chunks })
}

function readReferenceIndex(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return undefined
  }
}

function readLocalReferenceChunk(filePath: string): string | undefined {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return undefined
  }
}

export function resolveBuiltinReferenceDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    resolve(moduleDir, '..', '..', '..', 'reference-data', 'local'),
    resolve(moduleDir, '..', '..', '..', '..', 'reference-data', 'local'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

export function mergeReferenceStores(stores: ReferenceStore[]): InMemoryReferenceStore {
  const referenceSetsById = new Map<string, LocalReferenceSet>()
  const chunksById = new Map<string, LocalReferenceChunk>()
  for (const store of stores) {
    const storeReferenceSets = store.listLocalReferenceSets()
    for (const referenceSet of storeReferenceSets) {
      if (referenceSetsById.has(referenceSet.id)) {
        for (const [chunkId, chunk] of chunksById) {
          if (chunk.localReferenceSetId === referenceSet.id) chunksById.delete(chunkId)
        }
      }
      referenceSetsById.set(referenceSet.id, referenceSet)
    }
    for (const chunk of store.listChunks()) chunksById.set(chunk.id, chunk)
  }
  return new InMemoryReferenceStore({
    referenceSets: Array.from(referenceSetsById.values()),
    chunks: Array.from(chunksById.values()),
  })
}

function resolveConfiguredReferenceDir(options: AgentReferenceStoreOptions): string | undefined {
  const configured = Object.hasOwn(options, 'referenceDir')
    ? options.referenceDir
    : process.env[AGENT_REFERENCE_DIR_ENV]
  return typeof configured === 'string' && configured.trim().length > 0
    ? resolve(configured.trim())
    : undefined
}

function listReferenceIndexFiles(rootDir: string): string[] {
  const files: string[] = []
  visit(rootDir)
  return files.sort((a, b) => a.localeCompare(b))

  function visit(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const filePath = join(dir, entry)
      const stat = statSync(filePath)
      if (stat.isDirectory()) visit(filePath)
      else if (/index\.reference\.json$/i.test(entry)) files.push(filePath)
    }
  }
}

function normalizeReferenceSet(input: Record<string, unknown>): (LocalReferenceSet & { chunkIds: string[] }) | undefined {
  const id = stringField(input.id)
  const version = stringField(input.version)
  const domain = stringField(input.domain)
  const name = stringField(input.name)
  const resources = stringArray(input.resources)
  if (!id || !version || !domain || !name || resources.length === 0) return undefined
  return {
    id,
    version,
    domain,
    name,
    ...(stringField(input.description) ? { description: stringField(input.description) } : {}),
    tags: stringArray(input.tags),
    chunkIds: resources,
  }
}

function normalizeChunk(raw: string, sourcePath: string, referenceSet: LocalReferenceSet): LocalReferenceChunk[] {
  const parsed = parseFrontMatter(raw)
  const id = stringField(parsed.meta.id)
  const domain = stringField(parsed.meta.domain) ?? referenceSet.domain
  const title = stringField(parsed.meta.title)
  const summary = stringField(parsed.meta.summary)
  if (!id || !title || !summary) return []
  const content = parsed.body.trim()
  const contentHash = `sha256:${createHash('sha256').update(content).digest('hex')}`
  return [{
    id,
    localReferenceSetId: referenceSet.id,
    domain,
    title,
    tags: stringArray(parsed.meta.tags),
    summary,
    content,
    ...(stringField(parsed.meta.version) ? { version: stringField(parsed.meta.version) } : {}),
    sourcePath,
    contentHash,
    charCount: content.length,
  }]
}

function parseFrontMatter(raw: string): { meta: Record<string, unknown>; body: string } {
  if (!raw.startsWith('---\n')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 4)
  if (end < 0) return { meta: {}, body: raw }
  const frontMatter = raw.slice(4, end).trim()
  const body = raw.slice(end + 4)
  return { meta: parseSimpleYaml(frontMatter), body }
}

function parseSimpleYaml(value: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let currentListKey: string | undefined
  for (const line of value.split(/\r?\n/)) {
    if (!line.trim()) continue
    const listMatch = line.match(/^\s*-\s*(.+)$/)
    if (listMatch && currentListKey) {
      const list = Array.isArray(out[currentListKey]) ? out[currentListKey] as string[] : []
      list.push(listMatch[1].trim())
      out[currentListKey] = list
      continue
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    currentListKey = undefined
    const key = match[1]
    const raw = match[2].trim()
    if (raw.length === 0) {
      out[key] = []
      currentListKey = key
    } else {
      out[key] = raw.replace(/^["']|["']$/g, '')
    }
  }
  return out
}

function resolveInside(rootDir: string, resourcePath: string): string | undefined {
  if (isAbsolute(resourcePath)) return undefined
  const resolved = resolve(rootDir, normalize(resourcePath))
  return resolved.startsWith(resolve(rootDir)) && existsSync(resolved) ? resolved : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()) : []
}
