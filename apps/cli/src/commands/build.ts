import { existsSync, mkdirSync, writeFileSync, createWriteStream, readFileSync } from 'node:fs'
import { resolve, join, relative, isAbsolute } from 'node:path'
import { build as esbuild } from 'esbuild'
import archiver from 'archiver'
import { loadPluginProjectManifest, type PluginProjectManifest } from '../manifest.js'

interface BuildOptions {
  out: string
  cwd?: string
}

export async function cmdBuild(options: BuildOptions) {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd()
  const outDir = resolve(cwd, options.out)

  // 1. Load and validate provider plugin manifest, falling back to legacy mov.json.
  let manifest: PluginProjectManifest
  try {
    manifest = loadPluginProjectManifest(cwd)
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }

  console.log(`Building ${manifest.id}@${manifest.version}...`)
  mkdirSync(outDir, { recursive: true })

  // 2. Bundle logic entry (src/index.ts or manifest.main). Provider plugins
  // may be skills/MCP-only, so no JS runtime entry is required.
  const mainEntry = resolve(cwd, manifest.main ?? 'src/index.ts')
  if (existsSync(mainEntry)) {
    await esbuild({
      entryPoints: [mainEntry],
      bundle: true,
      format: 'iife',
      globalName: '__movPlugin__',
      platform: 'browser',
      outfile: join(outDir, 'bundle.js'),
      minify: true,
      banner: { js: `/* movscript-plugin: ${manifest.id} */` },
      footer: { js: 'var run = __movPlugin__.run; var compile = __movPlugin__.compile; var agentTools = __movPlugin__.agentTools; var runAgentTool = __movPlugin__.runAgentTool;' },
      external: [],
    })
  } else {
    writeFileSync(join(outDir, 'bundle.js'), `/* ${manifest.id}: no runtime bundle */\n`, 'utf8')
  }

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
  await packMovpkg(outDir, pkgPath, hasUi, cwd, manifest)

  console.log(`Built: ${outDir}/${pkgName}`)
}

function buildOutputManifest(m: PluginProjectManifest, hasUi: boolean) {
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
    ...(m.contributes ? { contributes: m.contributes } : {}),
    ...(m.hasCompile ? { hasCompile: true } : {}),
    manifestFormat: m.manifestFormat,
    ...(m.providerPlugin ? { providerPlugin: m.providerPlugin } : {}),
  }
  return base
}

function packMovpkg(outDir: string, pkgPath: string, hasUi: boolean, cwd: string, manifest: PluginProjectManifest): Promise<void> {
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

    const providerPluginDir = join(cwd, '.provider-plugin')
    if (existsSync(providerPluginDir)) {
      archive.directory(providerPluginDir, '.provider-plugin')
    }

    const upstreamCompatibilityPluginDir = join(cwd, '.codex-plugin')
    if (existsSync(upstreamCompatibilityPluginDir)) {
      archive.directory(upstreamCompatibilityPluginDir, '.codex-plugin')
    }

    const providerMcpConfigPath = resolveProviderPluginMcpConfigPath(cwd, manifest)
    if (providerMcpConfigPath && existsSync(providerMcpConfigPath)) {
      archive.file(providerMcpConfigPath, { name: relative(cwd, providerMcpConfigPath).replace(/\\/g, '/') })
    }

    const providerSkillsDir = resolveProviderPluginSkillsDir(cwd)
    if (providerSkillsDir && existsSync(providerSkillsDir)) {
      archive.directory(providerSkillsDir, 'plugin-skills')
    }

    // Include provider plugin catalog contributions if present.
    for (const dirName of pluginCatalogContributionDirs()) {
      const catalogDir = join(cwd, dirName)
      if (existsSync(catalogDir)) {
        archive.directory(catalogDir, dirName)
      }
    }

    archive.finalize()
  })
}

function pluginCatalogContributionDirs(): string[] {
  return ['plugin-skills', 'plugin-tools', 'plugin-packs', 'plugin-config-files']
}

function resolveProviderPluginMcpConfigPath(cwd: string, manifest: PluginProjectManifest): string | undefined {
  if (manifest.manifestFormat !== 'provider-plugin') return undefined
  const configured = manifest.providerPlugin?.mcpServers?.trim() || './.mcp.json'
  return resolvePluginRelativePath(cwd, configured)
}

function resolveProviderPluginSkillsDir(cwd: string): string | undefined {
  const manifestPath = providerPluginManifestPath(cwd)
  if (!existsSync(manifestPath)) return undefined
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    const configured = typeof raw.skills === 'string' && raw.skills.trim() ? raw.skills.trim() : 'skills'
    return resolvePluginRelativePath(cwd, configured) ?? join(cwd, 'skills')
  } catch {
    return join(cwd, 'skills')
  }
}

function providerPluginManifestPath(cwd: string): string {
  return join(cwd, '.provider-plugin', 'plugin.json')
}

function resolvePluginRelativePath(rootDir: string, value: string): string | undefined {
  if (isAbsolute(value)) return undefined
  const resolved = resolve(rootDir, value.replace(/^\.\//, ''))
  const relativePath = relative(resolve(rootDir), resolved)
  if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) return resolved
  return undefined
}
