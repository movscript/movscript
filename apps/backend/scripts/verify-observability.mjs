import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const backendRoot = resolve(scriptDir, '..')
const repoRoot = resolve(backendRoot, '../..')
const observabilityRoot = join(backendRoot, 'observability')
const dashboardsDir = join(observabilityRoot, 'grafana/dashboards')

const expectedDashboards = new Map([
  ['movscript-overview', 'MovScript Overview'],
  ['movscript-agent', 'MovScript Agent'],
  ['movscript-frontend', 'MovScript Frontend'],
  ['movscript-backend-drilldown', 'MovScript Backend'],
  ['movscript-infrastructure', 'MovScript Infrastructure'],
  ['movscript-alerts', 'MovScript Alerts'],
])

const expectedJobs = [
  'movscript-backend',
  'movscript-agent-runtime',
  'node-exporter',
  'cadvisor',
]

const expectedRuleGroups = [
  'movscript.backend.health',
  'movscript.agent.client',
  'movscript.agent.runtime',
  'movscript.frontend.web-vitals',
  'movscript.infrastructure',
]

const requiredDashboardQueryCoverage = new Map([
  ['backend processing', ['movscript_http_requests_total', 'movscript_http_request_duration_milliseconds_bucket']],
  ['agent response', ['movscript_agent_client_operation_duration_milliseconds_sum', 'movscript_agent_trace_span_duration_ms']],
  ['frontend rendering', ['frontend_web_vital_lcp_ms', 'frontend_web_vital_inp_ms', 'frontend_web_vital_cls_score']],
  ['frontend storage', ['frontend_storage_operation_duration_ms']],
  ['agent storage', ['movscript_agent_storage_flush_duration_ms', 'movscript_agent_trace_store_operation_duration_ms', 'movscript_agent_storage_file_bytes']],
  ['server status', ['node_cpu_seconds_total', 'node_memory_MemAvailable_bytes', 'node_filesystem_avail_bytes', 'container_memory_working_set_bytes']],
])

function main() {
  verifyDashboards()
  verifyPrometheusConfig(join(observabilityRoot, 'prometheus.yml'))
  verifyPrometheusConfig(join(observabilityRoot, 'prometheus-compose.yml'))
  verifyAlertRules(join(observabilityRoot, 'rules/movscript-alerts.yml'))
  verifyComposeConfig(['-f', join(observabilityRoot, 'docker-compose.yml'), 'config'])
  verifyComposeConfig(['--profile', 'observability', 'config'])
  verifyWithPromtoolIfAvailable()
  console.log('observability verification passed')
}

function verifyDashboards() {
  const files = readdirSync(dashboardsDir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => join(dashboardsDir, name))

  const seen = new Map()
  const queryCorpus = []
  for (const file of files) {
    const dashboard = JSON.parse(readFileSync(file, 'utf8'))
    assertString(dashboard.uid, `${file}: missing dashboard uid`)
    assertString(dashboard.title, `${file}: missing dashboard title`)
    assertArray(dashboard.panels, `${file}: missing dashboard panels`)
    if (dashboard.panels.length === 0) throw new Error(`${file}: dashboard must contain at least one panel`)
    if (seen.has(dashboard.uid)) throw new Error(`duplicate dashboard uid ${dashboard.uid}`)
    seen.set(dashboard.uid, file)

    for (const panel of dashboard.panels) {
      assertString(panel.title, `${file}: panel ${panel.id ?? '<unknown>'} is missing title`)
      if (panel.targets !== undefined) assertArray(panel.targets, `${file}: panel ${panel.title} targets must be an array`)
      for (const target of panel.targets ?? []) {
        if (target.expr !== undefined) assertString(target.expr, `${file}: panel ${panel.title} has an empty query`)
        if (target.expr !== undefined) queryCorpus.push(target.expr)
      }
    }
  }

  for (const [uid, title] of expectedDashboards) {
    if (!seen.has(uid)) throw new Error(`missing provisioned dashboard ${uid}`)
    const dashboard = JSON.parse(readFileSync(seen.get(uid), 'utf8'))
    if (dashboard.title !== title) throw new Error(`dashboard ${uid} title = ${dashboard.title}, want ${title}`)
    if (!Array.isArray(dashboard.templating?.list) || dashboard.templating.list.length === 0) {
      throw new Error(`dashboard ${uid} must define dashboard variables`)
    }
  }

  const queryText = queryCorpus.join('\n')
  for (const [area, phrases] of requiredDashboardQueryCoverage) {
    for (const phrase of phrases) {
      if (!queryText.includes(phrase)) throw new Error(`dashboard query coverage missing ${area}: ${phrase}`)
    }
  }
}

function verifyPrometheusConfig(file) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes('rule_files:')) throw new Error(`${file}: missing rule_files`)
  for (const job of expectedJobs) {
    if (!text.includes(`job_name: ${job}`)) throw new Error(`${file}: missing scrape job ${job}`)
  }
}

function verifyAlertRules(file) {
  const text = readFileSync(file, 'utf8')
  for (const group of expectedRuleGroups) {
    if (!text.includes(`name: ${group}`)) throw new Error(`${file}: missing rule group ${group}`)
  }
  for (const alertName of ['MovscriptBackendDown', 'MovscriptAgentTelemetryRejected', 'MovscriptInfrastructureExporterDown']) {
    if (!text.includes(`alert: ${alertName}`)) throw new Error(`${file}: missing alert ${alertName}`)
  }
}

function verifyComposeConfig(args) {
  execFileSync('docker', ['compose', ...args], {
    cwd: repoRoot,
    stdio: 'pipe',
  })
}

function verifyWithPromtoolIfAvailable() {
  if (!commandExists('promtool')) return
  execFileSync('promtool', ['check', 'config', join(observabilityRoot, 'prometheus.yml')], { stdio: 'inherit' })
  execFileSync('promtool', ['check', 'config', join(observabilityRoot, 'prometheus-compose.yml')], { stdio: 'inherit' })
  execFileSync('promtool', ['check', 'rules', join(observabilityRoot, 'rules/movscript-alerts.yml')], { stdio: 'inherit' })
}

function commandExists(command) {
  try {
    execFileSync('sh', ['-lc', `command -v ${shellQuote(command)}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function assertString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message)
}

function assertArray(value, message) {
  if (!Array.isArray(value)) throw new Error(message)
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

if (!existsSync(observabilityRoot)) throw new Error(`missing observability directory: ${observabilityRoot}`)

main()
