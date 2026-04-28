import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

interface InitOptions {
  webview?: boolean
}

export async function cmdInit(name: string | undefined, options: InitOptions) {
  const pluginName = name ?? 'my-plugin'
  const dir = resolve(process.cwd(), pluginName)

  if (existsSync(dir)) {
    console.error(`Directory "${pluginName}" already exists.`)
    process.exit(1)
  }

  const id = `com.example.${pluginName.replace(/[^a-z0-9-]/g, '-').toLowerCase()}`

  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'assets'), { recursive: true })

  // mov.json
  writeFileSync(join(dir, 'mov.json'), JSON.stringify({
    schema: 'movscript.plugin.v1',
    id,
    name: pluginName,
    version: '0.1.0',
    description: 'A MovScript plugin',
    author: '',
    homepage: '',
    permissions: [],
    main: 'src/index.ts',
    ...(options.webview ? { ui: 'src/ui.tsx' } : {}),
    logo: 'assets/logo.png',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {},
    },
  }, null, 2) + '\n')

  // package.json
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: `@movscript/plugin-${pluginName}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'movcli build',
    },
    devDependencies: {
      '@movscript/plugin-sdk': 'latest',
      typescript: '^5.0.0',
      ...(options.webview ? { react: '^18.0.0', '@types/react': '^18.0.0' } : {}),
    },
  }, null, 2) + '\n')

  // tsconfig.json
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      ...(options.webview ? { jsx: 'react-jsx' } : {}),
    },
    include: ['src'],
  }, null, 2) + '\n')

  // src/index.ts
  writeFileSync(join(dir, 'src', 'index.ts'), [
    `import type { MovRuntime, ToolResult } from '@movscript/plugin-sdk'`,
    ``,
    `export async function run(mov: MovRuntime, args: Record<string, unknown>): Promise<ToolResult> {`,
    `  // TODO: implement your plugin logic`,
    `  return {`,
    `    content: [{ type: 'text', text: 'Hello from ${pluginName}!' }],`,
    `  }`,
    `}`,
    ``,
  ].join('\n'))

  // src/ui.tsx (webview only)
  if (options.webview) {
    writeFileSync(join(dir, 'src', 'ui.tsx'), [
      `// Webview entry — runs inside a sandboxed <iframe>`,
      `// window.mov is injected by the host (MovScript platform)`,
      `declare const window: Window & { mov: import('@movscript/plugin-sdk').MovRuntime }`,
      ``,
      `async function main() {`,
      `  const root = document.getElementById('root')!`,
      `  root.innerHTML = '<p>Loading...</p>'`,
      ``,
      `  const models = await window.mov.modelConfigs()`,
      `  root.innerHTML = \`<p>\${models.length} models available</p>\``,
      `}`,
      ``,
      `main()`,
      ``,
    ].join('\n'))
  }

  // assets/logo.png placeholder (1x1 transparent PNG, base64)
  const TRANSPARENT_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )
  writeFileSync(join(dir, 'assets', 'logo.png'), TRANSPARENT_PNG)

  // .gitignore
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n*.movpkg\n')

  console.log(`Created plugin project: ${pluginName}/`)
  console.log(`  mov.json       — manifest`)
  console.log(`  src/index.ts   — logic entry`)
  if (options.webview) console.log(`  src/ui.tsx     — UI entry (webview)`)
  console.log(`  assets/logo.png — plugin icon`)
  console.log(``)
  console.log(`Next steps:`)
  console.log(`  cd ${pluginName}`)
  console.log(`  pnpm install`)
  console.log(`  movcli build`)
}
