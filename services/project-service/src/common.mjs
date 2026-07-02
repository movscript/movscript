import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export function pathStringValue(value) {
  const raw = stringValue(value)
  return raw ? resolve(raw) : undefined
}

export function stableJSONString(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSONString).join(',')}]`
  if (!recordValue(value)) return JSON.stringify(value)
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJSONString(value[key])}`).join(',')}}`
}

export function normalizeProjectAssetSourcePath(value) {
  const raw = stringValue(value)
  if (!raw) throw httpError(400, 'project_asset_path_required', 'assetPath is required')
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.includes('..') || !normalized.endsWith('/asset.json') || !parts.includes('assets')) {
    throw httpError(400, 'project_asset_path_invalid', 'assetPath must point to a project asset.json file')
  }
  return normalized
}

export function parseJSONObjectFile(content, path) {
  try {
    const parsed = JSON.parse(content)
    const record = recordValue(parsed)
    if (record) return record
  } catch {
    // handled below with a path-specific error
  }
  throw httpError(400, 'project_source_json_invalid', `source JSON is invalid: ${path}`)
}

export async function readJSONFile(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'))
    return recordValue(parsed)
  } catch {
    return undefined
  }
}

export async function writeProjectJSONFile(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function readJSONBody(request) {
  const chunks = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw httpError(400, 'invalid_json', 'request body must be valid JSON')
  }
}

export function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function providerCertificationStorageKey(provider, certification) {
  const model = stringValue(certification.model ?? certification.public_model_id ?? certification.publicModelId ?? certification.provider_model_id ?? certification.providerModelId)
  return model ? `${provider}::model:${model}` : provider
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export function idValue(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

export function numberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function recordValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

export function pathSegmentAfter(path, segment) {
  const parts = String(path ?? '').split('/').filter(Boolean)
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

export function pruneUndefinedRecord(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ''))
}

export function stringRecord(value) {
  const record = recordValue(value)
  if (!record) return {}
  return Object.fromEntries(Object.entries(record)
    .filter(([, item]) => typeof item === 'string')
    .map(([key, item]) => [key, item]))
}

export function isNotFoundError(error) {
  return typeof error === 'object' && error !== null && error.code === 'ENOENT'
}

export function httpError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

