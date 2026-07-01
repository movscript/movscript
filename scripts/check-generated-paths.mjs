#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

import {
  generatedIgnorePatterns,
  isGeneratedPath,
} from '../tools/generated-paths.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const errors = []

checkGeneratedPathClassification()
checkIgnoreFile('.gitignore', requiredGitIgnorePatterns())
checkIgnoreFile('.dockerignore', requiredDockerIgnorePatterns())
checkPackageScripts()
checkRuntimeRegistryUsesGeneratedPaths()

if (errors.length > 0) {
  for (const error of errors) console.error(`generated-paths: ${error}`)
  process.exit(1)
}

console.log('Generated path contract passed.')

function checkGeneratedPathClassification() {
  const generatedExamples = [
    'apps/desktop/.package-stage/application.manifest.ts',
    'apps/desktop/out/main/index.js',
    'apps/desktop/release/Movscript.dmg',
    'packages/core/dist/index.js',
    'plugins/movscript/release/movscript-agent-plugin.zip',
    'release-artifacts/Movscript.dmg',
    '.movscript-dev/user-data/state.json',
    'timeline_assemblies/project_local-project/assembly.json',
  ]
  const sourceExamples = [
    'scripts/release/release-workflow.mjs',
    'services/data-service/vendor/modules.txt',
    'apps/plugin/startup.manifest.ts',
  ]

  for (const example of generatedExamples) {
    if (!isGeneratedPath(example)) errors.push(`${example} should be classified as generated`)
  }
  for (const example of sourceExamples) {
    if (isGeneratedPath(example)) errors.push(`${example} should not be classified as generated`)
  }
}

function checkIgnoreFile(path, requiredPatterns) {
  const text = readText(path)
  for (const pattern of requiredPatterns) {
    if (!ignoreFileHasPattern(text, pattern)) {
      errors.push(`${path} is missing ignore pattern ${pattern}`)
    }
  }
}

function requiredGitIgnorePatterns() {
  return generatedIgnorePatterns.filter((pattern) => pattern !== 'node_modules/')
}

function requiredDockerIgnorePatterns() {
  return [
    '.git/',
    '.movscript-dev/',
    '.pnpm-store/',
    '.venv/',
    'apps/*/dist/',
    'apps/desktop/.package-stage/',
    'apps/desktop/out/',
    'apps/desktop/release/',
    'downloaded-artifacts/',
    'node_modules/',
    'packages/*/dist/',
    'plugins/*/release/',
    'release-artifacts/',
    'services/*/dist/',
    'surface/*/dist/',
    'timeline_assemblies/',
  ]
}

function checkPackageScripts() {
  const packageJson = JSON.parse(readText('package.json'))
  const requiredScripts = [
    'check:generated-paths',
    'clean',
    'clean:build',
    'clean:cache',
    'clean:dev-state',
    'clean:release',
    'clean:stage',
    'clean:vendor-runtime',
  ]
  for (const script of requiredScripts) {
    if (typeof packageJson.scripts?.[script] !== 'string') {
      errors.push(`package.json is missing scripts.${script}`)
    }
  }
}

function checkRuntimeRegistryUsesGeneratedPaths() {
  const text = readText('tools/runtime-registry.mjs')
  if (!text.includes("from './generated-paths.mjs'")) {
    errors.push('tools/runtime-registry.mjs must import generated path rules')
  }
  if (!text.includes('isGeneratedDirectory')) {
    errors.push('tools/runtime-registry.mjs must skip generated directories')
  }
}

function readText(path) {
  return readFileSync(resolve(repoRoot, path), 'utf8')
}

function ignoreFileHasPattern(text, pattern) {
  const normalizedPattern = normalizeIgnorePattern(pattern)
  return text
    .split(/\r?\n/)
    .map((line) => normalizeIgnorePattern(line.trim()))
    .includes(normalizedPattern)
}

function normalizeIgnorePattern(pattern) {
  return pattern.replace(/^\//, '').replace(/\/+$/, '/')
}
