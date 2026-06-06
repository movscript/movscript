import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const forbiddenPatterns = [
  {
    label: 'admin browser source importing Node-only MovScript core entry',
    pattern: /(?:from|import)\s*['"]@movscript\/core\/(?:node|[^'"]+\/node)['"]/,
  },
  {
    label: 'admin browser source importing deprecated broad @movscript/core root',
    pattern: /(?:from|import)\s*['"]@movscript\/core['"]/,
  },
  {
    label: 'admin browser source importing Node built-in module',
    pattern: /(?:from|import)\s*['"](?:node:[^'"]+|fs|path|crypto|child_process|http|os)['"]/,
  },
]

const failures = []
for (const entry of listFiles(resolve(adminRoot, 'src'), (file) => /\.(ts|tsx|mts|cts)$/.test(file))) {
  const rel = toPosix(relative(adminRoot, entry))
  if (isTestPath(rel)) continue
  const source = readFileSync(entry, 'utf8')
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) failures.push(`${label}: ${rel}`)
  }
}

if (failures.length > 0) {
  console.error('Admin browser boundary check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Admin browser boundary check passed.')

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

function isTestPath(path) {
  return /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(path)
}

function toPosix(path) {
  return path.split('\\').join('/')
}
