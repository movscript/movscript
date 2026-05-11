#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inputPath, outputPath] = process.argv

if (!inputPath) {
  console.error('Usage: node scripts/sanitize-generation-trace.mjs <trace-events.json> [output.json]')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))
const events = Array.isArray(raw) ? raw : Array.isArray(raw.events) ? raw.events : []
if (!events.length) {
  console.error('Input must be an array of trace events or an object with an events array.')
  process.exit(1)
}

const sanitized = events
  .filter((event) => isRecord(event))
  .map((event) => sanitizeEvent(event))
  .filter((event) => isRecord(event.data) && isRecord(event.data.generation))

const output = {
  name: `sanitized provider trace: ${providerSlug(sanitized)} ${fixtureOutcome(sanitized)}`,
  source: 'provider',
  provider: providerSlug(sanitized),
  capturedAt: new Date().toISOString(),
  notes: 'Sanitized generation trace. Review provider/model names and resource metadata before committing.',
  events: sanitized,
  expected: expectedReplaySummary(sanitized),
}

const serialized = `${JSON.stringify(output, null, 2)}\n`
if (outputPath) {
  writeFileSync(outputPath, serialized)
} else {
  process.stdout.write(serialized)
}

function sanitizeEvent(event) {
  return cleanObject({
    createdAt: stringValue(event.createdAt),
    completedAt: stringValue(event.completedAt),
    data: sanitizeTraceData(event.data),
  })
}

function sanitizeTraceData(data) {
  if (!isRecord(data)) return undefined
  const generation = isRecord(data.generation) ? data.generation : undefined
  if (!generation) return undefined
  return {
    generation: sanitizeGeneration(generation),
  }
}

function sanitizeGeneration(generation) {
  return cleanObject({
    jobId: numericValue(generation.jobId ?? generation.job_id ?? generation.ID ?? generation.id),
    jobType: stringValue(generation.jobType ?? generation.job_type),
    providerName: stringValue(generation.providerName ?? generation.provider_name),
    modelDisplay: stringValue(generation.modelDisplay ?? generation.model_display),
    modelIdentifier: stringValue(generation.modelIdentifier ?? generation.model_identifier),
    modelConfigId: numericValue(generation.modelConfigId ?? generation.model_config_id),
    status: stringValue(generation.status) ?? 'unknown',
    stage: stringValue(generation.stage ?? generation.provider_status),
    progress: numericValue(generation.progress ?? generation.progress_percent ?? generation.percent),
    terminal: generation.terminal === true,
    outputResourceId: numericValue(generation.outputResourceId ?? generation.output_resource_id),
    message: sanitizeMessage(stringValue(generation.message ?? generation.error ?? generation.error_msg)),
    media: sanitizeResource(generation.media ?? generation.output_resource ?? generation.outputResource),
  })
}

function sanitizeResource(value) {
  if (!isRecord(value)) return undefined
  const type = stringValue(value.type)
  if (type !== 'image' && type !== 'video') return undefined
  const id = numericValue(value.ID ?? value.id)
  return cleanObject({
    ID: id,
    owner_id: numericValue(value.owner_id ?? value.ownerId),
    type,
    name: sanitizeName(stringValue(value.name), type, id),
    url: id ? `/api/v1/resources/${id}/file` : undefined,
    direct_url: stringValue(value.direct_url ?? value.directUrl) ? `/signed/redacted/resource-${id ?? 'unknown'}` : undefined,
    size: numericValue(value.size),
    mime_type: stringValue(value.mime_type ?? value.mimeType) ?? (type === 'video' ? 'video/mp4' : 'image/png'),
    storage_backend: stringValue(value.storage_backend ?? value.storageBackend) ? 'redacted' : undefined,
    storage_key: stringValue(value.storage_key ?? value.storageKey) ? `redacted/resource-${id ?? 'unknown'}` : undefined,
  })
}

function sanitizeName(name, type, id) {
  const extension = type === 'video' ? 'mp4' : 'png'
  if (!name) return `provider-${type}-${id ?? 'unknown'}.${extension}`
  return `provider-${type}-redacted-${id ?? 'unknown'}.${extension}`
}

function sanitizeMessage(message) {
  if (!message) return undefined
  return message
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[token]')
    .slice(0, 240)
}

function providerSlug(events) {
  const providerName = events
    .map((event) => event.data?.generation?.providerName)
    .find((value) => typeof value === 'string' && value.trim())
  if (!providerName) return 'sanitized-provider'
  return providerName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'sanitized-provider'
}

function fixtureOutcome(events) {
  const latest = latestGenerations(events).at(-1)
  const status = latest?.status
  if (status === 'succeeded') return 'succeeds after polling'
  if (status === 'failed') return 'fails with terminal message'
  if (status === 'cancelled') return 'is cancelled'
  if (status === 'timeout') return 'times out'
  return 'replay'
}

function expectedReplaySummary(events) {
  const latestByJob = latestGenerations(events)
  const latest = latestByJob.at(-1)
  const outputResourceIds = uniqueNumbers(latestByJob.flatMap((generation) => [
    generation.outputResourceId,
    generation.media?.ID,
  ]))
  return {
    jobs: latestByJob.length,
    active: latestByJob.filter((generation) => generation.terminal !== true).length,
    terminal: latestByJob.filter((generation) => generation.terminal === true).length,
    succeeded: latestByJob.filter((generation) => generation.status === 'succeeded' || generation.stage === 'completed').length,
    failed: latestByJob.filter((generation) => generation.status === 'failed' || generation.stage === 'failed').length,
    cancelled: latestByJob.filter((generation) => generation.status === 'cancelled' || generation.stage === 'cancelled').length,
    timeout: latestByJob.filter((generation) => generation.status === 'timeout' || generation.stage === 'timeout').length,
    ...(latest?.jobId ? { latestJobId: latest.jobId } : {}),
    outputResourceIds,
    metadataResourceIds: outputResourceIds,
  }
}

function latestGenerations(events) {
  const latestByKey = new Map()
  const keys = []
  for (const [index, event] of events.entries()) {
    const generation = event.data?.generation
    if (!generation) continue
    const key = generation.jobId ? `job:${generation.jobId}` : generation.outputResourceId ? `resource:${generation.outputResourceId}` : `event:${index}`
    if (!latestByKey.has(key)) keys.push(key)
    latestByKey.set(key, generation)
  }
  return keys.map((key) => latestByKey.get(key)).filter(Boolean)
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))]
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

function numericValue(value) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
