import { existsSync, readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, normalize, resolve } from 'node:path'
import type { CapabilityPack } from '../../../registry/shared/types.js'

export function listPackResourceJSONFiles(
  rootDir: string,
  packs: CapabilityPack[],
  kind: 'skills' | 'tools',
  warnings: string[],
  fileNamePattern: RegExp,
): string[] {
  const files = new Set<string>()
  for (const pack of packs) {
    const resourcePaths = pack.resources?.[kind] ?? []
    for (const resourcePath of resourcePaths) {
      const resolvedPath = resolveCatalogResourcePath(rootDir, resourcePath)
      if (!resolvedPath) {
        warnings.push(`pack ${pack.id} has invalid ${kind} resource path ${resourcePath}; paths must be relative and stay inside the catalog ${kind} root`)
        continue
      }
      for (const filePath of listResourceJSONFiles(resolvedPath)) {
        if (fileNamePattern.test(filePath)) files.add(filePath)
      }
    }
  }
  return Array.from(files).sort()
}

export function listPackResourceSkillFiles(rootDir: string, packs: CapabilityPack[], warnings: string[]): string[] {
  const files = new Set<string>()
  for (const pack of packs) {
    const resourcePaths = pack.resources?.skills ?? []
    for (const resourcePath of resourcePaths) {
      const resolvedPath = resolveCatalogResourcePath(rootDir, resourcePath)
      if (!resolvedPath) {
        warnings.push(`pack ${pack.id} has invalid skills resource path ${resourcePath}; paths must be relative and stay inside the catalog skills root`)
        continue
      }
      for (const filePath of listResourceSkillFiles(resolvedPath)) files.add(filePath)
    }
  }
  return Array.from(files).sort()
}

function resolveCatalogResourcePath(rootDir: string, resourcePath: string): string | undefined {
  if (isAbsolute(resourcePath)) return undefined
  const resolvedPath = resolve(rootDir, resourcePath)
  const normalizedRoot = normalize(rootDir)
  const normalizedResolved = normalize(resolvedPath)
  if (normalizedResolved !== normalizedRoot && !normalizedResolved.startsWith(`${normalizedRoot}/`)) return undefined
  return resolvedPath
}

function listResourceJSONFiles(path: string): string[] {
  if (!existsSync(path)) return []
  const stat = statSync(path)
  if (stat.isFile()) return path.endsWith('.json') ? [path] : []
  if (stat.isDirectory()) return listPluginJSONFiles(path)
  return []
}

function listResourceSkillFiles(path: string): string[] {
  if (!existsSync(path)) return []
  const stat = statSync(path)
  if (stat.isFile()) return isSkillResourceFile(path) ? [path] : []
  if (stat.isDirectory()) return listPluginSkillFiles(path)
  return []
}

export function listPluginJSONFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  visit(dir)
  return files

  function visit(currentDir: string): void {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isFile() && entry.endsWith('.json')) {
        files.push(fullPath)
        continue
      }
      if (stat.isDirectory()) visit(fullPath)
    }
  }
}

export function listPluginSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  visit(dir)
  return files

  function visit(currentDir: string): void {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isFile() && isSkillResourceFile(fullPath)) {
        files.push(fullPath)
        continue
      }
      if (stat.isDirectory()) visit(fullPath)
    }
  }
}

export function listPluginCodexSkillFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files: string[] = []
  visit(dir)
  return files

  function visit(currentDir: string): void {
    for (const entry of readdirSync(currentDir).sort()) {
      const fullPath = join(currentDir, entry)
      const stat = statSync(fullPath)
      if (stat.isFile() && (/(^|\/)SKILL\.md$/i.test(fullPath) || /\.skill\.md$/i.test(fullPath))) {
        files.push(fullPath)
        continue
      }
      if (stat.isDirectory()) visit(fullPath)
    }
  }
}

function isSkillResourceFile(filePath: string): boolean {
  return /(^|\/)skill\.json$/i.test(filePath)
    || /\.skill\.json$/i.test(filePath)
    || /(^|\/)SKILL\.md$/i.test(filePath)
    || /\.skill\.md$/i.test(filePath)
}
