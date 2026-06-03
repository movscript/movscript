interface ListOptions {
  registry: string
}

export async function cmdList(options: ListOptions) {
  const indexUrl = `${options.registry}/plugins/index.json`
  const res = await fetch(indexUrl)
  if (!res.ok) {
    console.error(`GET ${indexUrl} returned ${res.status}`)
    process.exit(1)
  }

  const index = await res.json() as {
    plugins: Array<{ id: string; name: string; version: string; description?: string }>
  }

  if (!index.plugins.length) {
    console.log('No plugins available in registry.')
    return
  }

  for (const p of index.plugins) {
    const desc = p.description ? `  ${p.description}` : ''
    console.log(`${p.id.padEnd(40)} ${p.version.padEnd(10)}${desc}`)
  }
}
