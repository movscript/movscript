import { readFileSync, existsSync } from 'node:fs'
import { resolve, extname } from 'node:path'

interface InstallOptions {
  registry: string
}

interface GlobalOptions {
  server: string
  token?: string
}

export async function cmdInstall(pkg: string, options: InstallOptions, globals: GlobalOptions) {
  const token = globals.token ?? process.env.MOVCLI_TOKEN
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  // Local .movpkg file
  if (pkg.endsWith('.movpkg') || existsSync(resolve(process.cwd(), pkg))) {
    const pkgPath = resolve(process.cwd(), pkg)
    if (!existsSync(pkgPath)) {
      console.error(`File not found: ${pkgPath}`)
      process.exit(1)
    }
    if (extname(pkgPath) !== '.movpkg') {
      console.error(`Only .movpkg files are supported. Single-file plugin upload is no longer allowed.`)
      console.error(`Run "movcli build" to create a .movpkg from your plugin project.`)
      process.exit(1)
    }
    await installFromFile(pkgPath, globals.server, headers)
    return
  }

  // Registry ID
  await installFromRegistry(pkg, options.registry, globals.server, headers)
}

async function installFromFile(pkgPath: string, server: string, headers: Record<string, string>) {
  const data = readFileSync(pkgPath)
  const formData = new FormData()
  formData.append('package', new Blob([data], { type: 'application/zip' }), pkgPath.split('/').pop())

  const uploadHeaders = { ...headers }
  delete uploadHeaders['Content-Type'] // let fetch set multipart boundary

  const res = await fetch(`${server}/api/v1/plugins/upload`, {
    method: 'POST',
    headers: uploadHeaders,
    body: formData,
  })

  if (!res.ok) {
    console.error(`server returned ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  const result = await res.json() as { id: string; name: string; version: string }
  console.log(`Installed ${result.name} (${result.version})`)
}

async function installFromRegistry(pluginId: string, registry: string, server: string, headers: Record<string, string>) {
  const indexUrl = `${registry}/plugins/index.json`
  const indexRes = await fetch(indexUrl)
  if (!indexRes.ok) throw new Error(`GET ${indexUrl} returned ${indexRes.status}`)
  const index = await indexRes.json() as { plugins: Array<{ id: string; name: string; version: string; package_url: string }> }

  const entry = index.plugins.find(p => p.id === pluginId)
  if (!entry) {
    console.error(`Plugin "${pluginId}" not found in registry`)
    process.exit(1)
  }

  // Download .movpkg from registry
  const pkgRes = await fetch(entry.package_url)
  if (!pkgRes.ok) throw new Error(`GET ${entry.package_url} returned ${pkgRes.status}`)
  const data = await pkgRes.arrayBuffer()

  const formData = new FormData()
  formData.append('package', new Blob([data], { type: 'application/zip' }), `${entry.id}.movpkg`)

  const uploadHeaders = { ...headers }
  delete uploadHeaders['Content-Type']

  const res = await fetch(`${server}/api/v1/plugins/upload`, {
    method: 'POST',
    headers: uploadHeaders,
    body: formData,
  })

  if (!res.ok) {
    console.error(`server returned ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  console.log(`Installed ${entry.name} (${entry.version})`)
}
