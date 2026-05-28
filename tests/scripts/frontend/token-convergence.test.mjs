import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve('.')

function readProjectFile(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function walkFiles(relativeDir, predicate, files = []) {
  const absoluteDir = path.join(root, relativeDir)
  if (!existsSync(absoluteDir)) return files
  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = path.join(absoluteDir, entry)
    const relativePath = path.relative(root, absolutePath)
    if (statSync(absolutePath).isDirectory()) {
      walkFiles(relativePath, predicate, files)
    } else if (predicate(relativePath)) {
      files.push(relativePath)
    }
  }
  return files
}

function collectMsVariableState(relativeDirs) {
  const refs = new Map()
  const defs = new Map()

  for (const relativeDir of relativeDirs) {
    for (const relativePath of walkFiles(relativeDir, (file) => /\.(css|ts|tsx)$/.test(file))) {
      const source = readProjectFile(relativePath)
      for (const match of source.matchAll(/--ms-[a-z0-9-]+/g)) {
        const name = match[0]
        if (!refs.has(name)) refs.set(name, new Set())
        refs.get(name).add(relativePath)
      }
      for (const match of source.matchAll(/(^|[;{\s])(--ms-[a-z0-9-]+)\s*:/g)) {
        const name = match[2]
        if (!defs.has(name)) defs.set(name, new Set())
        defs.get(name).add(relativePath)
      }
    }
  }

  return { refs, defs }
}

function tokenCssDefinitions(state) {
  return [...state.defs.keys()]
    .filter((name) => [...state.defs.get(name)].some((file) => file.startsWith('packages/tokens/src/')))
    .sort()
}

function uiCssDefinitions(state) {
  return [...state.defs.keys()]
    .filter((name) => [...state.defs.get(name)].some((file) => file.startsWith('packages/ui/src/')))
    .sort()
}

function tokenConsumers(state, tokenName) {
  return [...(state.refs.get(tokenName) ?? [])]
    .filter((file) => !file.startsWith('packages/tokens/src/theme.css'))
    .sort()
}

function undefinedMsVariables(state) {
  return [...state.refs.keys()].filter((name) => !state.defs.has(name)).sort()
}

function countPublicClassConsumers(className) {
  let count = 0
  for (const relativeDir of ['packages/ui/src', 'apps/frontend/src', 'apps/admin/src']) {
    for (const relativePath of walkFiles(relativeDir, (file) => /\.(css|ts|tsx)$/.test(file))) {
      if (relativePath === 'packages/ui/src/base.css' || relativePath === 'packages/ui/src/style-system.ts') {
        continue
      }
      const source = readProjectFile(relativePath)
      const matches = source.match(new RegExp(`\\b${className}\\b`, 'g'))
      count += matches?.length ?? 0
    }
  }
  return count
}

function collectRuntimeSources(relativeDirs) {
  return relativeDirs
    .flatMap((relativeDir) => walkFiles(relativeDir, (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file)))
    .map(readProjectFile)
    .join('\n')
}

const expectedTokenDefinitions = [
  '--ms-duration-fast',
  '--ms-easing-standard',
  '--ms-font-mono',
  '--ms-font-sans',
  '--ms-leading-body',
  '--ms-leading-caption',
  '--ms-leading-item',
  '--ms-leading-label',
  '--ms-leading-section',
  '--ms-leading-tiny',
  '--ms-radius-full',
  '--ms-radius-md',
  '--ms-radius-sm',
  '--ms-space-1',
  '--ms-space-2',
  '--ms-space-3',
  '--ms-space-4',
  '--ms-text-body',
  '--ms-text-caption',
  '--ms-text-item',
  '--ms-text-label',
  '--ms-text-section',
  '--ms-text-tiny',
]

const expectedUiOwnedDefinitions = [
  '--ms-tone-color',
]

test('token package stays converged to shared foundations', () => {
  const tokensCss = readProjectFile('packages/tokens/src/theme.css')
  const themeCss = readProjectFile('packages/theme/src/theme.css')
  const tokensPackageJson = readProjectFile('packages/tokens/package.json')
  const themePublicSources = [
    'packages/theme/src/index.ts',
    'packages/theme/dist/index.d.ts',
    'packages/theme/dist/index.d.mts',
    'packages/theme/dist/index.js',
    'packages/theme/dist/index.mjs',
  ].filter((file) => existsSync(path.join(root, file))).map(readProjectFile).join('\n')
  const uiSemanticSource = readProjectFile('packages/ui/src/semantic.ts')
  const uiSemanticCss = readProjectFile('packages/ui/src/semantic.css')
  const uiBaseCss = readProjectFile('packages/ui/src/base.css')
  const uiPrimitiveCss = walkFiles('packages/ui/src/components/primitives', (file) => file.endsWith('.css')).map(readProjectFile).join('\n')
  const uiStyleSystemSource = readProjectFile('packages/ui/src/style-system.ts')
  const uiPublicSources = [
    'packages/ui/src/style-system.ts',
    'packages/ui/dist/index.d.ts',
    'packages/ui/dist/index.d.mts',
    'packages/ui/dist/index.js',
    'packages/ui/dist/index.mjs',
  ].filter((file) => existsSync(path.join(root, file))).map(readProjectFile).join('\n')
  const uiCss = walkFiles('packages/ui/src', (file) => file.endsWith('.css')).map(readProjectFile).join('\n')
  const uiBusinessCss = walkFiles('packages/ui/src/components/business', (file) => file.endsWith('.css')).map(readProjectFile).join('\n')
  const uiAgentCss = walkFiles('packages/ui/src/components/business/agent', (file) => file.endsWith('.css')).map(readProjectFile).join('\n')
  const uiAppFoundationCss = [
    'packages/ui/src/components/business/app/display',
    'packages/ui/src/components/business/app/surface',
    'packages/ui/src/components/business/app/state',
    'packages/ui/src/components/business/app/dashboard',
  ].flatMap((relativeDir) => walkFiles(relativeDir, (file) => file.endsWith('.css'))).map(readProjectFile).join('\n')
  const uiLayoutCss = walkFiles('packages/ui/src/components/layout', (file) => file.endsWith('.css')).map(readProjectFile).join('\n')
  const uiLayoutAndAppCss = [
    'packages/ui/src/components/layout',
    'packages/ui/src/components/business/app',
  ].flatMap((relativeDir) => walkFiles(relativeDir, (file) => file.endsWith('.css'))).map(readProjectFile).join('\n')
  const appRuntimeSources = collectRuntimeSources([
    'apps/frontend/src',
    'apps/admin/src',
  ])
  const directTokenJsConfigSources = [
    'packages/ui/package.json',
    'packages/ui/tsconfig.json',
    'packages/theme/tsconfig.json',
    'apps/frontend/tsconfig.json',
    'apps/frontend/tailwind.config.js',
    'apps/frontend/electron.vite.config.ts',
    'apps/frontend/vite.e2e.config.ts',
    'apps/admin/tsconfig.json',
    'apps/admin/tailwind.config.js',
    'apps/admin/vite.config.ts',
  ].map(readProjectFile).join('\n')
  const state = collectMsVariableState([
    'packages/tokens/src',
    'packages/theme/src',
    'packages/ui/src',
    'apps/frontend/src',
    'apps/admin/src',
  ])
  const tokenDefs = tokenCssDefinitions(state)
  const uiDefs = uiCssDefinitions(state)
  const zeroConsumerTokens = tokenDefs.filter((name) => tokenConsumers(state, name).length === 0)
  const undefinedConfigVariables = [...new Set([...directTokenJsConfigSources.matchAll(/--ms-[a-z0-9-]+/g)].map((match) => match[0]))]
    .filter((name) => !state.defs.has(name))
    .sort()
  const typeClasses = [...uiBaseCss.matchAll(/^\.(type-[a-z0-9-]+)\s*\{/gm)].map((match) => match[1]).sort()
  const zeroConsumerTypeClasses = typeClasses.filter((className) => countPublicClassConsumers(className) === 0)

  assert.deepEqual(tokenDefs, expectedTokenDefinitions)
  assert.deepEqual(uiDefs, expectedUiOwnedDefinitions)
  assert.deepEqual(zeroConsumerTokens, [], 'token css definitions must have at least one real consumer outside @movscript/tokens')
  assert.deepEqual(undefinedConfigVariables, [], 'config files must not reference removed or undefined --ms variables')
  assert.deepEqual(zeroConsumerTypeClasses, [], 'public type utilities must have at least one real consumer outside their definition/catalog')

  assert.equal(existsSync(path.join(root, 'packages/tokens/src/index.ts')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/tsconfig.json')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.d.ts')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.d.mts')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.js')), false)
  assert.equal(existsSync(path.join(root, 'packages/tokens/dist/index.mjs')), false)
  assert.doesNotMatch(tokensPackageJson, /"\."/)
  assert.doesNotMatch(tokensPackageJson, /"dist"/)
  assert.doesNotMatch(tokensPackageJson, /"build"/)
  assert.doesNotMatch(tokensPackageJson, /"typecheck"/)
  assert.doesNotMatch(tokensPackageJson, /"tsup"/)
  assert.doesNotMatch(tokensPackageJson, /"typescript"/)
  assert.doesNotMatch(tokensCss, /--ms-ref-(?:color|shadow)-/)
  assert.doesNotMatch(themePublicSources, /\bcolorTokens\b/)
  assert.doesNotMatch(themePublicSources, /\b(?:semanticColorTokens|shadowTokens|accentToneTokens|themeTokens|themeCssEntry)\b/)
  assert.doesNotMatch(themePublicSources, /\bMovScript(?:AccentTone|ThemeTokenGroup|ThemeTokens)\b/)
  assert.doesNotMatch(themePublicSources, /--ms-(?:color|shadow|accent)-/)
  assert.doesNotMatch(themePublicSources, /\bzinc\b/)
  assert.doesNotMatch(uiSemanticSource, /"zinc"/)
  assert.doesNotMatch(uiSemanticCss, /--zinc\b/)
  assert.doesNotMatch(uiBaseCss, /\.type-(?:min|micro|body-sm|body-lg|page-title|value|display)\b/)
  assert.doesNotMatch(appRuntimeSources, /\btype-micro\b/)
  assert.doesNotMatch(uiPublicSources, /\bui(?:TypographyScale|ColorRoles|RadiusScale|SpaceScale|IconScale|ControlSizes|ComponentCatalog|StyleSystem)\b/)
  assert.doesNotMatch(uiPublicSources, /\bUi(?:StyleSystem|TypographyName|ColorRole)\b/)
  assert.match(uiStyleSystemSource, /\bexport\s+function\s+defineStatusRecipeGroup\b/)
  assert.doesNotMatch(uiStyleSystemSource, /\buiSemanticSystem\b/)
  assert.match(uiStyleSystemSource, /\bexport\s+default\s+defineStatusRecipeGroup\b/)
  assert.doesNotMatch(appRuntimeSources, /\buiStyleSystem\b/)
  assert.doesNotMatch(uiPublicSources, /\b(?:value|display): \{ className: "type-(?:value|display)"/)
  assert.doesNotMatch(uiPublicSources, /text: "value"/)
  assert.doesNotMatch(appRuntimeSources, /--ms-[a-z0-9-]+/)
  assert.doesNotMatch(
    `${uiCss}\n${appRuntimeSources}`,
    /var\(--(?!ms-|ui-|radix-)[a-z0-9-]+/,
    'runtime CSS variable reads in UI and app sources must use the shared --ui-* namespace unless they are ms/radix variables',
  )
  assert.doesNotMatch(
    `${uiCss}\n${appRuntimeSources}`,
    /(^|[;{\s])--(?!ms-|ui-|radix-)[a-z0-9-]+\s*:/m,
    'runtime CSS variables in UI and app sources must use the shared --ui-* namespace unless they are ms/radix variables',
  )
  assert.doesNotMatch(directTokenJsConfigSources, /["@']@movscript\/tokens["@']\s*:/)
  assert.doesNotMatch(directTokenJsConfigSources, /["@']@movscript\/tokens["@']\s*,?/)
  assert.doesNotMatch(directTokenJsConfigSources, /@movscript\/tokens\/theme\.css/)
  assert.match(readProjectFile('packages/theme/package.json'), /"@movscript\/tokens": "workspace:\*"/)
  assert.match(readProjectFile('packages/theme/src/theme.css'), /@import "@movscript\/tokens\/theme\.css";/)

  assert.doesNotMatch(tokensCss, /--ms-button-(?:xs|sm|md|lg)-/)
  assert.doesNotMatch(tokensCss, /--ms-button-icon-(?:xs|sm|md|lg)-size/)

  assert.doesNotMatch(themeCss, /--ms-color-(?:accent|info)-foreground:/)
  assert.doesNotMatch(themeCss, /--ms-color-focus:/)
  assert.doesNotMatch(themeCss, /--ms-accent-[a-z]+-(?:rgb|gradient-rgb|text):/)
  assert.doesNotMatch(directTokenJsConfigSources, /--ms-color-(?:info|success|warning)-foreground/)

  assert.doesNotMatch(tokensCss, /--ms-space-(?:0|0-5|1-5|2-5|5|6|8|10|12):/)
  assert.doesNotMatch(tokensCss, /--ms-radius-(?:xs|lg):/)
  assert.doesNotMatch(directTokenJsConfigSources, /--ms-radius-xs/)
  assert.doesNotMatch(tokensCss, /--ms-duration-normal:/)
  assert.doesNotMatch(tokensCss, /--ms-icon-(?:2xs|xs|sm|md|lg|xl):/)
  assert.doesNotMatch(tokensCss, /--ms-text-(?:min|micro|body-sm|body-lg|title|title-sm|value|page-title|display):/)
  assert.doesNotMatch(tokensCss, /--ms-leading-(?:min|micro|body-sm|body-lg|title|title-sm|page-title|value|display):/)

  assert.doesNotMatch(uiCss, /--ms-color-(?:card|destructive|ring|sidebar|sidebar-border)\b/)
  assert.doesNotMatch(uiCss, /--ms-color-focus\b/)
  assert.doesNotMatch(uiCss, /--ms-motion-fast\b/)
  assert.doesNotMatch(uiCss, /--ms-control-height-sm\b/)
  assert.doesNotMatch(uiCss, /--ms-leading-(?:micro|tight|relaxed|title|page-title)\b/)
  assert.doesNotMatch(uiCss, /--ms-text-(?:micro|title|page-title)\b/)
  assert.doesNotMatch(uiCss, /--ms-radius-(?:lg|xl)\b/)
  assert.doesNotMatch(uiCss, /--ms-shadow-(?:xl|2xl)\b/)
  assert.doesNotMatch(uiCss, /--shadow-(?:sm|md|lg|xl|2xl)\b/)
  assert.doesNotMatch(uiCss, /--font-mono\b/)
  assert.doesNotMatch(uiCss, /--app-window-titlebar-height\b/)
  assert.doesNotMatch(uiCss, /--ms-icon-(?:2xs|xs|sm|md|lg|xl)\b/)
  assert.doesNotMatch(uiCss, /--ms-space-(?:6|7|8|16)\b/)
  assert.doesNotMatch(uiCss, /calc\(var\(--ms-space-4\) \+ var\(--ms-space-(?:1|2)\)\)/)
  assert.doesNotMatch(uiCss, /calc\(var\(--ms-space-4\) \* 2\)/)
  assert.doesNotMatch(uiCss, /--ms-(?:action-row-gap|agent-bubble-radius|agent-media-thumb-size|canvas-decision-size|canvas-surface-border)\b/)
  assert.doesNotMatch(uiCss, /--ui-surface-radius:\s*6px/)
  assert.doesNotMatch(uiCss, /--ms-button-icon-size\b/)
  assert.doesNotMatch(uiCss, /--ms-inline-badge-radius\b/)
  assert.doesNotMatch(uiCss, /--ms-frame-/)
  assert.doesNotMatch(uiCss, /--ms-agent-line\b/)
  assert.doesNotMatch(uiCss, /--ms-accent-(?:rgb|gradient-rgb|text)\b/)
  assert.doesNotMatch(uiCss, /--ms-tone-text\b/)
  assert.doesNotMatch(uiCss, /--ms-agent-(?:sidebar|context|header|conversation|thread|message|composer)-/)
  assert.doesNotMatch(uiCss, /--ai-agent-panel-width\b/)
  assert.doesNotMatch(uiCss, /--ms-agent-(?:accent|activity-tone-color|assistant|bubble|pill|soft|user|user-foreground|warm|work-rail)\b/)
  assert.doesNotMatch(uiCss, /--ms-control-icon-size\b/)
  assert.doesNotMatch(uiCss, /--ms-text-body-sm\b/)
  assert.doesNotMatch(uiCss, /--ms-key-value-strong-weight\b/)
  assert.doesNotMatch(uiCss, /--ms-(?:key-value|stat-card|empty-state)-/)
  assert.doesNotMatch(uiCss, /--ms-surface-(?:background|border|radius|shadow|tone-color)\b/)
  assert.doesNotMatch(uiCss, /--ms-surface-(?:padding|tone-text)\b/)
  assert.doesNotMatch(uiCss, /--ms-surface-(?:body-padding|header-background|header-padding|heading-gap)\b/)
  assert.doesNotMatch(uiCss, /--ms-app-(?:avatar-(?:size|font-size)|control-group-(?:background|padding|radius)|icon-frame-(?:background|color|radius|size)|marker-dot-(?:background|border|outline-background|size)|media-frame-(?:background|color|radius)|progress-bar-(?:fill|height|track)|range-track-(?:background|height|marker|marker-height|marker-width|selection)|skeleton-(?:background|radius)|surface-item-(?:background|border|padding))\b/)
  assert.doesNotMatch(uiAppFoundationCss, /border-radius:\s*(?:6|7)px/)
  assert.doesNotMatch(uiCss, /--ms-canvas-(?:port-size|surface-(?:background|padding))\b/)
  assert.doesNotMatch(uiCss, /--ms-change-action-color\b/)
  assert.doesNotMatch(uiCss, /--ms-page-shell-(?:body-padding|header-padding-y|padding-x)\b/)
  assert.doesNotMatch(uiCss, /--ms-separator-thickness\b/)
  assert.doesNotMatch(uiCss, /\b(?:120|160)ms ease(?:-[a-z]+)?\b/)
  assert.doesNotMatch(uiCss, /\b(?:120|140|160|180|200|240|300)ms\b/)
  assert.doesNotMatch(uiCss, /\b0\.2s\b/)
  assert.doesNotMatch(uiPrimitiveCss, /\b(?:120|160)ms ease(?:-[a-z]+)?\b/)
  assert.doesNotMatch(uiPrimitiveCss, /border-radius:\s*\d+px/)
  assert.doesNotMatch(uiLayoutCss, /border-radius:\s*\d+px/)
  assert.doesNotMatch(uiPrimitiveCss, /(^|[;{\s])(?:gap|padding-top|margin-top):\s*(?:4|8|12|16)px\b/m)
  assert.doesNotMatch(uiPrimitiveCss, /(^|[;{\s])padding:\s*(?:4|12)px;/m)
  assert.doesNotMatch(uiPrimitiveCss, /(^|[;{\s])margin:\s*4px\s+(?:0|-4px)/m)
  assert.doesNotMatch(uiPrimitiveCss, /(^|[;{\s])(?:right|top):\s*(?:8|16)px\b/m)
  assert.doesNotMatch(uiAppFoundationCss, /(^|[;{\s])(?:gap|padding(?:-(?:top|bottom|left|right))?|margin(?:-(?:top|bottom|left|right))?|scroll-margin-top|inset):\s*(?:4|8|12|16)px\b/m)
  assert.doesNotMatch(uiAppFoundationCss, /(^|[;{\s])padding:\s*(?:4|8|12|16)px(?:\s+(?:4|8|12|16)px)?;/m)
  assert.doesNotMatch(uiLayoutAndAppCss, /(^|[;{\s])(?:gap|padding(?:-(?:top|bottom|left|right))?|margin(?:-(?:top|bottom|left|right))?|scroll-margin-top|inset):\s*(?:4|8|12|16)px\b/m)
  assert.doesNotMatch(uiLayoutAndAppCss, /(^|[;{\s])padding:\s*(?:4|8|12|16)px(?:\s+(?:4|8|12|16)px)?;/m)
  assert.equal([...uiLayoutCss.matchAll(/(^|[;{\s])padding:\s*20px;/gm)].length, 1)
  assert.doesNotMatch(uiCss, /border-radius:\s*8px/)
  assert.doesNotMatch(uiBusinessCss, /\b(?:120|160)ms ease(?:-[a-z]+)?\b/)
  assert.doesNotMatch(uiBusinessCss, /\b(?:120|140|160|180|200|240|300)ms\b/)
  assert.doesNotMatch(uiBusinessCss, /\b0\.2s\b/)
  assert.doesNotMatch(uiBusinessCss, /font-size:\s*9px/)
  assert.doesNotMatch(uiBusinessCss, /line-height:\s*12px/)
  assert.doesNotMatch(uiBusinessCss, /border-radius:\s*999px/)
  assert.doesNotMatch(uiBusinessCss, /border-radius:\s*(?:3|4|6|7|12)px/)
  assert.doesNotMatch(uiAgentCss, /border-radius:\s*(?:6|7|11)px/)
  assert.match(uiCss, /\[data-emphasis="unframed"\]/)
  assert.doesNotMatch(
    uiBusinessCss,
    /--ui-surface-(?:border:\s*transparent|radius:\s*0|background:\s*transparent)/,
    'business package CSS must use the primitive unframed surface recipe instead of redefining unframed surface variables',
  )
  assert.doesNotMatch(
    uiBusinessCss,
    /--ui-surface-radius:\s*\d+px/,
    'business package CSS must bind surface radius to shared radius tokens instead of minting local pixel values',
  )
  assert.doesNotMatch(
    uiBusinessCss,
    /--ui-surface-radius:\s*var\(--ms-radius-md\)/,
    'business package CSS must use the primitive default surface radius instead of restating it locally',
  )
  assert.doesNotMatch(
    uiBusinessCss,
    /--ui-surface-shadow:\s*var\(--ms-shadow-sm\)/,
    'business package CSS must use the primitive raised surface recipe instead of restating its default shadow locally',
  )
  assert.doesNotMatch(
    uiBusinessCss,
    /--ui-surface-border:\s*rgb\(/,
    'business package CSS must derive surface borders from theme tokens instead of hardcoded rgb values',
  )
  assert.equal(
    [...uiAgentCss.matchAll(/--ui-surface-border:\s*color-mix\(in srgb, var\(--ms-color-border\) 78%, transparent\)/g)].length,
    1,
    'agent package CSS must define the shared agent frame border once',
  )

  assert.deepEqual(undefinedMsVariables(state), [])
})
