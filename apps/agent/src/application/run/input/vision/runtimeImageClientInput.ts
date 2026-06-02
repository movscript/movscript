import type { NormalizedClientInput } from '../../../../context/input/client/normalizeClientInput.js'
import type { CoreImageProcessingPort } from '../../../../ports/media/imageProcessingPort.js'
import type { AgentClientAttachmentRef, AgentRun } from '../../../../state/shared/types.js'

export interface RuntimeVisionAttachmentProjection {
  attachmentId?: string
  resourceId?: number
  name?: string
  status: 'optimized' | 'metadata_only' | 'failed'
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
      attachments.push(metadataOnlyAttachment(attachment))
      projections.push(projectionForAttachment(attachment, {
        status: 'metadata_only',
        reason: 'no image preprocessing port available; original image payload was not sent to the model',
      }))
      continue
    }
    try {
      const processed = await input.imageProcessingPort.process({
        run: input.run,
        resourceId: attachment.resourceId,
        dataUrl: attachment.dataUrl,
        name: attachment.name,
        mimeType: attachment.mimeType,
        preset: 'vision_default',
        signal: input.signal,
      })
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
      warnings.push(`Image attachment ${attachment.name ?? attachment.id ?? attachment.resourceId ?? 'unknown'} was not preprocessed: ${reason}`)
      attachments.push(metadataOnlyAttachment(attachment))
      projections.push(projectionForAttachment(attachment, {
        status: 'failed',
        reason: `${reason}; original image payload was not sent to the model`,
      }))
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

function metadataOnlyAttachment(attachment: AgentClientAttachmentRef): AgentClientAttachmentRef {
  const { dataUrl: _dataUrl, vision: _vision, ...metadata } = attachment
  return {
    ...metadata,
    vision: {
      payload: 'metadata_only',
      reason: 'original image payload withheld from model context',
      ...(attachment.resourceId !== undefined ? { originalResourceId: attachment.resourceId } : {}),
      ...(attachment.mimeType ? { originalMimeType: attachment.mimeType } : {}),
      ...(attachment.size !== undefined ? { originalSize: attachment.size } : {}),
    },
  }
}
