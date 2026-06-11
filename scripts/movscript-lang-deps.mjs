#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MOVSCRIPT_LANG_PACKAGES = [
  '@movscript/interpreter',
  '@movscript/engine',
  '@movscript/language',
  '@movscript/workspace',
]

const PACKAGE_TARGETS = [
  'packages/core/package.json',
  'apps/cli/package.json',
]

export async function updateMovscriptLangIntegration(input = {}) {
  const root = path.resolve(input.root ?? process.cwd())
  const mode = input.mode
  if (mode !== 'latest' && mode !== 'version' && mode !== 'local') {
    throw new Error(`Unsupported movscript-lang dependency mode: ${String(mode)}`)
  }

  const updatedPackagePaths = []
  const updatedPackages = []

  for (const target of PACKAGE_TARGETS) {
    const packagePath = path.join(root, target)
    const packageJson = await readJson(packagePath).catch(() => undefined)
    if (!packageJson) continue
    const dependencySpecs = dependencySpecsForMode(root, input, path.dirname(packagePath))
    packageJson.dependencies = {
      ...(isRecord(packageJson.dependencies) ? packageJson.dependencies : {}),
    }
    for (const packageName of MOVSCRIPT_LANG_PACKAGES) {
      if (packageJson.dependencies[packageName] !== undefined || mode === 'local') {
        packageJson.dependencies[packageName] = dependencySpecs[packageName]
      }
    }
    await writeJson(packagePath, packageJson)
    updatedPackagePaths.push(packagePath)
    updatedPackages.push({ path: packagePath, specs: dependencySpecs })
  }

  return {
    mode,
    specs: updatedPackages[0]?.specs ?? dependencySpecsForMode(root, input, root),
    packagePaths: updatedPackagePaths,
    packages: updatedPackages,
  }
}

export function parseMovscriptLangDepsCliArgs(argv) {
  const args = [...argv]
  const mode = args.shift()
  if (mode === 'latest') return { mode }
  if (mode === 'local') {
    return {
      mode,
      localPath: optionValue(args, '--path') ?? optionValue(args, '--cwd') ?? args.find((arg) => !arg.startsWith('--')),
    }
  }
  if (mode === 'version') {
    return {
      mode,
      versionSpec: args.find((arg) => !arg.startsWith('--')),
    }
  }
  return { mode }
}

function dependencySpecsForMode(root, input, fromDir) {
  if (input.mode === 'latest') {
    return Object.fromEntries(MOVSCRIPT_LANG_PACKAGES.map((packageName) => [packageName, 'latest']))
  }
  if (input.mode === 'version') {
    const spec = requiredVersionSpec(input.versionSpec)
    return Object.fromEntries(MOVSCRIPT_LANG_PACKAGES.map((packageName) => [packageName, spec]))
  }
  const localRoot = path.resolve(root, input.localPath ?? '../movscript-lang')
  return Object.fromEntries(MOVSCRIPT_LANG_PACKAGES.map((packageName) => {
    const packageDir = packageName.replace('@movscript/', '')
    const relative = path.relative(fromDir, path.join(localRoot, 'packages', packageDir)).replace(/\\/g, '/')
    const specPath = relative.startsWith('.') ? relative : `./${relative}`
    return [packageName, `link:${specPath}`]
  }))
}

function requiredVersionSpec(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Version mode requires a dependency spec, for example: node scripts/movscript-lang-deps.mjs version 0.2.0')
  }
  return value.trim()
}

function optionValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(content)
  if (!isRecord(parsed)) throw new Error(`Expected JSON object: ${filePath}`)
  return parsed
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function main() {
  const input = parseMovscriptLangDepsCliArgs(process.argv.slice(2))
  const result = await updateMovscriptLangIntegration(input)
  const specs = [...new Set(Object.values(result.specs))]
  console.log(`movscript-lang dependencies set to ${specs.join(', ')} (${result.mode})`)
  for (const packagePath of result.packagePaths) {
    console.log(`updated ${path.relative(process.cwd(), packagePath)}`)
  }
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entrypoint && entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
