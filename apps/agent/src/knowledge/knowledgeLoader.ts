import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InMemoryKnowledgeStore } from './knowledgeStore.js'
import type { KnowledgeChunk, KnowledgeCollection } from './types.js'

export function loadBuiltinKnowledgeStore(): InMemoryKnowledgeStore {
  return loadKnowledgeStore(resolveBuiltinKnowledgeDir())
}

export function loadKnowledgeStore(rootDir: string): InMemoryKnowledgeStore {
  const collections: KnowledgeCollection[] = []
  const chunks: KnowledgeChunk[] = []
  if (!existsSync(rootDir)) return new InMemoryKnowledgeStore({ collections, chunks })
  for (const indexPath of listKnowledgeIndexFiles(rootDir)) {
    const parsed = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, unknown>
    const collection = normalizeCollection(parsed)
    if (!collection) continue
    const collectionDir = dirname(indexPath)
    const collectionChunks = collection.chunkIds.flatMap((resourcePath) => {
      const chunkPath = resolveInside(collectionDir, resourcePath)
      return chunkPath ? normalizeChunk(readFileSync(chunkPath, 'utf8'), chunkPath, collection) : []
    })
    collections.push({ ...collection, chunkIds: collectionChunks.map((chunk) => chunk.id) })
    chunks.push(...collectionChunks)
  }
  return new InMemoryKnowledgeStore({ collections, chunks })
}

export function resolveBuiltinKnowledgeDir(): string {
  return resolve(fileURLToPath(new URL('../../catalog/knowledge', import.meta.url)))
}

function listKnowledgeIndexFiles(rootDir: string): string[] {
  const files: string[] = []
  visit(rootDir)
  return files.sort((a, b) => a.localeCompare(b))

  function visit(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const filePath = join(dir, entry)
      const stat = statSync(filePath)
      if (stat.isDirectory()) visit(filePath)
      else if (/index\.knowledge\.json$/i.test(entry)) files.push(filePath)
    }
  }
}

function normalizeCollection(input: Record<string, unknown>): (KnowledgeCollection & { chunkIds: string[] }) | undefined {
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

function normalizeChunk(raw: string, sourcePath: string, collection: KnowledgeCollection): KnowledgeChunk[] {
  const parsed = parseFrontMatter(raw)
  const id = stringField(parsed.meta.id)
  const domain = stringField(parsed.meta.domain) ?? collection.domain
  const title = stringField(parsed.meta.title)
  const summary = stringField(parsed.meta.summary)
  if (!id || !title || !summary) return []
  const content = parsed.body.trim()
  const contentHash = `sha256:${createHash('sha256').update(content).digest('hex')}`
  return [{
    id,
    collectionId: collection.id,
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
