import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_TOP_LIMIT = 20
const PRODUCTION_TSX_LINE_LIMIT = 800

const DEFAULT_LARGE_TSX_BASELINE = {
}

const DEFAULT_FEATURE_COMPONENT_BOUNDARY_BASELINE = {
}

const BOUNDARY_PATTERNS = {
  windowApi: /\bwindow\.api\b/g,
  windowAddEventListener: /\bwindow\.addEventListener\b/g,
  windowDispatchEvent: /\bwindow\.dispatchEvent\b/g,
  localStorage: /\b(?:window\.)?localStorage\b/g,
  sessionStorage: /\b(?:window\.)?sessionStorage\b/g,
  queryKeyLiteral: /queryKey\s*:\s*\[/g,
}

const DASHBOARD_PATTERNS = {
  ...BOUNDARY_PATTERNS,
  queryKeyLiteral: /queryKey\s*:\s*\[/g,
  invalidateQueries: /invalidateQueries\s*\(/g,
}

const RESOURCE_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[)\s*['"](?:resources|resource-|external-resource|external-resources|agent-generated-candidate-targets|canvas-resource|content-source-workspace-candidate-resources|shot-library-resource-picker|asset-slots)/
const SHOT_LIBRARY_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:shot-references)/
const CANVAS_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:canvas|canvases|canvas-reference-workflows|workbench-canvas)/
const SCRIPT_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:scripts|semantic-script-versions|artifact-refs)/
const JOB_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:jobs)/
const ORGANIZATION_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:org)/
const PROJECT_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|removeQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:projects|project|progress)['"]/
const AUTH_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|removeQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:auth|invitation)['"]/
const PROJECT_STANDARDS_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|removeQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:project-workspace-artifacts)['"]/
const MODEL_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|removeQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"]models['"]/
const AGENT_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|removeQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:agent-settings-provider-model-config|agent-settings-skill-catalog|agent-settings-tool-permissions|agents-workspace-config|agent-composer-workspace-projects|agents-backend-models|agents-app-server-status|workspace-model-providers-config|workspace-model-providers-backend-models|embedded-browser-navigation|agent-message-workspace-artifacts|agent-console-provider-capability-probe|agent-console-provider-model-config|agent-console-control-app-server-status|agent-control-capability-health)['"]/
const SEMANTIC_ENTITY_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|cancelQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*(?:['"](?:semantic-inline-editor|semantic-source-lock)|config\.kind)/
const PROVIDER_SESSION_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:provider-session-threads|provider-session-panel-thread-history|provider-sessions|provider-session-health|agent-console-provider-sessions|agent-console-runs|agent-console-threads)/
const MOVSCRIPT_WORKSPACE_QUERY_KEY_LITERAL_PATTERN = /(?:queryKey\s*:\s*\[|invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[|getQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueryData(?:<[^>]+>)?\s*\(\s*\[|setQueriesData(?:<[^>]+>)?\s*\(\s*\{\s*queryKey\s*:\s*\[)\s*['"](?:movscript-workspace-root|movscript-workspace-files|movscript-workspace-file|movscript-workspace-review-file)/

export function collectFrontendQualityMetrics(frontendRoot, input = {}) {
  const topLimit = input.topLimit ?? DEFAULT_TOP_LIMIT
  const srcRoot = resolve(frontendRoot, 'src')
  const sourceFiles = listFiles(srcRoot, (file) => /\.(ts|tsx|css)$/.test(file))
    .map((absolutePath) => analyzeFile(frontendRoot, absolutePath))
    .filter((item) => !isIgnoredGeneratedPath(item.path))

  const productionSourceFiles = sourceFiles.filter((item) => isProductionSourcePath(item.path))
  const productionTsxFiles = productionSourceFiles.filter((item) => item.path.endsWith('.tsx'))
  const featureComponentFiles = productionSourceFiles.filter((item) => isFeatureComponentPath(item.path))

  return {
    files: sourceFiles,
    topFilesByLines: [...productionSourceFiles].sort((left, right) => right.lines - left.lines).slice(0, topLimit),
    topFilesByBytes: [...productionSourceFiles].sort((left, right) => right.bytes - left.bytes).slice(0, topLimit),
    productionSourceFiles,
    productionTsxFiles,
    featureComponentFiles,
    counts: totalCounts(productionSourceFiles, DASHBOARD_PATTERNS),
    featureComponentCounts: totalCounts(featureComponentFiles, DASHBOARD_PATTERNS),
    invalidationTargets: collectInvalidationTargets(productionSourceFiles).slice(0, topLimit),
  }
}

export function checkFrontendQuality(frontendRoot, input = {}) {
  const metrics = collectFrontendQualityMetrics(frontendRoot, input)
  const lineLimit = input.lineLimit ?? PRODUCTION_TSX_LINE_LIMIT
  const largeTsxBaseline = input.largeTsxBaseline ?? DEFAULT_LARGE_TSX_BASELINE
  const boundaryBaseline = input.featureComponentBoundaryBaseline ?? DEFAULT_FEATURE_COMPONENT_BOUNDARY_BASELINE
  const failures = []

  for (const file of metrics.productionTsxFiles) {
    if (file.lines <= lineLimit) continue
    const baseline = largeTsxBaseline[file.path] ?? 0
    if (file.lines > baseline) {
      failures.push(`Production TSX file exceeds ${lineLimit} lines without baseline headroom: ${file.path} (${file.lines} lines)`)
    }
  }

  for (const file of metrics.featureComponentFiles) {
    const baseline = boundaryBaseline[file.path] ?? {}
    for (const key of Object.keys(BOUNDARY_PATTERNS)) {
      const count = file.counts[key] ?? 0
      const allowed = baseline[key] ?? 0
      if (count > allowed) {
        failures.push(`Feature component boundary count increased: ${file.path} ${key} ${count} > ${allowed}`)
      }
    }
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/resources/application/resourceQueryKeys.ts') continue
    if (!RESOURCE_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Resource query key literal must use resourceQueryKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/shot-library/application/shotLibraryQueryKeys.ts') continue
    if (!SHOT_LIBRARY_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Shot library query key literal must use shotLibraryKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/canvas/application/canvasQueryKeys.ts') continue
    if (!CANVAS_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Canvas query key literal must use canvasKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/scripts/application/scriptQueryKeys.ts') continue
    if (!SCRIPT_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Script query key literal must use scriptKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/jobs/application/jobQueryKeys.ts') continue
    if (!JOB_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Job query key literal must use jobKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/organization/application/organizationQueryKeys.ts') continue
    if (!ORGANIZATION_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Organization query key literal must use organizationKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/project/application/projectQueries.ts') continue
    if (!PROJECT_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Project query key literal must use projectKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/auth/application/authQueryKeys.ts') continue
    if (!AUTH_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Auth query key literal must use authKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/project-standards/application/projectStandardsQueryKeys.ts') continue
    if (!PROJECT_STANDARDS_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Project standards query key literal must use projectStandardsKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/shared/application/modelQueryKeys.ts') continue
    if (file.path === 'src/features/agent/application/agentModelQueryKeys.ts') continue
    if (!MODEL_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Model query key literal must use modelKeys or agentModelKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/agent/application/agentQueryKeys.ts') continue
    if (!AGENT_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Agent query key literal must use agentQueryKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/shared/application/semanticEntityQueryKeys.ts') continue
    if (!SEMANTIC_ENTITY_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Semantic entity query key literal must use semanticEntityKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/agent/application/providerSessionQueryKeys.ts') continue
    if (!PROVIDER_SESSION_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`Provider session query key literal must use providerSessionQueryKeys factory: ${file.path}`)
  }

  for (const file of metrics.productionSourceFiles) {
    if (file.path === 'src/features/agent/application/movScriptWorkspaceQueryKeys.ts') continue
    if (!MOVSCRIPT_WORKSPACE_QUERY_KEY_LITERAL_PATTERN.test(file.source)) continue
    failures.push(`MovScript workspace query key literal must use movScriptWorkspaceKeys factory: ${file.path}`)
  }

  return { failures, metrics }
}

export function formatFrontendQualityDashboard(metrics) {
  return [
    'Frontend quality dashboard',
    '',
    'Largest production source files by lines:',
    ...metrics.topFilesByLines.map((item) => `- ${item.lines} ${item.path}`),
    '',
    'Largest production source files by bytes:',
    ...metrics.topFilesByBytes.map((item) => `- ${item.bytes} ${item.path}`),
    '',
    'Production source counts:',
    ...Object.entries(metrics.counts).map(([key, value]) => `- ${key}: ${value}`),
    '',
    'Feature component counts:',
    ...Object.entries(metrics.featureComponentCounts).map(([key, value]) => `- ${key}: ${value}`),
    '',
    'Top invalidateQueries targets:',
    ...metrics.invalidationTargets.map((item) => `- ${item.count} ${item.target}`),
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const check = process.argv.includes('--check')
  const result = check ? checkFrontendQuality(frontendRoot) : { failures: [], metrics: collectFrontendQualityMetrics(frontendRoot) }

  console.log(formatFrontendQualityDashboard(result.metrics))

  if (result.failures.length > 0) {
    console.error('\nFrontend quality check failed:')
    for (const failure of result.failures) console.error(`- ${failure}`)
    process.exit(1)
  }
}

function analyzeFile(frontendRoot, absolutePath) {
  const source = readFileSync(absolutePath, 'utf8')
  return {
    path: toPosix(relative(frontendRoot, absolutePath)),
    bytes: Buffer.byteLength(source),
    lines: source.split('\n').length,
    source,
    counts: countPatterns(source, DASHBOARD_PATTERNS),
  }
}

function countPatterns(source, patterns) {
  const counts = {}
  for (const [key, pattern] of Object.entries(patterns)) {
    counts[key] = source.match(pattern)?.length ?? 0
  }
  return counts
}

function totalCounts(files, patterns) {
  const counts = Object.fromEntries(Object.keys(patterns).map((key) => [key, 0]))
  for (const file of files) {
    for (const key of Object.keys(patterns)) counts[key] += file.counts[key] ?? 0
  }
  return counts
}

function collectInvalidationTargets(files) {
  const targets = new Map()
  for (const file of files) {
    for (const match of file.source.matchAll(/invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*([^}\n]+?)\s*\}/g)) {
      const target = match[1].replace(/\s+/g, ' ').trim()
      targets.set(target, (targets.get(target) ?? 0) + 1)
    }
  }
  return [...targets.entries()]
    .map(([target, count]) => ({ target, count }))
    .sort((left, right) => right.count - left.count || left.target.localeCompare(right.target))
}

function listFiles(root, predicate) {
  if (!existsSync(root)) return []
  const files = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    const stat = statSync(current)
    if (stat.isDirectory()) {
      for (const child of readdirSync(current)) {
        if (child === 'node_modules' || child === 'dist' || child === 'out') continue
        stack.push(resolve(current, child))
      }
      continue
    }
    if (stat.isFile() && predicate(current)) files.push(current)
  }
  return files
}

function isProductionSourcePath(path) {
  if (!path.startsWith('src/')) return false
  if (path.startsWith('src/e2e/')) return false
  if (/\.(test|spec)\.(ts|tsx|css)$/.test(path)) return false
  return /\.(ts|tsx|css)$/.test(path)
}

function isFeatureComponentPath(path) {
  if (!/\.(ts|tsx)$/.test(path)) return false
  return /^src\/features\/[^/]+\/components\//.test(path) || /^src\/pages\//.test(path)
}

function isIgnoredGeneratedPath(path) {
  return path.startsWith('src/shared/infrastructure/app-server/app-server-protocol/')
}

function toPosix(path) {
  return path.split('\\').join('/')
}
