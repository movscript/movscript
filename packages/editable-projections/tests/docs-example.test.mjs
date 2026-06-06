import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('first adapter companion example runs through public package entrypoints', () => {
  const tempDir = mkdtempSync(resolve(packageRoot, '.tmp-docs-example-'))
  try {
    const sourcePath = resolve(packageRoot, 'docs/first-adapter.example.ts')
    const compiledPath = resolve(tempDir, 'first-adapter.example.mjs')
    const outputText = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        verbatimModuleSyntax: true,
      },
      fileName: sourcePath,
    }).outputText
    writeFileSync(compiledPath, outputText)
    const output = execFileSync('node', [compiledPath], {
      cwd: packageRoot,
      encoding: 'utf8',
    })

    assert.match(output, /first adapter example ok/)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
