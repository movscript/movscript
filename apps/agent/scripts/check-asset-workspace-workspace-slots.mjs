#!/usr/bin/env node

const DEFAULT_AGENT_BASE_URL = 'http://127.0.0.1:28765'
const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const DEFAULT_BACKEND_BASE_URL = 'http://localhost:8765'
const INACTIVE_SLOT_STATUSES = new Set(['ignored', 'waived', 'merged'])

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const agentBaseURL = trimTrailingSlash(args.agentUrl ?? args['agent-url'] ?? process.env.MOVSCRIPT_AGENT_BASE_URL ?? DEFAULT_AGENT_BASE_URL)
  const backendBaseURL = normalizeAPIBaseURL(args.backendUrl ?? args['backend-url'] ?? process.env.MOVSCRIPT_API_BASE_URL ?? process.env.MOVSCRIPT_BACKEND_API_BASE_URL ?? DEFAULT_BACKEND_BASE_URL)
  const authToken = args.authToken ?? args['auth-token'] ?? process.env.MOVSCRIPT_AUTH_TOKEN
  const includeInactive = args.includeInactive === true || args['include-inactive'] === true

  const runtimeCapabilities = await getJSON(`${agentBaseURL}/runtime/capabilities`)
  const mcpEndpoint = args.mcpEndpoint ?? args['mcp-endpoint'] ?? runtimeCapabilities.mcpEndpoint ?? process.env.MOVSCRIPT_MCP_ENDPOINT ?? DEFAULT_MCP_ENDPOINT
  await mcpCall(mcpEndpoint, 'initialize', {
    protocolVersion: '2025-06-18',
    clientInfo: { name: 'asset-workspace-workspace-slot-check', version: '0.1.0' },
    capabilities: {},
  })
  const focus = await readMCPFocus(mcpEndpoint)
  const projectId = numberArg(args.projectId ?? args['project-id']) ?? projectIdFromFocus(focus)
  if (!projectId) {
    throw new Error('Usage: pnpm --filter @movscript/agent check:asset-workspace-slots -- [--project-id <id>] [--agent-url http://127.0.0.1:28765] [--mcp-endpoint http://127.0.0.1:18765/mcp] [--backend-url http://localhost:8765] [--include-inactive]. No --project-id was provided and current MCP focus has no project.id.')
  }

  const currentSlotsRaw = await backendList(`${backendBaseURL}/projects/${projectId}/entities/asset-slots?include_internal=true`, authToken)
  const currentSlots = includeInactive ? currentSlotsRaw : currentSlotsRaw.filter(isActiveSlot)

  const contractResult = await mcpCall(mcpEndpoint, 'tools/call', {
    name: 'get_workspace_model',
    arguments: {
      kind: 'asset_workspace',
      target: { entityType: 'project', entityId: projectId, projectId },
      seedMode: 'editable_snapshot',
      hydrate: true,
    },
  })
  const contract = unwrapToolData(contractResult)
  const seed = isRecord(contract.seed) ? contract.seed : {}
  const seedData = isRecord(seed.data) ? seed.data : {}
  const seedSlots = Array.isArray(seedData.asset_slots) ? seedData.asset_slots : []

  const workspaceContent = {
    schema: 'movscript.asset_workspace.v1',
    scope: 'asset_workspace',
    mode: 'snapshot',
    projectId,
    snapshot_base: {
      asset_slots: seedSlots,
    },
    workspace: {
      creative_references: [],
      asset_slots: seedSlots,
      candidate_plans: [],
    },
    summary: 'Diagnostic asset workspace workspace created to verify hydrated asset slot coverage.',
    createdAt: new Date().toISOString(),
  }

  const workspace = await postJSON(`${agentBaseURL}/workspace`, {
    projectId,
    kind: 'asset_workspace',
    title: `Asset workspace slot coverage check - project ${projectId}`,
    content: JSON.stringify(workspaceContent, null, 2),
    target: { entityType: 'project', entityId: projectId, projectId },
    seed,
    metadata: {
      diagnostic: 'asset-workspace-workspace-slot-coverage',
      projectId,
      expectedActiveAssetSlotCount: currentSlots.length,
      expectedRawAssetSlotCount: currentSlotsRaw.length,
      includeInactive,
    },
  })

  const parsedContent = parseWorkspaceContent(workspace.content)
  const snapshotSlots = Array.isArray(parsedContent.snapshot_base?.asset_slots) ? parsedContent.snapshot_base.asset_slots : []
  const workspaceSlots = Array.isArray(parsedContent.workspace?.asset_slots) ? parsedContent.workspace.asset_slots : []
  const expectedIds = idsOf(currentSlots)
  const seedIds = idsOf(seedSlots)
  const snapshotIds = idsOf(snapshotSlots)
  const workspaceIds = idsOf(workspaceSlots)

  const applyPreview = await postJSON(`${agentBaseURL}/workspaces/${encodeURIComponent(workspace.id)}/apply-preview`, {})
  const report = {
    projectId,
    workspaceId: workspace.id,
    workspacePath: runtimeCapabilities.paths?.workspacePath,
    agentBaseURL,
    mcpEndpoint,
    backendBaseURL,
    includeInactive,
    counts: {
      backendRaw: currentSlotsRaw.length,
      expectedCompared: currentSlots.length,
      mcpSeedAssetSlots: seedSlots.length,
      workspaceSnapshotBaseAssetSlots: snapshotSlots.length,
      workspaceWorkspaceAssetSlots: workspaceSlots.length,
    },
    missingFromMCPSeed: difference(expectedIds, seedIds),
    missingFromWorkspaceSnapshotBase: difference(expectedIds, snapshotIds),
    missingFromWorkspaceWorkspace: difference(expectedIds, workspaceIds),
    extraInWorkspaceWorkspace: difference(workspaceIds, expectedIds),
    applyPreview: {
      ok: applyPreview.ok === true,
      stage: typeof applyPreview.stage === 'string' ? applyPreview.stage : undefined,
      issues: Array.isArray(applyPreview.validation?.issues) ? applyPreview.validation.issues : [],
    },
  }

  console.log(JSON.stringify(report, null, 2))
  if (report.missingFromWorkspaceWorkspace.length > 0 || report.missingFromWorkspaceSnapshotBase.length > 0) {
    process.exitCode = 2
  }
}

async function readMCPFocus(mcpEndpoint) {
  try {
    return unwrapToolData(await mcpCall(mcpEndpoint, 'tools/call', {
      name: 'movscript_focus_get',
      arguments: {},
    }))
  } catch {
    return {}
  }
}

function projectIdFromFocus(focus) {
  if (!isRecord(focus)) return undefined
  const project = isRecord(focus.project) ? focus.project : undefined
  return numberArg(focus.projectId ?? focus.project_id ?? project?.id ?? project?.ID)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const eq = arg.indexOf('=')
    if (eq > 2) {
      out[toCamel(arg.slice(2, eq))] = arg.slice(eq + 1)
      out[arg.slice(2, eq)] = arg.slice(eq + 1)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    const value = next && !next.startsWith('--') ? next : true
    out[toCamel(key)] = value
    out[key] = value
    if (value !== true) i += 1
  }
  return out
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())
}

function numberArg(value) {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(num) && num > 0 ? num : undefined
}

function normalizeAPIBaseURL(value) {
  const trimmed = trimTrailingSlash(value)
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status} ${await safeText(res)}`)
  return res.json()
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${url} failed: HTTP ${res.status} ${await safeText(res)}`)
  return res.json()
}

async function backendList(url, authToken) {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
  const res = await fetch(url, { headers, cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status} ${await safeText(res)}`)
  const data = await res.json()
  if (Array.isArray(data)) return data
  if (Array.isArray(data.asset_slots)) return data.asset_slots
  if (Array.isArray(data.items)) return data.items
  if (Array.isArray(data.data)) return data.data
  throw new Error(`GET ${url} did not return an array-like asset slot payload`)
}

let rpcId = 1
async function mcpCall(endpoint, method, params) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  })
  if (!res.ok) throw new Error(`MCP ${method} failed: HTTP ${res.status} ${await safeText(res)}`)
  const json = await res.json()
  if (json.error) throw new Error(`MCP ${method} failed: ${json.error.message}`)
  return json.result
}

function unwrapToolData(value) {
  if (isRecord(value.data)) return value.data
  const text = Array.isArray(value.content) && isRecord(value.content[0]) ? value.content[0].text : undefined
  if (typeof text === 'string') {
    try {
      return JSON.parse(text)
    } catch {
      return {}
    }
  }
  return {}
}

function parseWorkspaceContent(content) {
  const parsed = JSON.parse(content)
  return isRecord(parsed) ? parsed : {}
}

function idsOf(items) {
  return Array.from(new Set(items.map(slotIdOf).filter((id) => id !== undefined))).sort((a, b) => a - b)
}

function slotIdOf(item) {
  if (!isRecord(item)) return undefined
  const id = Number(item.ID ?? item.id)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}

function isActiveSlot(item) {
  if (!isRecord(item)) return false
  const status = typeof item.status === 'string' ? item.status.trim().toLowerCase() : ''
  return !status || !INACTIVE_SLOT_STATUSES.has(status)
}

function difference(left, right) {
  const rightSet = new Set(right)
  return left.filter((item) => !rightSet.has(item))
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function safeText(res) {
  try {
    return await res.text()
  } catch {
    return ''
  }
}

main().catch((error) => {
  console.error(formatError(error))
  process.exit(1)
})

function formatError(error) {
  if (!(error instanceof Error)) return String(error)
  const parts = [error.message]
  const cause = error.cause
  if (cause instanceof Error) parts.push(`cause=${cause.message}`)
  if (isRecord(cause)) {
    const details = ['code', 'errno', 'syscall', 'address', 'port']
      .flatMap((key) => cause[key] === undefined ? [] : [`${key}=${String(cause[key])}`])
    if (details.length > 0) parts.push(`cause=${details.join(' ')}`)
  }
  return parts.join('; ')
}
