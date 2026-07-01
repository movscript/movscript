const generatedPathRules = Object.freeze({
  build: Object.freeze([
    { kind: 'component', value: 'dist' },
    { kind: 'component', value: 'dist-lib' },
    { kind: 'component', value: 'dist-electron' },
    { kind: 'component', value: 'out' },
    { kind: 'suffix', value: '.tsbuildinfo' },
    { kind: 'glob', value: 'apps/desktop/electron.vite.config.*.mjs' },
    { kind: 'path', value: 'apps/desktop/src/api/generated.ts' },
  ]),
  stage: Object.freeze([
    { kind: 'component', value: '.package-stage' },
  ]),
  release: Object.freeze([
    { kind: 'path', value: 'release-artifacts' },
    { kind: 'path', value: 'downloaded-artifacts' },
    { kind: 'glob', value: 'apps/*/release' },
    { kind: 'glob', value: 'plugins/*/release' },
    { kind: 'glob', value: 'plugins/*/manifest.runtime.json' },
  ]),
  cache: Object.freeze([
    { kind: 'component', value: 'node_modules' },
    { kind: 'component', value: '__pycache__' },
    { kind: 'component', value: '.gocache' },
    { kind: 'component', value: '.gomodcache' },
    { kind: 'path', value: '.pnpm-store' },
    { kind: 'path', value: '.venv' },
  ]),
  devState: Object.freeze([
    { kind: 'path', value: '.movscript-dev' },
    { kind: 'path', value: 'services/data-service/uploads' },
    { kind: 'path', value: 'timeline_assemblies' },
  ]),
  vendorRuntime: Object.freeze([
    { kind: 'path', value: 'apps/desktop/sdk-runtime' },
    { kind: 'path', value: 'apps/desktop/vendor/app-server' },
    { kind: 'path', value: 'apps/desktop/vendor/ffmpeg' },
    { kind: 'path', value: 'apps/desktop/vendor/sdk-runtimes' },
  ]),
})

export const generatedPathCategories = Object.freeze(Object.keys(generatedPathRules))

export const generatedCleanTargets = Object.freeze({
  build: Object.freeze([
    'apps/*/dist',
    'apps/desktop/dist-electron',
    'apps/desktop/out',
    'apps/desktop/electron.vite.config.*.mjs',
    'apps/desktop/src/api/generated.ts',
    'packages/*/dist',
    'services/*/dist',
    'surface/*/dist',
    'surface/*/dist-lib',
    '**/*.tsbuildinfo',
  ]),
  stage: Object.freeze([
    'apps/desktop/.package-stage',
  ]),
  release: Object.freeze([
    'apps/*/release',
    'downloaded-artifacts',
    'plugins/*/release',
    'plugins/*/manifest.runtime.json',
    'release-artifacts',
  ]),
  cache: Object.freeze([
    '.gocache',
    '.gomodcache',
    '.pnpm-store',
    '.venv',
    'apps/*/node_modules',
    'node_modules',
    'packages/*/node_modules',
    'services/*/node_modules',
    'surface/*/node_modules',
  ]),
  devState: Object.freeze([
    '.movscript-dev',
    'services/data-service/uploads',
    'timeline_assemblies',
  ]),
  vendorRuntime: Object.freeze([
    'apps/desktop/sdk-runtime',
    'apps/desktop/vendor/app-server',
    'apps/desktop/vendor/ffmpeg',
    'apps/desktop/vendor/sdk-runtimes',
  ]),
})

export const sourceScanGeneratedCategories = Object.freeze([
  'build',
  'stage',
  'release',
  'cache',
  'devState',
  'vendorRuntime',
])

export const generatedIgnorePatterns = Object.freeze([
  '.gocache',
  '.gomodcache',
  '.movscript-dev',
  '.pnpm-store',
  '.venv',
  '*.tsbuildinfo',
  'apps/*/dist/',
  'apps/desktop/.package-stage/',
  'apps/desktop/dist-electron/',
  'apps/desktop/electron.vite.config.*.mjs',
  'apps/desktop/out/',
  'apps/desktop/release/',
  'apps/desktop/sdk-runtime/',
  'apps/desktop/src/api/generated.ts',
  'apps/desktop/vendor/app-server/*/',
  'apps/desktop/vendor/ffmpeg/*/',
  'apps/desktop/vendor/sdk-runtimes/',
  'downloaded-artifacts/',
  'node_modules/',
  'packages/*/dist/',
  'plugins/*/manifest.runtime.json',
  'plugins/*/release/',
  'release-artifacts/',
  'services/*/dist/',
  'surface/*/dist/',
  'surface/*/dist-lib/',
  'timeline_assemblies/',
])

export function isGeneratedPath(path, options = {}) {
  const normalized = normalizeGeneratedPath(path)
  if (!normalized) return false

  const categories = options.categories ?? sourceScanGeneratedCategories
  for (const category of categories) {
    const rules = generatedPathRules[category] ?? []
    if (rules.some((rule) => matchesRule(normalized, rule))) return true
  }
  return false
}

export function isGeneratedDirectory(path, options = {}) {
  return isGeneratedPath(path, options)
}

export function generatedRulesForCategory(category) {
  return generatedPathRules[category] ?? []
}

export function normalizeGeneratedPath(path) {
  return String(path ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function matchesRule(path, rule) {
  if (rule.kind === 'component') {
    return path.split('/').includes(rule.value)
  }
  if (rule.kind === 'suffix') {
    return path.endsWith(rule.value)
  }
  if (rule.kind === 'path') {
    return path === rule.value || path.startsWith(`${rule.value}/`)
  }
  if (rule.kind === 'glob') {
    return globToRegExp(rule.value).test(path)
  }
  return false
}

function globToRegExp(glob) {
  let source = '^'
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    const next = glob[index + 1]
    if (char === '*' && next === '*') {
      source += '.*'
      index += 1
    } else if (char === '*') {
      source += '[^/]*'
    } else {
      source += escapeRegExp(char)
    }
  }
  return new RegExp(`${source}(?:/.*)?$`)
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
}
