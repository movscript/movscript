import { existsSync, mkdirSync, writeFileSync, createWriteStream } from 'node:fs'
import { resolve, join } from 'node:path'
import { build as esbuild } from 'esbuild'
import archiver from 'archiver'
import { loadMovJson, type MovJson } from '../manifest.js'

interface BuildOptions {
  out: string
  cwd?: string
}

export async function cmdBuild(options: BuildOptions) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
  // --out is resolved relative to the caller's cwd, not the plugin directory
  const outDir = resolve(process.cwd(), options.out)

  // 1. Load and validate mov.json
  let manifest: MovJson
  try {
    manifest = loadMovJson(cwd)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }

  console.log(`Building ${manifest.id}@${manifest.version}...`)
  mkdirSync(outDir, { recursive: true })

  // 2. Bundle logic entry (src/index.ts or manifest.main)
  const mainEntry = resolve(cwd, manifest.main ?? 'src/index.ts')
  if (!existsSync(mainEntry)) {
    console.error(`Logic entry not found: ${mainEntry}`)
    process.exit(1)
  }

  await esbuild({
    entryPoints: [mainEntry],
    bundle: true,
    format: 'iife',
    globalName: '__movPlugin__',
    platform: 'browser',
    outfile: join(outDir, 'bundle.js'),
    minify: true,
    banner: { js: `/* movscript-plugin: ${manifest.id} */` },
    footer: { js: 'var run = __movPlugin__.run; var compile = __movPlugin__.compile;' },
    external: [],
  })

  // 3. Bundle UI entry if present
  let hasUi = false
  if (manifest.ui) {
    const uiEntry = resolve(cwd, manifest.ui)
    if (!existsSync(uiEntry)) {
      console.error(`UI entry not found: ${uiEntry}`)
      process.exit(1)
    }
    await esbuild({
      entryPoints: [uiEntry],
      bundle: true,
      format: 'iife',
      platform: 'browser',
      outfile: join(outDir, 'ui.js'),
      minify: true,
      banner: { js: `/* movscript-plugin-ui: ${manifest.id} */` },
      jsx: 'automatic',
    })
    hasUi = true
  }

  // 4. Write manifest.json (strip internal fields, add schema)
  const outputManifest = buildOutputManifest(manifest, hasUi)
  const manifestPath = join(outDir, 'manifest.json')
  writeFileSync(manifestPath, JSON.stringify(outputManifest, null, 2))

  // 5. Pack into .movpkg (zip)
  const pkgName = `${manifest.id}-${manifest.version}.movpkg`
  const pkgPath = join(outDir, pkgName)
  await packMovpkg(outDir, pkgPath, hasUi, cwd)

  console.log(`Built: ${outDir}/${pkgName}`)
}

function buildOutputManifest(m: MovJson, hasUi: boolean) {
  const base = {
    schema: hasUi ? 'movscript.clientPlugin.webview' : 'movscript.clientPlugin.v1',
    id: m.id,
    name: m.name,
    version: m.version,
    ...(m.description ? { description: m.description } : {}),
    ...(m.author ? { author: m.author } : {}),
    ...(m.homepage ? { homepage: m.homepage } : {}),
    ...(m.permissions?.length ? { permissions: m.permissions } : {}),
    ...(m.inputSchema ? { inputSchema: m.inputSchema } : {}),
    ...(m.hasCompile ? { hasCompile: true } : {}),
  }
  return base
}

function packMovpkg(outDir: string, pkgPath: string, hasUi: boolean, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(pkgPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)

    // Always include bundle.js and manifest.json
    archive.file(join(outDir, 'bundle.js'), { name: 'bundle.js' })
    archive.file(join(outDir, 'manifest.json'), { name: 'manifest.json' })

    if (hasUi) {
      archive.file(join(outDir, 'ui.js'), { name: 'ui.js' })
    }

    // Include assets/ if they exist
    const assetsDir = join(cwd, 'assets')
    if (existsSync(assetsDir)) {
      archive.directory(assetsDir, 'assets')
    }

    archive.finalize()
  })
}
