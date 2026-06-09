#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MOVSCRIPT_LANG_PACKAGES = [
  '@movscript/compiler',
  '@movscript/engine',
  '@movscript/language',
  '@movscript/workspace',
]

export async function updateMovscriptLangIntegration(input = {}) {
  const root = path.resolve(input.root ?? process.cwd())
  const mode = input.mode
  if (mode !== 'latest' && mode !== 'version') {
    throw new Error(`Unsupported movscript-lang dependency mode: ${String(mode)}`)
  }

  const corePackagePath = path.join(root, 'packages/core/package.json')
  const spec = mode === 'latest' ? 'latest' : requiredVersionSpec(input.versionSpec)
  const dependencySpecs = Object.fromEntries(MOVSCRIPT_LANG_PACKAGES.map((packageName) => [packageName, spec]))

  const corePackage = await readJson(corePackagePath)
  corePackage.dependencies = {
    ...(isRecord(corePackage.dependencies) ? corePackage.dependencies : {}),
  }
  for (const packageName of MOVSCRIPT_LANG_PACKAGES) {
    corePackage.dependencies[packageName] = dependencySpecs[packageName]
  }
  await writeJson(corePackagePath, corePackage)

  return {
    mode,
    specs: dependencySpecs,
    corePackagePath,
  }
}

export function parseMovscriptLangDepsCliArgs(argv) {
  const args = [...argv]
  const mode = args.shift()
  if (mode === 'latest') return { mode }
  if (mode === 'version') {
    return {
      mode,
      versionSpec: args.find((arg) => !arg.startsWith('--')),
    }
  }
  return { mode }
}

function requiredVersionSpec(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Version mode requires a dependency spec, for example: node scripts/movscript-lang-deps.mjs version 0.2.0')
  }
  return value.trim()
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
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entrypoint && entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
