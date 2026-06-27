#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

import { isGeneratedDirectory } from './generated-paths.mjs'

const ts = await loadTypeScript()

const applicationSchema = 'movscript.application.v1'
const programSchema = 'movscript.program.v1'
const scenarioSchema = 'movscript.scenario-policy.v1'

const pluginStartableServiceNames = new Set([
  'movscript.data.service',
  'movscript.canvas.service',
  'movscript.project.service',
  'movscript.editing.service',
  'movscript.mcp.host',
  'movscript.local-surface.host',
  'movscript.media.pipeline',
])

export function discoverRuntimeManifests(rootDir = process.cwd()) {
  const root = resolve(rootDir)
  const files = [
    ...findManifestFiles(join(root, 'apps'), root),
    ...findManifestFiles(join(root, 'services'), root),
    ...findManifestFiles(join(root, 'packages'), root),
  ]

  const manifests = []
  for (const filePath of files) {
    for (const manifest of readManifestFile(filePath, root)) {
      manifests.push(manifest)
    }
  }
  return manifests
}

export function validateRuntimeRegistry(manifests) {
  const errors = []
  const applications = manifests.filter((manifest) => manifest.manifestKind === 'application')
  const programs = manifests.filter((manifest) => manifest.manifestKind === 'program')
  const scenarios = manifests.filter((manifest) => manifest.manifestKind === 'scenario')
  const programsByServiceName = new Map()
  const applicationsById = new Map()

  for (const application of applications) {
    if (!application.applicationId) errors.push(`${application.path}: applicationId is required`)
    if (application.applicationId && applicationsById.has(application.applicationId)) {
      errors.push(`${application.path}: duplicate applicationId ${application.applicationId}`)
    }
    if (application.applicationId) applicationsById.set(application.applicationId, application)
  }

  for (const program of programs) {
    if (!program.serviceName) errors.push(`${program.path}: serviceName is required`)
    if (program.serviceName && programsByServiceName.has(program.serviceName)) {
      errors.push(`${program.path}: duplicate serviceName ${program.serviceName}`)
    }
    if (program.serviceName) programsByServiceName.set(program.serviceName, program)

    if (program.path.startsWith('services/')) {
      if (!program.entry?.command) errors.push(`${program.path}: services/* programs must define entry.command`)
      if (!program.transport || program.transport === 'embedded' || program.transport === 'none') {
        errors.push(`${program.path}: services/* programs must define a non-embedded transport`)
      }
      if (!program.health?.kind || program.health.kind === 'none') {
        errors.push(`${program.path}: services/* programs must define health.kind`)
      }
      if (!Array.isArray(program.provides) || program.provides.length === 0) {
        errors.push(`${program.path}: services/* programs must define provides`)
      }
    }
  }

  for (const application of applications) {
    for (const serviceName of application.programs ?? []) {
      if (!programsByServiceName.has(serviceName)) {
        errors.push(`${application.path}: application program ${serviceName} has no program manifest`)
      }
    }
  }

  for (const scenario of scenarios) {
    if (!applicationsById.has(scenario.applicationId)) {
      errors.push(`${scenario.path}: scenario application ${scenario.applicationId} has no application manifest`)
    }
    for (const program of scenario.programs ?? []) {
      if (!programsByServiceName.has(program.serviceName)) {
        errors.push(`${scenario.path}: scenario program ${program.serviceName} has no program manifest`)
      }
    }
  }

  const cloudApplications = applications.filter((application) => application.applicationId === 'movscript.cloud')
  for (const cloudApplication of cloudApplications) {
    for (const serviceName of cloudApplication.programs ?? []) {
      if (pluginStartableServiceNames.has(serviceName)) {
        errors.push(`${cloudApplication.path}: Cloud App must not embed plugin-startable service ${serviceName}`)
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      applications: applications.length,
      programs: programs.length,
      scenarios: scenarios.length,
    },
  }
}

export function buildRuntimeRegistry(rootDir = process.cwd()) {
  const manifests = discoverRuntimeManifests(rootDir)
  return {
    manifests,
    validation: validateRuntimeRegistry(manifests),
  }
}

function findManifestFiles(dir, rootDir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name)
    if (name.isDirectory()) {
      if (isGeneratedDirectory(relative(rootDir, path))) continue
      out.push(...findManifestFiles(path, rootDir))
      continue
    }
    if (name.isFile() && /\.manifest\.ts$/.test(name.name)) out.push(path)
  }
  return out.sort()
}

function readManifestFile(filePath, rootDir) {
  const sourceText = readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const manifests = []
  visit(sourceFile, (node) => {
    if (!ts.isVariableDeclaration(node) || !node.initializer) return
    const initializer = unwrapSatisfies(node.initializer)
    if (!ts.isObjectLiteralExpression(initializer)) return
    const value = objectLiteralToValue(initializer)
    const schema = value?.schema
    if (schema === applicationSchema) {
      manifests.push({
        manifestKind: 'application',
        path: relative(rootDir, filePath),
        exportName: node.name.getText(sourceFile),
        ...value,
      })
    }
    if (schema === programSchema) {
      manifests.push({
        manifestKind: 'program',
        path: relative(rootDir, filePath),
        exportName: node.name.getText(sourceFile),
        ...value,
      })
    }
    if (schema === scenarioSchema) {
      manifests.push({
        manifestKind: 'scenario',
        path: relative(rootDir, filePath),
        exportName: node.name.getText(sourceFile),
        ...value,
      })
    }
  })
  return manifests
}

function visit(node, fn) {
  fn(node)
  ts.forEachChild(node, (child) => visit(child, fn))
}

function unwrapSatisfies(node) {
  if (ts.isSatisfiesExpression?.(node)) return unwrapSatisfies(node.expression)
  if (ts.isAsExpression(node)) return unwrapSatisfies(node.expression)
  return node
}

function objectLiteralToValue(node) {
  const out = {}
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const key = propertyNameText(property.name)
    if (!key) continue
    out[key] = expressionToValue(property.initializer)
  }
  return out
}

function expressionToValue(node) {
  const expression = unwrapSatisfies(node)
  if (ts.isIdentifier(expression)) {
    if (expression.text === 'MOVSCRIPT_APPLICATION_MANIFEST_SCHEMA') return applicationSchema
    if (expression.text === 'MOVSCRIPT_PROGRAM_MANIFEST_SCHEMA') return programSchema
    if (expression.text === 'MOVSCRIPT_SCENARIO_POLICY_SCHEMA') return scenarioSchema
    return undefined
  }
  if (ts.isStringLiteralLike(expression)) return expression.text
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isArrayLiteralExpression(expression)) return expression.elements.map((item) => expressionToValue(item))
  if (ts.isObjectLiteralExpression(expression)) return objectLiteralToValue(expression)
  return undefined
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function printUsage() {
  console.error('Usage: node tools/runtime-registry.mjs [--check] [--json]')
}

async function loadTypeScript() {
  const directPath = resolve('node_modules/typescript/lib/typescript.js')
  if (existsSync(directPath)) return import(pathToFileURL(directPath).href)

  const pnpmDir = resolve('node_modules/.pnpm')
  if (existsSync(pnpmDir)) {
    for (const name of readdirSync(pnpmDir).sort().reverse()) {
      const candidate = join(pnpmDir, name, 'node_modules/typescript/lib/typescript.js')
      if (name.startsWith('typescript@') && existsSync(candidate)) {
        return import(pathToFileURL(candidate).href)
      }
    }
  }

  throw new Error('runtime-registry requires TypeScript. Run pnpm install before using this tool.')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = new Set(process.argv.slice(2))
  if (args.has('--help')) {
    printUsage()
    process.exit(0)
  }
  const result = buildRuntimeRegistry(process.cwd())
  if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const { applications, programs, scenarios } = result.validation.summary
    console.log(`Runtime manifests: ${applications} application(s), ${programs} program(s), ${scenarios} scenario(s)`)
    for (const manifest of result.manifests) {
      const id = manifest.applicationId ?? manifest.serviceName ?? manifest.scenarioId
      console.log(`- ${manifest.manifestKind}: ${id} (${manifest.path})`)
    }
  }
  if (!result.validation.ok) {
    for (const error of result.validation.errors) console.error(`runtime-registry: ${error}`)
    process.exit(1)
  }
}
