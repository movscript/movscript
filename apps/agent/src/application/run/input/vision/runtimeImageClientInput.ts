import type { NormalizedClientInput } from '../../../../context/input/client/normalizeClientInput.js'
import type { CoreImageProcessingPort } from '../../../../ports/media/imageProcessingPort.js'
import type { AgentClientAttachmentRef, AgentRun } from '../../../../state/shared/types.js'

const IMAGE_PREPROCESSING_TIMEOUT_MS = 12_000

export interface RuntimeVisionAttachmentProjection {
  attachmentId?: string
  resourceId?: number
  name?: string
  status: 'optimized' | 'original' | 'metadata_only' | 'failed'
  originalBytes?: number
  optimizedBytes?: number
  originalWidth?: number
  originalHeight?: number
  optimizedWidth?: number
  optimizedHeight?: number
  outputMimeType?: string
  preset?: string
  reason?: string
}

export interface PreparedRuntimeVisionClientInput {
  clientInput: NormalizedClientInput
  projections: RuntimeVisionAttachmentProjection[]
  warnings: string[]
}

export async function prepareRuntimeVisionClientInput(input: {
  run: AgentRun
  clientInput: NormalizedClientInput
  imageProcessingPort?: CoreImageProcessingPort
  signal?: AbortSignal
}): Promise<PreparedRuntimeVisionClientInput> {
  const projections: RuntimeVisionAttachmentProjection[] = []
  const warnings: string[] = []
  const attachments: AgentClientAttachmentRef[] = []
  for (const attachment of input.clientInput.attachments) {
    if (!isImageAttachment(attachment)) {
      attachments.push(attachment)
      continue
    }
    if (!input.imageProcessingPort) {
      if (attachment.dataUrl) {
        attachments.push(originalPayloadAttachment(attachment, 'no image preprocessing port available; original image payload was sent to the model'))
        projections.push(projectionForAttachment(attachment, {
          status: 'original',
          reason: 'no image preprocessing port available; original image payload was sent to the model',
        }))
      } else {
        attachments.push(metadataOnlyAttachment(attachment, 'no image preprocessing port available and no image dataUrl was provided'))
        projections.push(projectionForAttachment(attachment, {
          status: 'metadata_only',
          reason: 'no image preprocessing port available and no image dataUrl was provided',
        }))
      }
      continue
    }
    try {
      const timeout = preprocessingTimeoutSignal(input.signal, IMAGE_PREPROCESSING_TIMEOUT_MS)
      let processed: Awaited<ReturnType<CoreImageProcessingPort['process']>>
      try {
        processed = await input.imageProcessingPort.process({
          run: input.run,
          resourceId: attachment.resourceId,
          dataUrl: attachment.dataUrl,
          name: attachment.name,
          mimeType: attachment.mimeType,
          preset: 'vision_default',
          signal: timeout.signal,
        })
      } finally {
        timeout.cleanup()
      }
      attachments.push({
        ...attachment,
        mimeType: processed.output.mimeType,
        size: processed.output.sizeBytes,
        dataUrl: processed.output.dataUrl,
        vision: {
          payload: 'optimized',
          preset: processed.preset,
          ...(attachment.resourceId !== undefined ? { originalResourceId: attachment.resourceId } : {}),
          ...(attachment.mimeType ? { originalMimeType: attachment.mimeType } : {}),
          ...(attachment.size !== undefined ? { originalSize: attachment.size } : {}),
          ...(processed.original.width !== undefined ? { originalWidth: processed.original.width } : {}),
          ...(processed.original.height !== undefined ? { originalHeight: processed.original.height } : {}),
          outputMimeType: processed.output.mimeType,
          outputSize: processed.output.sizeBytes,
          outputWidth: processed.output.width,
          outputHeight: processed.output.height,
          outputHash: processed.output.hash,
        },
      })
      projections.push(projectionForAttachment(attachment, {
        status: 'optimized',
        originalBytes: processed.source.sizeBytes,
        optimizedBytes: processed.output.sizeBytes,
        originalWidth: processed.original.width,
        originalHeight: processed.original.height,
        optimizedWidth: processed.output.width,
        optimizedHeight: processed.output.height,
        outputMimeType: processed.output.mimeType,
        preset: processed.preset,
      }))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (attachment.dataUrl) {
        warnings.push(`Image attachment ${attachment.name ?? attachment.id ?? attachment.resourceId ?? 'unknown'} was not preprocessed; sending original image payload: ${reason}`)
        attachments.push(originalPayloadAttachment(attachment, `image preprocessing failed; original image payload was sent to the model: ${reason}`))
        projections.push(projectionForAttachment(attachment, {
          status: 'original',
          reason: `${reason}; original image payload was sent to the model`,
        }))
      } else {
        warnings.push(`Image attachment ${attachment.name ?? attachment.id ?? attachment.resourceId ?? 'unknown'} was not preprocessed and has no image dataUrl: ${reason}`)
        attachments.push(metadataOnlyAttachment(attachment, `image preprocessing failed and no image dataUrl was provided: ${reason}`))
        projections.push(projectionForAttachment(attachment, {
          status: 'failed',
          reason: `${reason}; no image dataUrl was provided`,
        }))
      }
    }
  }
  return {
    clientInput: {
      ...input.clientInput,
      attachments,
    },
    projections,
    warnings,
  }
}

function projectionForAttachment(
  attachment: AgentClientAttachmentRef,
  patch: Omit<RuntimeVisionAttachmentProjection, 'attachmentId' | 'resourceId' | 'name'>,
): RuntimeVisionAttachmentProjection {
  return {
    ...(attachment.id ? { attachmentId: attachment.id } : {}),
    ...(attachment.resourceId !== undefined ? { resourceId: attachment.resourceId } : {}),
    ...(attachment.name ? { name: attachment.name } : {}),
    ...patch,
  }
}

function isImageAttachment(attachment: AgentClientAttachmentRef): boolean {
  return attachment.type === 'image' || attachment.mimeType?.toLowerCase().startsWith('image/') === true
}

function originalPayloadAttachment(attachment: AgentClientAttachmentRef, reason: string): AgentClientAttachmentRef {
  return {
    ...attachment,
    vision: {
      payload: 'original',
      reason,
      ...(attachment.resourceId !== undefined ? { originalResourceId: attachment.resourceId } : {}),
      ...(attachment.mimeType ? { originalMimeType: attachment.mimeType } : {}),
      ...(attachment.size !== undefined ? { originalSize: attachment.size } : {}),
    },
  }
}

function metadataOnlyAttachment(attachment: AgentClientAttachmentRef, reason = 'original image payload withheld from model context'): AgentClientAttachmentRef {
  const { dataUrl: _dataUrl, vision: _vision, ...metadata } = attachment
  return {
    ...metadata,
    vision: {
      payload: 'metadata_only',
      reason,
      ...(attachment.resourceId !== undefined ? { originalResourceId: attachment.resourceId } : {}),
      ...(attachment.mimeType ? { originalMimeType: attachment.mimeType } : {}),
      ...(attachment.size !== undefined ? { originalSize: attachment.size } : {}),
    },
  }
}

function preprocessingTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abortFromParent = () => controller.abort(parent?.reason ?? new Error('image preprocessing aborted'))
  if (parent?.aborted) {
    abortFromParent()
    return { signal: controller.signal, cleanup: () => undefined }
  }
  parent?.addEventListener('abort', abortFromParent, { once: true })
  const timeout = setTimeout(() => {
    controller.abort(new Error(`image preprocessing timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      parent?.removeEventListener('abort', abortFromParent)
    },
  }
}
