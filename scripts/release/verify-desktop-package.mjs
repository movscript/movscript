import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const releaseDir = resolve(repoRoot, 'apps/frontend/release')
const backendBinDir = resolve(repoRoot, 'apps/backend/bin')
const agentDir = resolve(repoRoot, 'apps/frontend/movscript-agent')

const requiredPaths = [
  resolve(backendBinDir, process.platform === 'win32' ? 'server.exe' : 'server'),
  resolve(backendBinDir, 'admin/index.html'),
  resolve(agentDir, 'dist/server.js'),
  resolve(agentDir, 'dist/server.bundle.js'),
  resolve(agentDir, 'package.json'),
]

const missing = requiredPaths.filter((path) => !existsSync(path))
if (missing.length > 0) {
  console.error('Desktop package prerequisites are missing:')
  for (const path of missing) console.error(`- ${path}`)
  process.exit(1)
}

if (!existsSync(releaseDir)) {
  console.error(`Electron release directory does not exist: ${releaseDir}`)
  process.exit(1)
}

const artifacts = readdirSync(releaseDir)
  .filter((name) => !name.endsWith('.blockmap') && !name.endsWith('.yml') && !name.endsWith('.yaml'))
  .map((name) => resolve(releaseDir, name))
  .filter((path) => statSync(path).isFile())

if (artifacts.length === 0) {
  console.error(`No distributable artifacts found in ${releaseDir}`)
  process.exit(1)
}

console.log('Desktop package verification passed.')
for (const artifact of artifacts) {
  const { size } = statSync(artifact)
  console.log(`- ${artifact} (${Math.round(size / 1024 / 1024)} MB)`)
}
