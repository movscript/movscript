import { analyzeMediaPipelineShotCuts } from '../application/shotCutHost'
import {
  buildImportWorkspaces,
  optionalNumber,
  type ShotImportWorkspace,
} from '../domain/shotLibraryWorkspaceModel'
import type { ShotLibraryVideoMetadata } from '../domain/shotReferenceLibrary'
import { captureVideoThumbnails, loadVideoProbeMetadataFromObjectUrl } from '@movscript/shared/media-probe'
import { withObjectUrl } from '@movscript/shared/browser'
import { loadResourceBlob } from '@movscript/resource-surface/resource-media'
import type { RawResource } from '@movscript/shared'

export const SHOT_IMPORT_WORKSPACE_REVEAL_DELAY_MS = 110

const VIDEO_METADATA_TIMEOUT_MS = 8000
const SHOT_IMPORT_THUMBNAIL_WIDTH = 320

export async function loadVideoMetadataFromBlob(source: Blob): Promise<ShotLibraryVideoMetadata> {
  return withObjectUrl(source, url => loadVideoMetadataFromObjectUrl(url, () => {}))
}

export async function loadVideoMetadataFromObjectUrl(url: string, cleanup: () => void): Promise<ShotLibraryVideoMetadata> {
  return loadVideoProbeMetadataFromObjectUrl(url, cleanup, VIDEO_METADATA_TIMEOUT_MS)
}

export async function loadResourceVideoBlob(resource: RawResource, onProgress?: (percent: number | undefined) => void): Promise<Blob> {
  return loadResourceBlob(resource, {
    onDownloadProgress: (event) => {
      const total = event.total || resource.size || 0
      onProgress?.(total > 0 ? Math.min(99, Math.round((event.loaded / total) * 100)) : undefined)
    },
  })
}

export async function buildImportWorkspacesWithThumbnails(
  resource: RawResource,
  metadata: ShotLibraryVideoMetadata,
  sourceData: ArrayBuffer,
  thumbnailSourceUrl: string,
): Promise<ShotImportWorkspace[]> {
  const workspaces = await buildLocalImportWorkspaces(resource, metadata, sourceData)
  return buildImportWorkspaceThumbnails(thumbnailSourceUrl, workspaces)
}

export async function buildImportWorkspaceThumbnails(sourceUrl: string, workspaces: ShotImportWorkspace[]): Promise<ShotImportWorkspace[]> {
  if (typeof document === 'undefined' || workspaces.length === 0) return workspaces
  try {
    const thumbnails = await captureWorkspaceThumbnails(sourceUrl, workspaces)
    return workspaces.map((workspace, index) => ({ ...workspace, thumbnailUrl: thumbnails[index] }))
  } catch {
    return workspaces
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

async function buildLocalImportWorkspaces(
  resource: RawResource,
  metadata: ShotLibraryVideoMetadata,
  sourceData: ArrayBuffer,
): Promise<ShotImportWorkspace[]> {
  if (!metadata.durationSec) return buildImportWorkspaces(resource, metadata)
  try {
    const result = await analyzeMediaPipelineShotCuts({
      sourceData,
      sourceName: resource.name,
      durationSec: metadata.durationSec,
    })
    if (result?.ok && result.shots?.length) {
      return buildImportWorkspaces(resource, metadata, result.shots)
    }
  } catch {
    // Fall through to deterministic local workspace ranges when desktop scene detection is unavailable.
  }
  return buildImportWorkspaces(resource, metadata)
}

async function captureWorkspaceThumbnails(sourceUrl: string, workspaces: ShotImportWorkspace[]): Promise<Array<string | undefined>> {
  return captureVideoThumbnails(
    sourceUrl,
    workspaces.map((workspace) => optionalNumber(workspace.startSec) ?? 0),
    {
      width: SHOT_IMPORT_THUMBNAIL_WIDTH,
      metadataTimeoutMs: VIDEO_METADATA_TIMEOUT_MS,
      seekTimeoutMs: 2500,
      quality: 0.76,
    },
  )
}
