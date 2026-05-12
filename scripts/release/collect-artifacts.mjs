import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../..')
const outputDir = resolve(repoRoot, 'release-artifacts')
const sources = [
  resolve(repoRoot, 'apps/frontend/release'),
  ...(process.env.MOVSCRIPT_COLLECT_PLUGINS === '0' ? [] : [
    resolve(repoRoot, 'plugins/image-generator/dist'),
    resolve(repoRoot, 'plugins/video-generator/dist'),
  ]),
]

const allowedExtensions = new Set([
  '.dmg',
  '.zip',
  '.exe',
  '.msi',
  '.AppImage',
  '.deb',
  '.rpm',
  '.movpkg',
])

rmSync(outputDir, { recursive: true, force: true })
mkdirSync(outputDir, { recursive: true })

const copied = []
for (const source of sources) {
  if (!existsSync(source)) continue
  for (const name of readdirSync(source)) {
    if (!isReleaseAsset(name)) continue
    const from = resolve(source, name)
    if (!statSync(from).isFile()) continue
    const to = resolve(outputDir, basename(name))
    copyFileSync(from, to)
    copied.push(to)
  }
}

if (copied.length === 0) {
  console.error('No release artifacts were collected.')
  process.exit(1)
}

const lines = copied
  .sort()
  .map((path) => `${sha256(path)}  ${basename(path)}`)

writeFileSync(resolve(outputDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8')

console.log(`Collected ${copied.length} release artifact(s) in ${outputDir}`)
for (const path of copied) console.log(`- ${path}`)

function isReleaseAsset(name) {
  if (name.endsWith('.blockmap')) return false
  if ((name.endsWith('.yml') || name.endsWith('.yaml')) && name.startsWith('latest')) return true
  for (const ext of allowedExtensions) {
    if (name.endsWith(ext)) return true
  }
  return false
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
