import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_TOP_LIMIT = 20
const SYSTEM_FILE_PATTERN = /(^|\/)(?:\.DS_Store|Thumbs\.db)$/
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|css)$/
const BROWSER_SIDE_EFFECT_PATTERNS = {
  window: /\bwindow\b/g,
  document: /\bdocument\b/g,
  localStorage: /\blocalStorage\b/g,
  addEventListener: /\baddEventListener\s*\(/g,
  dispatchEvent: /\bdispatchEvent\s*\(/g,
}

export function collectUiPackageQualityMetrics(uiRoot, input = {}) {
  const topLimit = input.topLimit ?? DEFAULT_TOP_LIMIT
  const srcRoot = resolve(uiRoot, 'src')
  const sourceFiles = listFiles(srcRoot, (file) => SOURCE_EXTENSIONS.test(file))
    .map((absolutePath) => analyzeFile(uiRoot, absolutePath))
  const businessSourceFiles = sourceFiles.filter((file) => file.path.startsWith('src/components/business/'))
  const businessCssFiles = businessSourceFiles.filter((file) => file.path.endsWith('.css'))
  const rootEntry = readOptional(resolve(uiRoot, 'src/index.ts'))
  const businessBarrel = readOptional(resolve(uiRoot, 'src/components/business/index.ts'))
  const systemFiles = listFiles(uiRoot, (file) => SYSTEM_FILE_PATTERN.test(file))
    .map((absolutePath) => toPosix(relative(uiRoot, absolutePath)))

  return {
    topFilesByLines: [...sourceFiles].sort((left, right) => right.lines - left.lines).slice(0, topLimit),
    topFilesByBytes: [...sourceFiles].sort((left, right) => right.bytes - left.bytes).slice(0, topLimit),
    topBusinessCssFilesByLines: [...businessCssFiles].sort((left, right) => right.lines - left.lines).slice(0, topLimit),
    sourceFileCount: sourceFiles.length,
    businessFileCount: businessSourceFiles.length,
    businessCssLineCount: businessCssFiles.reduce((total, file) => total + file.lines, 0),
    businessCssLinesByDomain: collectBusinessCssLinesByDomain(businessCssFiles),
    businessBarrelExportCount: countMatches(businessBarrel, /^\s*export\b/gm),
    businessBarrelHasFlatExports: /^\s*export\s*\{/.test(businessBarrel),
    rootEntryExportsBusiness: /components\/business/.test(rootEntry),
    rootEntryExportsDebug: /['"]\.\/debug/.test(rootEntry) || /['"]\.\/debug-entry/.test(rootEntry),
    systemFiles,
    browserSideEffects: collectBrowserSideEffects(sourceFiles),
  }
}

export function checkUiPackageQuality(uiRoot) {
  const metrics = collectUiPackageQualityMetrics(uiRoot)
  const failures = []

  if (metrics.systemFiles.length > 0) {
    failures.push(`UI package contains system files: ${metrics.systemFiles.join(', ')}`)
  }

  if (metrics.rootEntryExportsBusiness) {
    failures.push('UI package root entry must not export business components')
  }

  if (metrics.rootEntryExportsDebug) {
    failures.push('UI package root entry must not export debug tools')
  }

  if (existsSync(resolve(uiRoot, 'src/styles.css'))) {
    failures.push('UI package legacy all-in-one styles.css entry must not exist')
  }

  if (metrics.businessBarrelHasFlatExports) {
    failures.push('UI package business barrel must expose domain namespaces only')
  }

  return { failures, metrics }
}

export function formatUiPackageQualityDashboard(metrics) {
  return [
    'UI package quality dashboard',
    '',
    'Largest UI source files by lines:',
    ...metrics.topFilesByLines.map((item) => `- ${item.lines} ${item.path}`),
    '',
    'Largest UI source files by bytes:',
    ...metrics.topFilesByBytes.map((item) => `- ${item.bytes} ${item.path}`),
    '',
    'Largest business CSS files by lines:',
    ...metrics.topBusinessCssFilesByLines.map((item) => `- ${item.lines} ${item.path}`),
    '',
    'Package boundary counts:',
    `- sourceFiles: ${metrics.sourceFileCount}`,
    `- businessFiles: ${metrics.businessFileCount}`,
    `- businessCssLines: ${metrics.businessCssLineCount}`,
    `- businessBarrelExports: ${metrics.businessBarrelExportCount}`,
    `- businessBarrelHasFlatExports: ${metrics.businessBarrelHasFlatExports}`,
    `- systemFiles: ${metrics.systemFiles.length}`,
    '',
    'Business CSS lines by domain:',
    ...metrics.businessCssLinesByDomain.map((item) => `- ${item.lines} ${item.domain}`),
    '',
    'Browser side-effect references:',
    ...metrics.browserSideEffects.map((item) => `- ${item.count} ${item.kind} ${item.path}`),
  ].join('\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const uiRoot = resolve(repoRoot, 'packages/ui')
  const check = process.argv.includes('--check')
  const result = check ? checkUiPackageQuality(uiRoot) : { failures: [], metrics: collectUiPackageQualityMetrics(uiRoot) }

  console.log(formatUiPackageQualityDashboard(result.metrics))

  if (result.failures.length > 0) {
    console.error('\nUI package quality check failed:')
    for (const failure of result.failures) console.error(`- ${failure}`)
    process.exit(1)
  }
}

function analyzeFile(uiRoot, absolutePath) {
  const source = readFileSync(absolutePath, 'utf8')
  return {
    path: toPosix(relative(uiRoot, absolutePath)),
    bytes: Buffer.byteLength(source),
    lines: source.split('\n').length,
    source,
  }
}

function collectBrowserSideEffects(files) {
  const sideEffects = []
  for (const file of files) {
    for (const [kind, pattern] of Object.entries(BROWSER_SIDE_EFFECT_PATTERNS)) {
      const count = countMatches(file.source, pattern)
      if (count > 0) sideEffects.push({ path: file.path, kind, count })
    }
  }
  return sideEffects.sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
}

function collectBusinessCssLinesByDomain(files) {
  const linesByDomain = new Map()
  for (const file of files) {
    const match = file.path.match(/^src\/components\/business\/([^/]+)\//)
    if (!match) continue
    const domain = match[1]
    linesByDomain.set(domain, (linesByDomain.get(domain) ?? 0) + file.lines)
  }

  return [...linesByDomain.entries()]
    .map(([domain, lines]) => ({ domain, lines }))
    .sort((left, right) => right.lines - left.lines || left.domain.localeCompare(right.domain))
}

function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0
}

function readOptional(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function listFiles(root, predicate) {
  if (!existsSync(root)) return []
  const files = []
  for (const entry of readdirSync(root)) {
    const absolutePath = resolve(root, entry)
    const stats = statSync(absolutePath)
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue
      files.push(...listFiles(absolutePath, predicate))
    } else if (predicate(absolutePath)) {
      files.push(absolutePath)
    }
  }
  return files
}

function toPosix(path) {
  return path.split('\\').join('/')
}
