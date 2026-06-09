#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA = 'movscript.workspace-config.v2'

export async function setMovScriptLangCwd(input = {}) {
  const workspaceDir = path.resolve(input.workspaceDir ?? process.cwd())
  const cwd = requiredPath(input.cwd ?? process.env.MOVSCRIPT_LANG_CWD, '--cwd')
  const resolvedCwd = path.resolve(workspaceDir, cwd)
  const configPath = path.join(workspaceDir, '.movscript', 'providers', 'default', 'config.json')
  const current = await readJson(configPath).catch(() => ({}))
  const next = {
    ...current,
    schema: MOVSCRIPT_WORKSPACE_CONFIG_SCHEMA,
    updatedAt: new Date().toISOString(),
    movscriptLang: {
      ...(isRecord(current.movscriptLang) ? current.movscriptLang : {}),
      cwd: resolvedCwd,
    },
  }
  await writeJson(configPath, next)
  return { workspaceDir, configPath, cwd: resolvedCwd }
}

export function parseMovScriptLangCwdCliArgs(argv) {
  return {
    cwd: optionValue(argv, '--cwd') ?? optionValue(argv, '--path'),
    workspaceDir: optionValue(argv, '--workspace-dir'),
  }
}

function optionValue(args, name) {
  const equalPrefix = `${name}=`
  const equalValue = args.find((arg) => arg.startsWith(equalPrefix))
  if (equalValue) return equalValue.slice(equalPrefix.length)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

function requiredPath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`movscript-lang cwd requires ${label} <path>`)
  }
  return value.trim()
}

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(content)
  return isRecord(parsed) ? parsed : {}
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function main() {
  const result = await setMovScriptLangCwd(parseMovScriptLangCwdCliArgs(process.argv.slice(2)))
  console.log(`movscript-lang cwd set to ${result.cwd}`)
  console.log(`workspace config: ${result.configPath}`)
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entrypoint && entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
