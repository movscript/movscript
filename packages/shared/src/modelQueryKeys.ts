export const modelKeys = {
  capability: (capability: string | undefined) => ['models', capability] as const,
  intent: (
    capability: string | undefined,
    operation: string | undefined,
    referenceAssetsKey = '',
  ) => ['models', capability, operation ?? '', referenceAssetsKey] as const,
}
