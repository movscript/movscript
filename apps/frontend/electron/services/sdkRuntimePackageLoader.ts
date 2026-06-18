export type SdkRuntimeModuleLoader = (specifier: string) => Promise<unknown>

export interface SdkRuntimePackageResolution {
  ok: boolean
  packageName: string
  module?: unknown
  error?: string
}

export interface SdkRuntimePackageContractProbe {
  ok: boolean
  packageName: string
  requiredExports: string[]
  missingExports: string[]
  error?: string
}

export const dynamicSdkRuntimeModuleLoader: SdkRuntimeModuleLoader = (specifier) => {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (value: string) => Promise<unknown>
  return dynamicImport(specifier)
}

export async function loadSdkRuntimePackage(
  packageName: string,
  loader: SdkRuntimeModuleLoader = dynamicSdkRuntimeModuleLoader,
): Promise<SdkRuntimePackageResolution> {
  if (!packageName.trim()) return { ok: false, packageName, error: 'SDK package name is empty.' }
  try {
    return {
      ok: true,
      packageName,
      module: await loader(packageName),
    }
  } catch (error) {
    return {
      ok: false,
      packageName,
      error: packageLoadErrorMessage(packageName, error),
    }
  }
}

export function requiredExport<TExport = unknown>(
  module: unknown,
  exportName: string,
  packageName: string,
): TExport {
  if (!module || typeof module !== 'object' || !(exportName in module)) {
    throw new Error(`${packageName} does not expose required export ${exportName}.`)
  }
  return (module as Record<string, TExport>)[exportName]
}

export function probeSdkRuntimePackageContract(
  packageName: string,
  module: unknown,
  requiredExports: readonly string[] = [],
): SdkRuntimePackageContractProbe {
  const missingExports = requiredExports.filter((exportName) => {
    return !module || typeof module !== 'object' || !(exportName in module)
  })
  return {
    ok: missingExports.length === 0,
    packageName,
    requiredExports: [...requiredExports],
    missingExports,
    ...(missingExports.length > 0 ? { error: missingPackageExportsMessage(packageName, missingExports) } : {}),
  }
}

export function assertSdkRuntimePackageContract(
  packageName: string,
  module: unknown,
  requiredExports: readonly string[] = [],
): void {
  const probe = probeSdkRuntimePackageContract(packageName, module, requiredExports)
  if (!probe.ok) throw new Error(probe.error)
}

function missingPackageExportsMessage(packageName: string, missingExports: readonly string[]): string {
  return `${packageName} does not expose required SDK exports: ${missingExports.join(', ')}.`
}

function packageLoadErrorMessage(packageName: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `SDK package ${packageName} is not installed or cannot be loaded: ${detail}`
}
