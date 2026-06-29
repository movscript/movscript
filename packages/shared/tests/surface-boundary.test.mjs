import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const surfaceRoots = [
  'surface/canvas/src',
  'surface/editing/src',
  'surface/project/src',
  'surface/resource/src',
  'surface/shot-library/src',
]

test('surface packages consume shared contracts instead of host-local type aliases', () => {
  const offenders = []
  for (const file of sourceFiles(surfaceRoots)) {
    const source = readFileSync(file, 'utf8')
    if (/from ['"]@\/types['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/contracts\/surfaceHostApi['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/infrastructure\/surfaceHostApiAccess['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/ui\/toastStore['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/infrastructure\/(?:browserStorage|windowEvents)['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/application\/appEvents['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/contracts\/workspaceArtifact['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/application\/modelQueryKeys['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/domain\/(?:mediaTypes|modelDisplay)['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/ui\/objectUrl['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/ui\/resource(?:Blob|Download|Text|Url|MediaCache)['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/ui\/(?:UrlMedia|ResourceFileImage|ResourceFileVideo|ResourceFileAudio|ResourceImage|ResourceVideo|ResourceAudio|MediaViewer)['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/ui\/(?:ModelSelector|GenerationParamControls|ResourceLibraryPicker|ResourceLibraryPickerUi|ResourceCandidateAttachPanel)['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/ui\/(?:resourceFileUrl|resourceMediaDiagnostics)['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/ui\/VideoProbe['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/infrastructure\/workspaceDomainRepository['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/shared\/infrastructure\/session\/workspaceOwnerContext['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/routes(?:\/[^'"]*)?['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/features\/jobs(?:\/[^'"]*)?['"]/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\/features\/(?:agent|plugins)(?:\/[^'"]*)?['"]/.test(source)) offenders.push(relative(file))
  }

  assert.deepEqual(offenders, [])
})

test('canvas surface declares the shared contract package it imports', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/canvas/package.json'), 'utf8'))
  assert.equal(packageJson.dependencies?.['@movscript/shared'], 'workspace:*')
})

test('canvas surface does not own local host compatibility shims', () => {
  assert.equal(existsSync(resolve(repoRoot, 'surface/canvas/src/host')), false)

  const localViteConfig = readFileSync(resolve(repoRoot, 'services/local-surface-host/vite.config.ts'), 'utf8')
  const localTsConfig = readFileSync(resolve(repoRoot, 'services/local-surface-host/tsconfig.json'), 'utf8')
  for (const source of [localViteConfig, localTsConfig]) {
    assert.doesNotMatch(source, /surface\/canvas\/src\/host/)
    assert.doesNotMatch(source, /@\/features\/app-shell/)
  }
})

test('host route layouts consume surface layout contracts from public entrypoints', () => {
  const canvasPackageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/canvas/package.json'), 'utf8'))
  const projectPackageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/project/package.json'), 'utf8'))
  const canvasTsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/canvas/tsconfig.json'), 'utf8'))
  const projectTsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/project/tsconfig.json'), 'utf8'))
  const checkedFiles = [
    'apps/desktop/src/routes/routeLayoutPanes.ts',
    'services/local-surface-host/src/main.tsx',
    'surface/project/src/pages/index.ts',
  ]
  const deepEntrypointPattern = /@movscript\/(?:project|canvas)-surface\/features\/(?:content\/presentation\/contentCanvasLayoutSpec|presentation\/canvasWorkspaceLayoutSpec|content\/components\/ContentCanvasWorkspacePage)/
  const offenders = checkedFiles
    .filter((file) => deepEntrypointPattern.test(readFileSync(resolve(repoRoot, file), 'utf8')))

  assert.deepEqual(offenders, [])
  assert.equal(canvasPackageJson.exports?.['./layout'], './src/layout.ts')
  assert.ok(projectPackageJson.exports?.['./layout'])
  assert.ok(canvasTsconfig.compilerOptions?.paths?.['@movscript/canvas-surface/layout'])
  assert.ok(projectTsconfig.compilerOptions?.paths?.['@movscript/project-surface/layout'])

  const routeLayoutPanesSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/routes/routeLayoutPanes.ts'), 'utf8')
  assert.match(routeLayoutPanesSource, /@movscript\/canvas-surface\/layout/)
  assert.match(routeLayoutPanesSource, /@movscript\/project-surface\/layout/)
  assert.doesNotMatch(routeLayoutPanesSource, /from ['"]@movscript\/(?:canvas|project)-surface['"]/)

  assert.equal(existsSync(resolve(repoRoot, 'services/local-surface-host/src/routes/routeLayoutRegistry.ts')), false)
  assert.equal(existsSync(resolve(repoRoot, 'services/local-surface-host/src/routes/routeLayoutPanes.ts')), false)
})

test('desktop and local hosts consume shared surface route layout contracts from packages', () => {
  const desktopAppRouteModel = readFileSync(resolve(repoRoot, 'apps/desktop/src/routes/appRouteModel.ts'), 'utf8')
  const localRouteSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/LocalSurfaceHostRoutes.tsx'), 'utf8')
  const localRouteFrameSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/localSurfaceRouteFrame.ts'), 'utf8')
  const localChromeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/shell/LocalSurfaceAppChrome.tsx'), 'utf8')
  const localHomeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/home/LocalSurfaceHostHome.tsx'), 'utf8')
  const localStylesSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/styles.css'), 'utf8')
  const uiAppShellIndexSource = readFileSync(resolve(repoRoot, 'packages/ui/src/components/layout/app-shell/index.tsx'), 'utf8')
  const uiAppShellStylesSource = readFileSync(resolve(repoRoot, 'packages/ui/src/components/layout/app-shell/styles.css'), 'utf8')
  const uiBusinessAppShellSource = readFileSync(resolve(repoRoot, 'packages/ui/src/components/business/app/shell/index.tsx'), 'utf8')
  const uiBusinessAppShellStylesSource = readFileSync(resolve(repoRoot, 'packages/ui/src/components/business/app/shell/styles.css'), 'utf8')

  assert.match(desktopAppRouteModel, /from '@movscript\/shared'/)
  assert.match(desktopAppRouteModel, /sharedSurfaceRouteForPathname\(pathname, \{ host: 'desktop' \}\)/)
  assert.doesNotMatch(desktopAppRouteModel, /services\/local-surface-host/)

  assert.match(localRouteSource, /from '@movscript\/shared'/)
  assert.match(localRouteSource, /from '@movscript\/ui\/business\/app'/)
  assert.match(localRouteSource, /sharedSurfaceRouteForPathname\(location\.pathname, \{ host: 'local-web' \}\)/)
  assert.match(localRouteSource, /from '\.\/localSurfaceRouteFrame\.js'/)
  assert.match(localRouteSource, /path=\{ROUTES\.canvasEditor\}[\s\S]*<LocalSurfaceRouteFrame>[\s\S]*<CanvasEditorPage \/>[\s\S]*<\/LocalSurfaceRouteFrame>/)
  assert.match(localRouteSource, /localSurfaceRouteFrameOptions\(sharedRoute\)/)
  assert.match(localRouteSource, /LocalSurfaceRouteErrorBoundary/)
  assert.match(localRouteSource, /AppErrorFallback/)
  assert.doesNotMatch(localRouteSource, /element=\{<CanvasEditorPage \/>\}/)
  assert.doesNotMatch(localRouteSource, /\sframe(?:=|\?:)/)
  assert.doesNotMatch(localRouteSource, /localSurfaceRouteFrameContentOptions\(/)
  assert.doesNotMatch(localRouteSource, /type LocalSurfaceRouteFrameVariant =/)
  assert.doesNotMatch(localRouteSource, /AppContentLayoutWidth/)
  assert.doesNotMatch(localRouteSource, /from ['"]@\/features\/app-shell/)
  assert.doesNotMatch(localRouteSource, /apps\/desktop/)
  assert.match(localRouteFrameSource, /SharedSurfaceRouteDefinition/)
  assert.match(localRouteFrameSource, /SharedSurfaceContentWidth/)
  assert.match(localRouteFrameSource, /localSurfaceRouteFrameOptions/)
  assert.match(localRouteFrameSource, /localSurfaceRouteFrameVariant/)
  assert.match(localRouteFrameSource, /localSurfaceRouteFrameContentOptions/)
  assert.match(localRouteFrameSource, /sharedRoute\.shellLayout === 'flush'/)
  assert.match(localRouteFrameSource, /sharedRoute\.contentWidth === 'narrow'/)
  assert.match(localRouteFrameSource, /sharedRoute\.area === 'tool' \|\| sharedRoute\.area === 'agent'/)
  assert.match(localRouteFrameSource, /localSurfaceRouteContentWidth\(sharedRoute\?\.contentWidth, variant\)/)

  assert.match(localChromeSource, /sharedSurfacePrimaryNavItems/)
  assert.match(localChromeSource, /sharedSurfacePrimaryNavKeyForPathname\(pathname, \{ host: 'local-web' \}\)/)
  assert.match(localChromeSource, /Record<SharedSurfacePrimaryNavKey, string>/)
  assert.match(localChromeSource, /AppPrimaryNav/)
  assert.match(localChromeSource, /AppPrimaryNavItem/)
  assert.match(localChromeSource, /AppHostChrome/)
  assert.match(localChromeSource, /AppHostChromeTopbar/)
  assert.match(localChromeSource, /AppHostChromeActionLabel/)
  assert.match(localChromeSource, /Button, StatusDot/)
  assert.match(localHomeSource, /AppSidebarShell/)
  assert.match(localHomeSource, /AppSidebarNavItemFrame/)
  assert.match(uiAppShellIndexSource, /export \* from "\.\/primary-nav"/)
  assert.match(uiAppShellStylesSource, /@import "\.\/primary-nav\/styles\.css"/)
  assert.match(uiBusinessAppShellSource, /export function AppHostChrome/)
  assert.match(uiBusinessAppShellSource, /export function AppHostChromeTopbar/)
  assert.match(uiBusinessAppShellSource, /export const AppHostChromeBrand/)
  assert.match(uiBusinessAppShellStylesSource, /\.app-host-chrome__topbar/)
  assert.match(uiBusinessAppShellStylesSource, /\.app-host-chrome-status/)
  assert.doesNotMatch(localChromeSource, /localSurfaceHost\.tabs\.app/)
  assert.doesNotMatch(localChromeSource, /local-surface-(?:shell|topbar|workspace|header-status|preferences|action-label|shell__main)/)
  assert.doesNotMatch(localChromeSource, /local-surface-primary-tab/)
  assert.doesNotMatch(localChromeSource, /local-surface-(?:admin-button|preference-button)/)
  assert.doesNotMatch(localHomeSource, /surface-host-tool-sidebar__entry-frame/)
  assert.doesNotMatch(localStylesSource, /local-surface-(?:shell|topbar|workspace|header-status|preferences|action-label|shell__main)/)
  assert.doesNotMatch(localStylesSource, /local-surface-primary-tab/)
  assert.doesNotMatch(localStylesSource, /local-surface-(?:sidebar|tabs|tab|admin-button|preference-button|header-label|topbar__title)/)
  assert.doesNotMatch(localStylesSource, /surface-host-tool-sidebar__entry-frame/)
})

test('host route tables consume surface route contracts from public route entrypoints', () => {
  const projectPackageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/project/package.json'), 'utf8'))
  const resourcePackageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/resource/package.json'), 'utf8'))
  const projectTsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/project/tsconfig.json'), 'utf8'))
  const resourceTsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/resource/tsconfig.json'), 'utf8'))

  assert.ok(projectPackageJson.exports?.['./routes'])
  assert.ok(resourcePackageJson.exports?.['./routes'])
  assert.ok(projectTsconfig.compilerOptions?.paths?.['@movscript/project-surface/routes'])
  assert.ok(resourceTsconfig.compilerOptions?.paths?.['@movscript/resource-surface/routes'])

  for (const file of [
    'apps/desktop/src/routes/projectRoutes.ts',
    'services/local-surface-host/src/routes/projectRoutes.ts',
    'services/local-surface-host/src/routes/localRouteLinks.ts',
    'services/local-surface-host/src/project/localProjectSurfaceRuntime.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /from ['"]@movscript\/(?:project|resource)-surface['"]/, `${file} should not import route constants from a surface root entrypoint`)
  }

  const desktopRoutesSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/routes/projectRoutes.ts'), 'utf8')
  const localRoutesSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/projectRoutes.ts'), 'utf8')
  assert.match(desktopRoutesSource, /@movscript\/project-surface\/routes/)
  assert.match(desktopRoutesSource, /@movscript\/resource-surface\/routes/)
  assert.match(localRoutesSource, /@movscript\/project-surface\/routes/)
  assert.match(localRoutesSource, /@movscript\/resource-surface\/routes/)
})

test('surface route links use the host-neutral surface route facade', () => {
  const checkedFiles = [
    'surface/project/src/features/project/components/ProjectsPage.tsx',
    'surface/project/src/features/project/components/ProjectOverviewCards.tsx',
    'surface/project/src/features/project/domain/projectEntryRegistry.tsx',
    'surface/project/src/features/scripts/components/ScriptsPage.tsx',
    'surface/project/src/features/project-standards/application/useProjectStandardsController.ts',
    'surface/project/src/features/content/components/useContentCanvasWorkspaceSession.ts',
    'surface/project/src/features/content/components/useContentCanvasWorkspaceController.ts',
    'surface/project/src/features/project-standards/components/workspaces/ProjectStandardsWorkspaceReviewPanel.tsx',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /surfaceRoutePath|projectEntryRoutePath/, `${file} should use shared semantic surface routes`)
    assert.doesNotMatch(source, /@\/routes\/projectRoutes/, `${file} should not import host route tables`)
  }

  const desktopAdapterSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/shared/infrastructure/api/routes.ts'), 'utf8')
  const localAdapterSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/host-runtime/infrastructure/api/routes.ts'), 'utf8')
  assert.match(desktopAdapterSource, /configureSurfaceRouteClient/)
  assert.match(localAdapterSource, /configureSurfaceRouteClient/)
})

test('project entry definitions keep semantic route keys instead of static host paths', () => {
  const source = readFileSync(resolve(repoRoot, 'surface/project/src/features/project/domain/projectEntryRegistry.tsx'), 'utf8')

  assert.match(source, /routeKey: SurfaceRouteKey/)
  assert.doesNotMatch(source, /\broute:\s*surfaceRoutePath/)
  assert.doesNotMatch(source, /\broute:\s*['"]\/(?:project|studio)\//)
})

test('project surface typecheck covers feature and page source', () => {
  const tsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/project/tsconfig.json'), 'utf8'))
  const excluded = tsconfig.exclude ?? []
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/project/package.json'), 'utf8'))

  assert.ok(tsconfig.include?.includes('src/**/*.ts'))
  assert.ok(tsconfig.include?.includes('src/**/*.tsx'))
  assert.equal(excluded.includes('src/features'), false)
  assert.equal(excluded.includes('src/pages'), false)
  assert.ok(packageJson.exports?.['./data'])
  assert.ok(packageJson.exports?.['./routes'])
  assert.ok(packageJson.exports?.['./layout'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/project-surface/data'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/project-surface/routes'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/project-surface/layout'])
})

test('resource surface typecheck covers feature and page source', () => {
  const tsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/resource/tsconfig.json'), 'utf8'))
  const excluded = tsconfig.exclude ?? []
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/resource/package.json'), 'utf8'))

  assert.ok(tsconfig.include?.includes('src/**/*.ts'))
  assert.ok(tsconfig.include?.includes('src/**/*.tsx'))
  assert.equal(excluded.includes('src/features'), false)
  assert.equal(excluded.includes('src/pages'), false)
  assert.equal(tsconfig.compilerOptions?.rootDir, undefined)
  assert.ok(packageJson.exports?.['./data'])
  assert.ok(packageJson.exports?.['./routes'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/resource-surface/pages'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/resource-surface/data'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/resource-surface/routes'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/shared/app-events'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/shared/workspace-candidates'])
})

test('canvas surface exposes data, shell, workbench, and page entrypoints', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/canvas/package.json'), 'utf8'))
  const tsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/canvas/tsconfig.json'), 'utf8'))
  const pagesSource = readFileSync(resolve(repoRoot, 'surface/canvas/src/pages/index.ts'), 'utf8')

  assert.equal(packageJson.exports?.['./data'], './src/data.ts')
  assert.equal(packageJson.exports?.['./layout'], './src/layout.ts')
  assert.equal(packageJson.exports?.['./shell'], './src/shell.ts')
  assert.equal(packageJson.exports?.['./workbench'], './src/workbench.ts')
  assert.match(pagesSource, /CanvasListView/)
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/canvas-surface/data'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/canvas-surface/layout'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/canvas-surface/shell'])
  assert.ok(tsconfig.compilerOptions?.paths?.['@movscript/canvas-surface/workbench'])
})

test('shared surface packages own package-level typecheck scripts', () => {
  for (const packageDir of ['surface/project', 'surface/canvas', 'surface/resource', 'surface/shot-library', 'surface/editing']) {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, packageDir, 'package.json'), 'utf8'))
    assert.equal(packageJson.scripts?.typecheck, 'tsc --noEmit', `${packageDir} should typecheck its source package`)
    assert.equal(existsSync(resolve(repoRoot, packageDir, 'tsconfig.json')), true, `${packageDir} should declare typecheck tsconfig`)
  }
})

test('hosts do not expose surface feature internals through aliases or source imports', () => {
  const hostFiles = [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
    'services/local-surface-host/tsconfig.json',
    'services/local-surface-host/vite.config.ts',
    ...sourceFiles(['apps/desktop/src', 'services/local-surface-host/src']).map(relative),
  ]

  for (const file of hostFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /@movscript\/(?:project|canvas|resource|editing|shot-library)-surface\/features/, `${file} should use public surface entrypoints`)
  }
})

test('host source consumes business surfaces through explicit public subentrypoints', () => {
  for (const file of sourceFiles(['apps/desktop/src', 'services/local-surface-host/src']).map(relative)) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(
      source,
      /from ['"]@movscript\/(?:project|canvas|resource|editing|shot-library)-surface['"]/,
      `${file} should not import a business surface root barrel`,
    )
    assert.doesNotMatch(
      source,
      /import\(['"]@movscript\/(?:project|canvas|resource|editing|shot-library)-surface['"]\)/,
      `${file} should not lazy-load a business surface root barrel`,
    )
  }
})

test('local surface host does not keep desktop-style app aliases', () => {
  const checkedFiles = [
    'services/local-surface-host/tsconfig.json',
    'services/local-surface-host/vite.config.ts',
    ...sourceFiles(['services/local-surface-host/src']).map(relative),
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /['"]@\/(?:shared|routes|features|types|i18n)(?:\/[^'"]*)?['"]/, `${file} should use relative host imports or public packages`)
  }
})

test('local surface host does not keep unused desktop compatibility source', () => {
  for (const file of [
    'services/local-surface-host/src/routes/appRouteModel.ts',
    'services/local-surface-host/src/editing/appRouteModel.ts',
    'services/local-surface-host/src/host-runtime/application/modelQueryKeys.ts',
    'services/local-surface-host/src/host-runtime/contracts/surfaceHostApi.ts',
    'services/local-surface-host/src/host-runtime/domain/mediaTypes.ts',
    'services/local-surface-host/src/host-runtime/domain/modelDisplay.ts',
    'services/local-surface-host/src/host-runtime/infrastructure/api/scriptVersions.ts',
    'services/local-surface-host/src/host-runtime/infrastructure/browserStorage.ts',
    'services/local-surface-host/src/host-runtime/infrastructure/desktopStateStorage.ts',
    'services/local-surface-host/src/host-runtime/infrastructure/session/workspaceOwnerContext.ts',
    'services/local-surface-host/src/host-runtime/infrastructure/windowEvents.ts',
    'services/local-surface-host/src/host-runtime/presentation/semanticRecipe.ts',
  ]) {
    assert.equal(existsSync(resolve(repoRoot, file)), false, `${file} should not remain as unused local host compatibility source`)
  }

  assert.equal(existsSync(resolve(repoRoot, 'services/local-surface-host/src/host-runtime/ui')), false)
})

test('surface packages use relative imports for their own feature internals', () => {
  for (const packageName of ['project', 'canvas', 'resource', 'editing', 'shot-library']) {
    for (const file of sourceFiles([`surface/${packageName}/src`])) {
      const source = readFileSync(file, 'utf8')
      assert.doesNotMatch(source, new RegExp(`@movscript/${packageName}-surface/features`), `${relative(file)} should use relative imports for package internals`)
    }
  }
})

test('surface packages do not publish feature internals as package subpaths', () => {
  for (const packageName of ['project', 'canvas', 'resource', 'editing', 'shot-library']) {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, `surface/${packageName}/package.json`), 'utf8'))
    const tsconfig = JSON.parse(readFileSync(resolve(repoRoot, `surface/${packageName}/tsconfig.json`), 'utf8'))
    const paths = tsconfig.compilerOptions?.paths ?? {}

    assert.equal(packageJson.exports?.['./features/*'], undefined, `surface/${packageName} should not export feature internals`)
    for (const alias of Object.keys(paths)) {
      assert.doesNotMatch(alias, /@movscript\/(?:project|canvas|resource|editing|shot-library)-surface\/features/, `surface/${packageName} should not resolve feature internals by package subpath`)
    }
  }
})

test('foundation packages do not depend on surface packages', () => {
  for (const packageDir of ['packages/core', 'packages/resources']) {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, packageDir, 'package.json'), 'utf8'))
    const tsconfig = JSON.parse(readFileSync(resolve(repoRoot, packageDir, 'tsconfig.json'), 'utf8'))
    const dependencyNames = Object.keys({
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.peerDependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
    })
    assert.deepEqual(dependencyNames.filter((name) => /@movscript\/.+-surface$/.test(name)), [], `${packageDir} should not depend on surface packages`)

    for (const alias of Object.keys(tsconfig.compilerOptions?.paths ?? {})) {
      assert.doesNotMatch(alias, /@movscript\/(?:project|canvas|resource|editing|shot-library|admin)-surface/, `${packageDir} should not resolve surface packages`)
    }

    for (const file of sourceFiles([`${packageDir}/src`])) {
      const source = readFileSync(file, 'utf8')
      assert.doesNotMatch(source, /@movscript\/(?:project|canvas|resource|editing|shot-library|admin)-surface/, `${relative(file)} should not import surface packages`)
    }
  }
})

test('shot library surface exposes pages and data without legacy app aliases', () => {
  const offenders = []
  for (const file of sourceFiles(['surface/shot-library/src'])) {
    const source = readFileSync(file, 'utf8')
    if (/@\/features\/shot-library/.test(source)) offenders.push(relative(file))
    if (/from ['"]@\//.test(source)) offenders.push(relative(file))
  }
  assert.deepEqual(offenders, [])

  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/shot-library/package.json'), 'utf8'))
  assert.equal(packageJson.exports?.['./data'], './src/data.ts')
  assert.equal(packageJson.exports?.['./pages'], './src/pages/index.ts')

  const tsconfig = JSON.parse(readFileSync(resolve(repoRoot, 'surface/shot-library/tsconfig.json'), 'utf8'))
  assert.equal(tsconfig.compilerOptions?.paths?.['@/*'], undefined)
  assert.deepEqual(tsconfig.compilerOptions?.paths?.['@movscript/shot-library-surface/data'], ['./src/data.ts'])

  const desktopPackageJson = JSON.parse(readFileSync(resolve(repoRoot, 'apps/desktop/package.json'), 'utf8'))
  assert.equal(desktopPackageJson.dependencies?.['@movscript/shot-library-surface'], 'workspace:*')

  for (const file of [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
    'apps/desktop/src/features/app-shell/application/appRouteComponents.tsx',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /@\/(?:features|pages)\/shot-library/, `${file} should use shot-library surface package entrypoints`)
  }
})

test('desktop shot library consumers use public shot library surface entrypoints', () => {
  const dataSource = readFileSync(resolve(repoRoot, 'surface/shot-library/src/data.ts'), 'utf8')
  assert.match(dataSource, /shotLibraryMutationInvalidation/)
  assert.match(dataSource, /shotLibraryQueryKeys/)

  for (const file of [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shot-library-surface\/data/, `${file} should resolve the shot library data facade`)
    assert.doesNotMatch(source, /@movscript\/shot-library-surface\/features/, `${file} should not expose shot library internals to desktop`)
  }

  for (const file of [
    'apps/desktop/src/shared/application/appMutationEventPublishing.test.ts',
    'apps/desktop/src/shared/application/appEventQueryInvalidation.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shot-library-surface\/data/, `${file} should consume the public shot library data facade`)
    assert.doesNotMatch(source, /@movscript\/shot-library-surface\/features\/application\/shotLibraryMutationInvalidation/, `${file} should not deep-import shot library data internals`)
  }
})

test('editing surface public source entrypoints are available to desktop and local hosts', () => {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'surface/editing/package.json'), 'utf8'))
  assert.equal(packageJson.exports?.['./surface-routes'], './src/surface-routes.tsx')
  assert.equal(packageJson.exports?.['./service-host-api'], './src/service-host-api.ts')
  assert.equal(packageJson.exports?.['./host-api'], './src/host-api.ts')
  assert.equal(packageJson.exports?.['./pages/*'], './src/pages/*')

  for (const file of [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
    'services/local-surface-host/tsconfig.json',
    'services/local-surface-host/vite.config.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/editing-surface\/surface-routes/, `${file} should resolve the editing surface route entrypoint`)
  }

  for (const file of sourceFiles(['apps/desktop/src', 'services/local-surface-host/src']).map(relative)) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /from ['"]@movscript\/editing-surface['"]/, `${file} should not import the editing surface root entrypoint`)
    assert.doesNotMatch(source, /import\(['"]@movscript\/editing-surface['"]\)/, `${file} should not lazy-load the editing surface root entrypoint`)
  }

  const appRouteComponents = readFileSync(resolve(repoRoot, 'apps/desktop/src/features/app-shell/application/appRouteComponents.tsx'), 'utf8')
  assert.match(appRouteComponents, /@movscript\/editing-surface\/pages\/EditingListPage/)
  assert.match(appRouteComponents, /@movscript\/editing-surface\/pages\/EditingWorkspacePage/)
  assert.match(appRouteComponents, /@movscript\/editing-surface\/surface-routes/)
})

test('local surface host keeps editing runtime adapter outside the app entrypoint', () => {
  const mainSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/main.tsx'), 'utf8')
  const routeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/LocalSurfaceHostRoutes.tsx'), 'utf8')
  const editingAdapterSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/editing/localEditingApi.ts'), 'utf8')

  assert.doesNotMatch(mainSource, /localEditingApi/)
  assert.match(routeSource, /from '\.\.\/editing\/localEditingApi\.js'/)
  assert.doesNotMatch(mainSource, /createLocalEditingMediaAPI/)
  assert.doesNotMatch(mainSource, /mergeLocalSurfaceHostAPI/)
  assert.match(editingAdapterSource, /createLocalEditingMediaAPI/)
  assert.match(editingAdapterSource, /mergeLocalSurfaceHostAPI/)
})

test('local surface host keeps project surface route adapter outside the app entrypoint', () => {
  const mainSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/main.tsx'), 'utf8')
  const routeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/LocalSurfaceHostRoutes.tsx'), 'utf8')
  const projectRouteSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/project/LocalProjectSurfaceHostRoute.tsx'), 'utf8')

  assert.doesNotMatch(mainSource, /LocalProjectSurfaceHostRoute/)
  assert.match(routeSource, /from '\.\.\/project\/LocalProjectSurfaceHostRoute\.js'/)
  assert.doesNotMatch(mainSource, /createLocalHostProjectSurfaceRuntime/)
  assert.doesNotMatch(mainSource, /ProjectSurfaceProvider/)
  assert.doesNotMatch(mainSource, /useProjectReadModel/)
  assert.match(projectRouteSource, /createLocalHostProjectSurfaceRuntime/)
  assert.match(projectRouteSource, /ProjectSurfaceProvider/)
  assert.match(projectRouteSource, /ensureLocalProjectContentAPI/)
})

test('desktop and local project surface runtimes use the shared hosted runtime factory', () => {
  const hostedRuntimeSource = readFileSync(resolve(repoRoot, 'surface/project/src/runtime/HostedProjectSurfaceRuntime.ts'), 'utf8')
  const runtimeEntrypointSource = readFileSync(resolve(repoRoot, 'surface/project/src/runtime/index.ts'), 'utf8')
  const desktopRuntimeSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx'), 'utf8')
  const localRuntimeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/project/localProjectSurfaceRuntime.ts'), 'utf8')

  assert.match(hostedRuntimeSource, /createHostedProjectSurfaceRuntime/)
  assert.match(hostedRuntimeSource, /projectSurfaceContextCommandEnvelope/)
  assert.match(hostedRuntimeSource, /unwrapProjectSurfaceGatewayResult/)
  assert.match(runtimeEntrypointSource, /from '\.\/HostedProjectSurfaceRuntime\.js'/)

  for (const [file, source] of [
    ['desktopProjectSurfaceRuntime.tsx', desktopRuntimeSource],
    ['localProjectSurfaceRuntime.ts', localRuntimeSource],
  ]) {
    assert.match(source, /createHostedProjectSurfaceRuntime/, `${file} should use the shared hosted runtime factory`)
    assert.match(source, /projectSurfaceContextCommandEnvelope/, `${file} should use the shared context command envelope`)
    assert.match(source, /unwrapProjectSurfaceGatewayResult/, `${file} should unwrap gateway results through the shared helper`)
    assert.doesNotMatch(source, /createProjectSurfaceRuntime/, `${file} should not assemble the base runtime directly`)
    assert.doesNotMatch(source, /(?:desktop|local)ContextCommandEnvelope/, `${file} should not keep a host-local context envelope helper`)
  }
})

test('local surface host keeps home page UI outside the app entrypoint', () => {
  const mainSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/main.tsx'), 'utf8')
  const routeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/LocalSurfaceHostRoutes.tsx'), 'utf8')
  const homeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/home/LocalSurfaceHostHome.tsx'), 'utf8')

  assert.doesNotMatch(mainSource, /LocalSurfaceHostHome/)
  assert.match(routeSource, /from '\.\.\/home\/LocalSurfaceHostHome\.js'/)
  assert.doesNotMatch(mainSource, /surface-host-card-grid/)
  assert.doesNotMatch(mainSource, /HomeLaunchCard/)
  assert.doesNotMatch(mainSource, /RouteCatalog/)
  assert.match(homeSource, /HomeLaunchCard/)
  assert.match(homeSource, /RouteCatalog/)
})

test('local surface host app entrypoint only mounts the app shell', () => {
  const mainSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/main.tsx'), 'utf8')
  const appSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/app/LocalSurfaceHostApp.tsx'), 'utf8')
  const routeSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/LocalSurfaceHostRoutes.tsx'), 'utf8')
  const adminSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/admin/LocalAdminSurfaceRoute.tsx'), 'utf8')

  assert.match(mainSource, /from '\.\/app\/LocalSurfaceHostApp\.js'/)
  assert.doesNotMatch(mainSource, /BrowserRouter|QueryClient|<Route|AdminSurfaceApp|CanvasEditorPage|ProjectPickerSurface/)
  assert.match(appSource, /BrowserRouter/)
  assert.match(appSource, /LocalSurfaceHostRoutes/)
  assert.match(appSource, /LocalAdminSurfaceRoute/)
  assert.match(routeSource, /<Route path=\{ROUTES\.studioProject\}/)
  assert.match(routeSource, /CanvasEditorPage/)
  assert.match(routeSource, /from '@movscript\/project-surface\/pages'/)
  assert.match(routeSource, /ProjectsPage/)
  assert.doesNotMatch(routeSource, /ProjectPickerSurface/)
  assert.match(adminSource, /AdminSurfaceApp/)
  assert.match(adminSource, /createLocalAdminLaunchContext/)
})

test('canvas surface route links use the host-neutral surface route facade', () => {
  const checkedFiles = [
    'surface/canvas/src/features/presentation/useWorkbenchCanvasLauncher.ts',
    'surface/canvas/src/features/application/useCanvasWorkspaceRouteControls.ts',
    'surface/canvas/src/features/components/CanvasListView.tsx',
    'surface/canvas/src/features/components/CanvasListViewRow.tsx',
    'surface/canvas/src/features/components/CanvasListViewSections.tsx',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared/, `${file} should use shared route contracts`)
    assert.doesNotMatch(source, /@\/routes/, `${file} should not import host route helpers`)
  }
})

test('external canvas consumers use canvas surface public entrypoints', () => {
  for (const file of [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
    'services/local-surface-host/tsconfig.json',
    'services/local-surface-host/vite.config.ts',
    'surface/project/tsconfig.json',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/canvas-surface\/data/, `${file} should resolve the canvas data facade`)
    assert.match(source, /@movscript\/canvas-surface\/workbench/, `${file} should resolve the canvas workbench facade`)
  }

  for (const file of [
    'apps/desktop/src/features/app-shell/application/appShortcutRecentItems.ts',
    'apps/desktop/src/features/app-shell/application/AppCanvasEditorShellRoute.tsx',
    'apps/desktop/src/shared/application/appMutationEventPublishing.test.ts',
    'apps/desktop/src/shared/application/appEventQueryInvalidation.ts',
    'apps/desktop/src/features/agent/components/AgentModeCanvasListPage.tsx',
    'apps/desktop/src/features/agent/components/AgentBrowserTabContent.tsx',
    'surface/project/src/features/project/application/useProjectEntryShellProps.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /@movscript\/canvas-surface\/features\/(?:application\/canvasQueryKeys|application\/canvasMutationInvalidation|presentation\/canvasHeaderStore|presentation\/useInlineTitleEditor|presentation\/useWorkbenchCanvasLauncher|components\/CanvasListView)/, `${file} should not deep-import canvas internals`)
  }
})

test('host canvas route helpers delegate canvas source semantics to shared surface routes', () => {
  for (const file of [
    'apps/desktop/src/routes/appRouteModel.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared\/surface-routes/, `${file} should consume shared canvas route helpers`)
    assert.match(source, /canvasEditorSurfacePath|canvasBackSurfacePath/, `${file} should delegate canvas path construction`)
    assert.doesNotMatch(source, /export const CANVAS_SOURCE_PARAM = ['"]from['"]/, `${file} should not redeclare the canvas source query param`)
    assert.doesNotMatch(source, /new URLSearchParams\(\{\s*\[CANVAS_SOURCE_PARAM\]/, `${file} should not rebuild canvas source search params`)
  }

  for (const file of [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
    'services/local-surface-host/tsconfig.json',
    'services/local-surface-host/vite.config.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared\/surface-routes/, `${file} should resolve the shared route facade subpath`)
  }
})

test('host route query helpers delegate parameter encoding to shared surface routes', () => {
  for (const file of [
    'apps/desktop/src/routes/projectRoutes.ts',
    'apps/desktop/src/shared/contracts/workspaceChangeHandoff.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared\/surface-routes/, `${file} should consume the shared route path helper`)
    assert.match(source, /routePathWithParams/, `${file} should delegate path and query parameter encoding`)
  }

  for (const file of [
    'apps/desktop/src/routes/projectRoutes.ts',
    'services/local-surface-host/src/routes/projectRoutes.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /new URLSearchParams\(\)/, `${file} should not reimplement route parameter encoding`)
  }
})

test('local surface host route table stays a static host-owned path list', () => {
  const source = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/routes/projectRoutes.ts'), 'utf8')

  assert.match(source, /@movscript\/project-surface\/routes/)
  assert.match(source, /@movscript\/resource-surface\/routes/)
  assert.doesNotMatch(source, /routePathWithParams/)
  assert.doesNotMatch(source, /withRouteParams/)
  assert.doesNotMatch(source, /new URLSearchParams\(\)/)
  assert.doesNotMatch(source, /project:\s*\{/, 'local host should not keep desktop-only nested project routes')
})

test('canvas service API uses the host-neutral surface HTTP client facade', () => {
  const source = readFileSync(resolve(repoRoot, 'surface/canvas/src/features/application/canvasServiceApi.ts'), 'utf8')

  assert.match(source, /@movscript\/shared\/surface-http/)
  assert.doesNotMatch(source, /@\/shared\/infrastructure\/api/)
})

test('resource data API consumers use the host-neutral surface HTTP client facade', () => {
  const checkedFiles = [
    'surface/resource/src/features/infrastructure/preview.ts',
    'surface/resource/src/features/application/externalResourceImport.ts',
    'surface/resource/src/features/application/useResourceVideoClipUpload.ts',
    'surface/resource/src/features/application/useExternalResourceSearchController.ts',
    'surface/resource/src/features/components/useResourceLibraryController.ts',
    'surface/resource/src/features/components/ResourcesPageDialogs.tsx',
    'surface/canvas/src/features/integrations/resources.ts',
    'surface/canvas/src/features/ui/CanvasResourceShelf.tsx',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared\/surface-http/, `${file} should use the shared surface HTTP facade`)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/api/, `${file} should not import host-local API clients`)
  }
})

test('project data API consumers use the host-neutral surface HTTP client facade', () => {
  const checkedFiles = [
    'surface/project/src/features/project/components/ProjectsPage.tsx',
    'surface/project/src/features/project/components/ProjectDataPage.tsx',
    'surface/project/src/features/project/application/localProjectLifecycle.ts',
    'surface/project/src/features/project-standards/application/projectStandardsStyleReferenceUpload.ts',
    'surface/project/src/features/content/components/ContentCanvasWorkspaceDetails.tsx',
    'surface/project/src/features/content/components/ContentCanvasResourceCandidatePicker.tsx',
    'surface/project/src/features/content/integrations/contentCanvasWorkspaceElectronGateway.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared\/surface-http/, `${file} should use the shared surface HTTP facade`)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/api/, `${file} should not import host-local API clients`)
  }
})

test('project content canvas generation job updates use the shared generation job facade', () => {
  const source = readFileSync(resolve(repoRoot, 'surface/project/src/features/content/components/useContentCanvasWorkspaceController.ts'), 'utf8')
  assert.match(source, /subscribeSurfaceGenerationJobStatus/)
  assert.doesNotMatch(source, /@\/features\/jobs\/application\/generationJobStatusStream/)

  const desktopAdapterSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/shared/infrastructure/api/generationJobs.ts'), 'utf8')
  const localAdapterSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/host-runtime/infrastructure/api/generationJobs.ts'), 'utf8')
  assert.match(desktopAdapterSource, /configureSurfaceGenerationJobStatusClient/)
  assert.match(localAdapterSource, /configureSurfaceGenerationJobStatusClient/)
})

test('shot library data API consumers use host-neutral shared contracts', () => {
  const pageSource = readFileSync(resolve(repoRoot, 'surface/shot-library/src/features/components/ShotLibraryPage.tsx'), 'utf8')
  const domainSource = readFileSync(resolve(repoRoot, 'surface/shot-library/src/features/domain/shotReferenceLibrary.ts'), 'utf8')

  assert.match(pageSource, /@movscript\/shared\/surface-http/)
  assert.doesNotMatch(pageSource, /@\/shared\/infrastructure\/api/)
  assert.doesNotMatch(pageSource, /@\/shared\/infrastructure\/config/)
  assert.match(domainSource, /@movscript\/shared\/surface-http/)
  assert.match(domainSource, /@movscript\/shared/)
  assert.doesNotMatch(domainSource, /@\/shared\/contracts\/appSettings/)
})

test('resource script versions use the host-neutral semantic entity facade', () => {
  const source = readFileSync(resolve(repoRoot, 'surface/resource/src/features/infrastructure/scriptVersions.ts'), 'utf8')

  assert.match(source, /@movscript\/shared\/semantic-entities/)
  assert.doesNotMatch(source, /@\/shared\/infrastructure\/api\/semanticEntities/)
})

test('surface resource media utilities live behind the resource surface boundary', () => {
  const checkedFiles = [
    'surface/resource/src/features/domain/resourceMediaCache.ts',
    'surface/resource/src/features/application/useResourceVideoClipSource.ts',
    'surface/resource/src/features/components/useResourceLibraryController.ts',
    'surface/canvas/src/features/ui/canvasAssetNodes.tsx',
    'surface/canvas/src/features/ui/CanvasWorkflowPanels.tsx',
    'surface/shot-library/src/features/components/shotLibraryImportPreparation.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(
      source,
      /@movscript\/resource-surface\/resource-media|\.\.\/\.\.\/resourceMediaBrowser\.js/,
      `${file} should use the resource surface media boundary`,
    )
    assert.doesNotMatch(source, /@\/shared\/ui\/resource(?:Blob|Download|Text|Url|MediaCache)/, `${file} should not import host-local resource media tools`)
  }
})

test('surface media components live behind the resource surface boundary', () => {
  const checkedFiles = [
    'surface/resource/src/features/components/ResourcesPageVideoClipDialog.tsx',
    'surface/resource/src/features/components/ResourcesPageExternalSearchItems.tsx',
    'surface/shot-library/src/features/components/ShotLibraryImportWorkspaceBrowser.tsx',
    'surface/shot-library/src/features/components/ShotLibraryReferenceCard.tsx',
    'surface/shot-library/src/features/components/ShotLibraryImportClipPlayer.tsx',
    'surface/shot-library/src/features/components/ShotLibraryImportDialogSections.tsx',
    'surface/canvas/src/features/ui/canvasAssetNodes.tsx',
    'surface/canvas/src/features/ui/CanvasResourceShelf.tsx',
    'surface/canvas/src/features/ui/canvasGenerationNodes.tsx',
    'surface/canvas/src/features/ui/CanvasWorkflowPanels.tsx',
    'surface/resource/src/features/components/ResourcesPage.tsx',
    'surface/resource/src/features/components/ResourcesPageItems.tsx',
    'surface/project/src/features/project-standards/components/ProjectStandardsPromptPreviewAside.tsx',
    'surface/project/src/features/content/components/ContentCanvasPreviewPanel.tsx',
    'surface/project/src/features/content/components/ContentPromptCanvasPanel.tsx',
    'surface/project/src/features/content/components/ContentCanvasPromptReferences.tsx',
    'surface/project/src/features/content/components/ContentCanvasWorkspaceDetails.tsx',
    'surface/project/src/features/content/components/ContentCanvasInspectorParts.tsx',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(
      source,
      /@movscript\/resource-surface\/resource-media(?:-components|-viewer)?|\.\.\/\.\.\/resourceMedia(?:Components|Viewer)\.js/,
      `${file} should use resource surface media components`,
    )
    assert.doesNotMatch(source, /@\/shared\/ui\/(?:UrlMedia|ResourceFileImage|ResourceFileVideo|ResourceFileAudio|ResourceImage|ResourceVideo|ResourceAudio|MediaViewer)/, `${file} should not import host-local media components`)
  }
})

test('desktop resource page consumers use the resource surface pages entrypoint', () => {
  const pagesSource = readFileSync(resolve(repoRoot, 'surface/resource/src/pages/index.ts'), 'utf8')
  assert.match(pagesSource, /ResourceLibraryView/)
  assert.match(pagesSource, /ExternalResourceSearchPage/)

  const checkedFiles = [
    'apps/desktop/src/pages/agent/AgentResourceLibraryPage.tsx',
    'apps/desktop/src/features/tools/components/RefVideoGenPage.tsx',
    'apps/desktop/src/features/tools/components/MultiAnglePage.tsx',
    'apps/desktop/src/features/tools/components/MotionImitationPage.tsx',
    'apps/desktop/src/features/tools/components/RefImageGenPage.tsx',
    'apps/desktop/src/features/tools/components/StyleTransferPage.tsx',
    'apps/desktop/src/features/agent/components/AgentBrowserTabContent.tsx',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/resource-surface\/pages/, `${file} should consume the public resource pages entrypoint`)
    assert.doesNotMatch(source, /@movscript\/resource-surface\/features\/components\/ResourcesPage/, `${file} should not deep-import resource page components`)
  }
})

test('resource data consumers use the resource surface data entrypoint', () => {
  const dataSource = readFileSync(resolve(repoRoot, 'surface/resource/src/data.ts'), 'utf8')
  assert.match(dataSource, /resourceMutationInvalidation/)
  assert.match(dataSource, /generationJobPayload/)
  assert.match(dataSource, /scriptDocumentReader/)
  assert.match(dataSource, /resourceQueryCache/)
  assert.match(dataSource, /infrastructure\/preview/)
  assert.match(dataSource, /infrastructure\/scriptVersions/)

  for (const file of [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
    'services/local-surface-host/tsconfig.json',
    'services/local-surface-host/vite.config.ts',
    'surface/canvas/tsconfig.json',
    'surface/project/tsconfig.json',
    'surface/shot-library/tsconfig.json',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/resource-surface\/data/, `${file} should resolve the resource data facade`)
  }

  for (const file of [
    'surface/project/src/features/scripts/components/ScriptsPage.tsx',
    'surface/shot-library/src/features/components/ShotLibraryPage.tsx',
    'surface/canvas/src/features/runtime/canvasRuntimeGeneration.ts',
    'surface/canvas/src/features/runtime/useCanvasRuntimeExecutor.ts',
    'surface/canvas/src/features/integrations/resources.ts',
    'apps/desktop/src/shared/application/appMutationEventPublishing.test.ts',
    'apps/desktop/src/shared/application/appEventQueryInvalidation.ts',
    'apps/desktop/src/shared/ui/GenResultCard.tsx',
    'apps/desktop/src/shared/ui/EntityCreateForms.tsx',
    'apps/desktop/src/features/tools/application/useToolCanvas.ts',
    'apps/desktop/src/features/tools/components/ToolDialog.tsx',
    'apps/desktop/src/features/agent/presentation/useAgentComposerController.ts',
    'apps/desktop/src/features/agent/components/GeneratedResultCard.tsx',
    'apps/desktop/src/features/agent/components/GeneratedCandidateAttachDialog.tsx',
    'apps/desktop/src/shared/infrastructure/api/preview.ts',
    'apps/desktop/src/shared/infrastructure/api/scriptVersions.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/resource-surface\/data/, `${file} should consume the public resource data facade`)
    assert.doesNotMatch(source, /@movscript\/resource-surface\/features\/(?:application\/resourceMutationInvalidation|domain\/generationJobPayload|domain\/scriptDocuments|application\/scriptDocumentReader|application\/resourceQueryCache|infrastructure\/preview|infrastructure\/scriptVersions)/, `${file} should not deep-import resource data internals`)
  }
})

test('project data consumers use the project surface data entrypoint', () => {
  const dataSource = readFileSync(resolve(repoRoot, 'surface/project/src/data.ts'), 'utf8')
  const reactSource = readFileSync(resolve(repoRoot, 'surface/project/src/react.ts'), 'utf8')
  assert.match(dataSource, /projectQueries/)
  assert.match(dataSource, /projectMutationInvalidation/)
  assert.match(dataSource, /contentCanvasMutationInvalidation/)
  assert.match(dataSource, /scriptWorkspaceRepository/)
  assert.match(dataSource, /contentSourceWorkspaceElectron/)
  assert.match(dataSource, /localProjectLifecycle/)
  assert.match(dataSource, /projectGitWorkspace/)
  assert.match(dataSource, /projectEntryRegistry/)
  assert.match(dataSource, /projectStandardsWorkspaceWorkspace/)
  assert.match(reactSource, /ProjectEntryDeckHeader/)
  assert.match(reactSource, /ProjectStandardsContent/)

  for (const file of [
    'apps/desktop/tsconfig.json',
    'apps/desktop/tsconfig.electron.json',
    'apps/desktop/electron.vite.config.ts',
    'apps/desktop/vite.e2e.config.ts',
    'services/local-surface-host/tsconfig.json',
    'services/local-surface-host/vite.config.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/project-surface\/data/, `${file} should resolve the project data facade`)
  }

  for (const file of [
    'apps/desktop/src/pages/home/GlobalHomePage.tsx',
    'apps/desktop/src/features/app-shell/application/appShortcutRecentItems.ts',
    'apps/desktop/src/features/organization/components/OrgSelectPage.tsx',
    'apps/desktop/src/features/app-shell/components/ProjectGitHeaderActions.tsx',
    'apps/desktop/src/features/app-shell/components/ProjectRequiredDialog.tsx',
    'apps/desktop/src/shared/application/appMutationEventPublishing.test.ts',
    'apps/desktop/src/shared/application/appEventQueryInvalidation.ts',
    'apps/desktop/src/shared/ui/EntityCreateForms.tsx',
    'apps/desktop/src/features/agent/components/useProjectAgentModeSidebarController.ts',
    'apps/desktop/src/features/agent/components/ProjectAgentContentPanel.tsx',
    'apps/desktop/src/features/agent/components/AgentSessionOutputPane.tsx',
    'apps/desktop/src/features/agent/components/AgentSessionOutputModel.ts',
    'apps/desktop/src/features/agent/components/AgentSessionOutputPaneParts.tsx',
    'apps/desktop/src/features/agent/components/useAgentBrowserProjectHomeController.tsx',
    'apps/desktop/src/features/agent/domain/workspaceDomainModel.ts',
    'apps/desktop/src/e2e/project-workspace.spec.ts',
    'apps/desktop/src/e2e/project-workspace-electron.spec.ts',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/project-surface\/data/, `${file} should consume the public project data facade`)
    assert.doesNotMatch(source, /@movscript\/project-surface\/features\/(?:project\/application\/projectQueries|project\/application\/projectMutationInvalidation|content\/application\/contentCanvasQueryKeys|content\/application\/contentCanvasMutationInvalidation|scripts\/application\/scriptMutationInvalidation|scripts\/application\/scriptQueryKeys|scripts\/application\/scriptWorkspaceRepository|content\/integrations\/contentSourceWorkspaceElectron|content\/integrations\/sourceWorkspaceTypes|project\/application\/localProjectLifecycle|project\/application\/projectGitWorkspace|project\/domain\/projectEntryRegistry|project-standards\/domain\/projectStandardsWorkspaceWorkspace)/, `${file} should not deep-import project data internals`)
  }

  for (const file of [
    'apps/desktop/src/features/app-shell/application/AppShellLayoutHeaders.tsx',
    'apps/desktop/src/features/agent/components/AgentBrowserTabContent.tsx',
  ]) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/project-surface\/react/, `${file} should consume the public project React facade`)
    assert.doesNotMatch(source, /@movscript\/project-surface\/features\/(?:project\/components\/ProjectEntryDeckHeader|project-standards\/components\/ProjectStandardsPage)/, `${file} should not deep-import project UI internals`)
  }
})

test('project content canvas uses surface-owned generation controls', () => {
  const checkedFiles = [
    'surface/project/src/features/content/components/ContentCanvasInspectorParts.tsx',
    'surface/project/src/features/content/components/ContentCanvasModelSelector.tsx',
    'surface/project/src/features/content/components/ContentCanvasGenerationParamControls.tsx',
    'surface/project/src/features/content/components/ContentCanvasResourceCandidatePicker.tsx',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.doesNotMatch(source, /@\/shared\/ui\/(?:ModelSelector|GenerationParamControls|ResourceLibraryPicker|ResourceLibraryPickerUi)/, `${file} should not import host-local generation controls`)
  }

  const modelSelectorSource = readFileSync(resolve(repoRoot, checkedFiles[1]), 'utf8')
  assert.match(modelSelectorSource, /@movscript\/shared/, 'model selection should use the shared model facade')

  const resourcePickerSource = readFileSync(resolve(repoRoot, checkedFiles[3]), 'utf8')
  assert.match(resourcePickerSource, /@movscript\/resource-surface/, 'resource picker should live behind the resource surface boundary')
})

test('resource candidate attachment lives behind surface and workspace facades', () => {
  const resourcesPageSource = readFileSync(resolve(repoRoot, 'surface/resource/src/features/components/ResourcesPage.tsx'), 'utf8')
  const attachPanelSource = readFileSync(resolve(repoRoot, 'surface/resource/src/resourceCandidateAttachPanel.tsx'), 'utf8')
  const desktopAdapterSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/shared/infrastructure/api/workspaceCandidates.ts'), 'utf8')
  const localAdapterSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/host-runtime/infrastructure/api/workspaceCandidates.ts'), 'utf8')
  const localTsconfigSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/tsconfig.json'), 'utf8')
  const canvasTsconfigSource = readFileSync(resolve(repoRoot, 'surface/canvas/tsconfig.json'), 'utf8')

  assert.match(resourcesPageSource, /\.\.\/\.\.\/resourceCandidateAttachPanel\.js/)
  assert.doesNotMatch(resourcesPageSource, /@\/shared\/ui\/ResourceCandidateAttachPanel/)
  assert.match(attachPanelSource, /@movscript\/shared/)
  assert.match(attachPanelSource, /@movscript\/shared\/semantic-entities/)
  assert.doesNotMatch(attachPanelSource, /@\/shared\/infrastructure\/workspaceCandidateRepository/)
  assert.match(desktopAdapterSource, /configureSurfaceWorkspaceCandidateClient/)
  assert.match(localAdapterSource, /configureSurfaceWorkspaceCandidateClient/)
  assert.match(localTsconfigSource, /@movscript\/shared\/workspace-candidates/)
  assert.match(canvasTsconfigSource, /@movscript\/shared\/semantic-entities/)
  assert.match(canvasTsconfigSource, /@movscript\/shared\/workspace-candidates/)
})

test('surface session reads use the host-neutral host state facade', () => {
  const checkedFiles = [
    'surface/resource/src/features/components/useResourceLibraryController.ts',
    'surface/resource/src/features/application/useExternalResourceSearchController.ts',
    'surface/shot-library/src/features/components/ShotLibraryPage.tsx',
    'surface/canvas/src/features/components/CanvasListView.tsx',
    'surface/canvas/src/features/presentation/useWorkbenchCanvasLauncher.ts',
    'surface/project/src/features/scripts/components/ScriptsPage.tsx',
    'surface/project/src/features/project/application/usePermissions.ts',
    'surface/project/src/features/project/components/ProjectsPage.tsx',
    'surface/project/src/features/project/components/ProjectDataPage.tsx',
    'surface/project/src/features/project-standards/application/useProjectStandardsController.ts',
    'surface/project/src/features/project-standards/application/projectStandardsControllerCommands.ts',
    'surface/project/src/features/content/components/useContentCanvasWorkspaceController.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared|surfaceHostStateHooks/, `${file} should use the shared host state facade`)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/(?:appSettingsStore|session\/(?:projectStore|userStore|workspaceOwnerContext))/, `${file} should not import host session stores`)
  }

  const desktopAdapterSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/shared/infrastructure/api/hostState.ts'), 'utf8')
  const localAdapterSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/host-runtime/infrastructure/api/hostState.ts'), 'utf8')
  assert.match(desktopAdapterSource, /configureSurfaceHostStateClient/)
  assert.match(localAdapterSource, /configureSurfaceHostStateClient/)
})

test('surface persisted UI state uses the host-neutral state storage facade', () => {
  const checkedFiles = [
    'surface/project/src/features/project/application/projectEntrySessionStore.ts',
    'surface/canvas/src/features/runtime/runHistoryStore.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /createSurfaceStateStorage/, `${file} should use the shared state storage facade`)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/desktopStateStorage/, `${file} should not import host desktop storage`)
  }
})

test('project workspace domain repositories use the host-neutral workspace domain facade', () => {
  const checkedFiles = [
    'surface/project/src/features/scripts/application/scriptWorkspaceRepository.ts',
    'surface/project/src/features/project-standards/application/projectStandardsWorkspaceRepository.ts',
    'surface/project/src/features/content/integrations/contentCanvasWorkspaceElectronGateway.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /createSurfaceWorkspaceDomainService/, `${file} should use the shared workspace domain facade`)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/workspaceDomainRepository/, `${file} should not import host workspace domain repositories`)
    assert.doesNotMatch(source, /createElectronMovScriptWorkspaceService/, `${file} should not use the desktop workspace domain service directly`)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/session\/workspaceOwnerContext/, `${file} should not import host workspace owner context`)
  }

  const desktopAdapterSource = readFileSync(resolve(repoRoot, 'apps/desktop/src/shared/infrastructure/api/workspaceDomain.ts'), 'utf8')
  const localAdapterSource = readFileSync(resolve(repoRoot, 'services/local-surface-host/src/host-runtime/infrastructure/api/workspaceDomain.ts'), 'utf8')
  assert.match(desktopAdapterSource, /configureSurfaceWorkspaceDomainClient/)
  assert.match(localAdapterSource, /configureSurfaceWorkspaceDomainClient/)
})

test('project standards consume semantic entities through the shared facade', () => {
  const checkedFiles = [
    'surface/project/src/features/project-standards/application/projectStandardsControllerCommands.ts',
    'surface/project/src/features/project-standards/application/projectStandardsModel.ts',
    'surface/project/src/features/project/application/projectOverviewData.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared\/semantic-entities/, `${file} should use the shared semantic facade`)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/api\/semanticEntities/, `${file} should not import host-local semantic helpers`)
  }
})

test('project standards workspace artifacts use the shared workspace artifact facade', () => {
  const checkedFiles = [
    'surface/project/src/features/project-standards/application/projectStandardsWorkspaceArtifactService.ts',
    'surface/project/src/features/project/application/projectWorkspaceReview.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared/)
    assert.doesNotMatch(source, /@\/shared\/contracts\/workspaceArtifact/)
    assert.doesNotMatch(source, /@\/shared\/infrastructure\/providerSessionClient/)
  }
})

test('surface mutation publishers use the shared app event facade', () => {
  const checkedFiles = [
    'surface/resource/src/features/application/resourceMutationInvalidation.ts',
    'surface/canvas/src/features/application/canvasMutationInvalidation.ts',
    'surface/project/src/features/scripts/application/scriptMutationInvalidation.ts',
    'surface/project/src/features/project/application/projectMutationInvalidation.ts',
    'surface/project/src/features/content/application/contentCanvasMutationInvalidation.ts',
    'surface/shot-library/src/features/application/shotLibraryMutationInvalidation.ts',
  ]

  for (const file of checkedFiles) {
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    assert.match(source, /@movscript\/shared\/app-events/, `${file} should use the shared app event facade`)
    assert.doesNotMatch(source, /@\/shared\/application\/appEvents/, `${file} should not import host-local app events`)
  }
})

function* sourceFiles(roots) {
  for (const root of roots) {
    yield* walk(resolve(repoRoot, root))
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      yield* walk(path)
      continue
    }
    if (/\.(ts|tsx)$/.test(entry)) yield path
  }
}

function relative(file) {
  return file.slice(repoRoot.length + 1)
}
