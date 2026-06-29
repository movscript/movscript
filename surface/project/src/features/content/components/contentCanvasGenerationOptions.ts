import {
  buildGenerationIntentForOutputKind,
  completeGenerationReferenceAssets,
  generationCapabilityForOutputKind,
  generationOperationOptionsForOutputKind,
  type GenerationIntentPayload,
  type GenerationOperationOption,
  type GenerationPromptReferenceIntent,
} from '@movscript/core/generation'

export function contentCanvasGenerationCapability(mediaKind: string | null | undefined): string | null {
  return generationCapabilityForOutputKind(mediaKind)
}

export function contentCanvasGenerationOperationOptions(
  mediaKind: string | null | undefined,
  referenceAssets: readonly GenerationPromptReferenceIntent[] = [],
): GenerationOperationOption[] {
  return generationOperationOptionsForOutputKind(mediaKind, referenceAssets)
}

export function contentCanvasGenerationIntent(
  mediaKind: string | null | undefined,
  operation: string,
  inputResourceIds: readonly number[] = [],
  referenceAssets: readonly GenerationPromptReferenceIntent[] = [],
): GenerationIntentPayload | null {
  const completedReferenceAssets = completeGenerationReferenceAssets({
    operation,
    existing: referenceAssets,
    inputResourceIds,
  })
  return buildGenerationIntentForOutputKind({
    outputKind: mediaKind,
    operation,
    referenceAssets: completedReferenceAssets,
  })
}

export function contentCanvasReferenceAssetsForOperation(
  operation: string,
  inputResourceIds: readonly number[],
): NonNullable<GenerationIntentPayload['reference_assets']> {
  return completeGenerationReferenceAssets({ operation, inputResourceIds })
}

export function contentCanvasReferenceRoleForOperation(operation: string, index: number): string {
  const refs = completeGenerationReferenceAssets({ operation, inputResourceIds: [index + 1] })
  return refs[0]?.role ?? 'reference_image'
}

export function contentCanvasReferenceMediaTypeForOperation(operation: string, role: string): 'image' | 'video' | undefined {
  const refs = completeGenerationReferenceAssets({
    operation,
    existing: [{ role, resource_id: 1 }],
    inputResourceIds: [1],
  })
  const mediaType = refs[0]?.media_type
  return mediaType === 'image' || mediaType === 'video' ? mediaType : undefined
}
