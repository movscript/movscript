import { useCallback, useEffect, useState } from 'react'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { toast } from '@/shared/ui/toastStore'
import type { RawResource } from '@/types'
import type { ShotLibraryVideoMetadata } from '@/features/shot-library/domain/shotReferenceLibrary'
import {
  buildImportWorkspaces,
  defaultImportGroupTitle,
  tempResourceFromFile,
  uploadErrorMessage,
  type ShotImportSession,
  type ShotImportWorkspace,
  type ShotManualWorkspace,
} from '@/features/shot-library/domain/shotLibraryWorkspaceModel'
import {
  SHOT_IMPORT_WORKSPACE_REVEAL_DELAY_MS,
  buildImportWorkspaceThumbnails,
  buildImportWorkspacesWithThumbnails,
  delay,
  loadResourceVideoBlob,
  loadVideoMetadataFromBlob,
  loadVideoMetadataFromObjectUrl,
} from '@/features/shot-library/components/shotLibraryImportPreparation'
import { RESOURCE_LIBRARY_PAGE_SIZE } from '@/features/shot-library/components/shotLibraryPagination'

interface UseShotLibraryImportControllerOptions {
  uploadFailedTitle: string
  videoOnlyMessage: string
}

export function useShotLibraryImportController({
  uploadFailedTitle,
  videoOnlyMessage,
}: UseShotLibraryImportControllerOptions) {
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importSession, setImportSession] = useState<ShotImportSession | null>(null)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourcePage, setResourcePage] = useState(1)
  const [selectedLibraryResource, setSelectedLibraryResource] = useState<RawResource | null>(null)

  useEffect(() => {
    return () => {
      revokeObjectUrl(importSession?.objectUrl)
    }
  }, [importSession?.objectUrl])

  const revealImportWorkspaces = useCallback(async (
    sourceKey: string,
    metadata: ShotLibraryVideoMetadata,
    workspaces: ShotImportWorkspace[],
    error?: string,
  ) => {
    setImportSession(current => current?.sourceKey === sourceKey ? {
      ...current,
      metadata,
      phase: 'review',
      workspaces: [],
      activeWorkspaceId: undefined,
      error,
      progressPercent: undefined,
    } : current)
    for (const workspace of workspaces) {
      await delay(SHOT_IMPORT_WORKSPACE_REVEAL_DELAY_MS)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        phase: 'review',
        workspaces: [...current.workspaces, workspace],
        activeWorkspaceId: current.activeWorkspaceId ?? workspace.id,
      } : current)
    }
  }, [])

  const startImportFromFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setImportDialogOpen(true)
    if (!file.type.startsWith('video/')) {
      toast.error(uploadFailedTitle, videoOnlyMessage)
      return
    }
    const objectUrl = createObjectUrl(file)
    const resource = tempResourceFromFile(file, objectUrl)
    const sourceKey = `file:${file.name}:${file.size}:${file.lastModified}`
    setImportSession({
      sourceKey,
      sourceKind: 'file',
      sourceName: file.name,
      sourceResource: resource,
      file,
      objectUrl,
      metadata: {},
      phase: 'preparing',
      workspaces: [],
      targetGroupId: undefined,
      targetGroupTitle: defaultImportGroupTitle(file.name),
    })
    let metadata: ShotLibraryVideoMetadata = {}
    try {
      metadata = await loadVideoMetadataFromBlob(file)
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'cutting',
        workspaces: [],
        activeWorkspaceId: undefined,
        error: undefined,
        progressPercent: undefined,
      } : current)
      const sourceData = await file.arrayBuffer()
      const workspaces = await buildImportWorkspacesWithThumbnails(resource, metadata, sourceData, objectUrl)
      await revealImportWorkspaces(sourceKey, metadata, workspaces)
    } catch (error) {
      const workspaces = await buildImportWorkspaceThumbnails(objectUrl, buildImportWorkspaces(resource, metadata))
      await revealImportWorkspaces(sourceKey, metadata, workspaces, uploadErrorMessage(error, uploadFailedTitle))
    }
  }, [revealImportWorkspaces, uploadFailedTitle, videoOnlyMessage])

  const startImportFromResource = useCallback(async (resource: RawResource) => {
    setSelectedLibraryResource(resource)
    setImportDialogOpen(true)
    const sourceKey = `resource:${resource.ID}:${Date.now()}`
    setImportSession({
      sourceKey,
      sourceKind: 'resource',
      sourceName: resource.name,
      sourceResource: resource,
      metadata: {},
      phase: 'preparing',
      workspaces: [],
      targetGroupId: undefined,
      targetGroupTitle: defaultImportGroupTitle(resource.name),
    })
    let metadata: ShotLibraryVideoMetadata = {}
    let thumbnailObjectUrl: string | undefined
    try {
      const blob = await loadResourceVideoBlob(resource, (progressPercent) => {
        setImportSession(current => current?.sourceKey === sourceKey ? {
          ...current,
          progressPercent,
        } : current)
      })
      thumbnailObjectUrl = createObjectUrl(blob)
      metadata = await loadVideoMetadataFromObjectUrl(thumbnailObjectUrl, () => {})
      setImportSession(current => current?.sourceKey === sourceKey ? {
        ...current,
        metadata,
        phase: 'cutting',
        workspaces: [],
        activeWorkspaceId: undefined,
        error: undefined,
        progressPercent: undefined,
      } : current)
      const sourceData = await blob.arrayBuffer()
      const workspaces = await buildImportWorkspacesWithThumbnails(resource, metadata, sourceData, thumbnailObjectUrl)
      await revealImportWorkspaces(sourceKey, metadata, workspaces)
    } catch (error) {
      const workspaces = thumbnailObjectUrl
        ? await buildImportWorkspaceThumbnails(thumbnailObjectUrl, buildImportWorkspaces(resource, metadata))
        : buildImportWorkspaces(resource, metadata)
      await revealImportWorkspaces(sourceKey, metadata, workspaces, uploadErrorMessage(error, uploadFailedTitle))
    } finally {
      revokeObjectUrl(thumbnailObjectUrl)
    }
  }, [revealImportWorkspaces, uploadFailedTitle])

  const closeImportDialog = useCallback(() => {
    setImportDialogOpen(false)
    setSelectedLibraryResource(null)
    setImportSession(current => {
      revokeObjectUrl(current?.objectUrl)
      return null
    })
  }, [])

  const updateImportWorkspace = useCallback((workspaceId: string, patch: Partial<ShotManualWorkspace>) => {
    setImportSession(current => current ? {
      ...current,
      workspaces: current.workspaces.map(workspace => workspace.id === workspaceId ? { ...workspace, ...patch } : workspace),
    } : current)
  }, [])

  const toggleImportWorkspace = useCallback((workspaceId: string, selected: boolean) => {
    setImportSession(current => current ? {
      ...current,
      workspaces: current.workspaces.map(workspace => workspace.id === workspaceId ? { ...workspace, selected } : workspace),
    } : current)
  }, [])

  const updateResourceSearch = useCallback((value: string) => {
    setResourceSearch(value)
    setResourcePage(1)
  }, [])

  const selectImportWorkspace = useCallback((workspaceId: string) => {
    setImportSession(current => current ? { ...current, activeWorkspaceId: workspaceId } : current)
  }, [])

  const setImportTargetGroupId = useCallback((targetGroupId: number | undefined) => {
    setImportSession(current => current ? { ...current, targetGroupId } : current)
  }, [])

  const setImportTargetGroupTitle = useCallback((targetGroupTitle: string) => {
    setImportSession(current => current ? { ...current, targetGroupTitle } : current)
  }, [])

  return {
    importDialogOpen,
    importSession,
    resourceSearch,
    resourcePage,
    selectedLibraryResource,
    resourcePageSize: RESOURCE_LIBRARY_PAGE_SIZE,
    closeImportDialog,
    openImportDialog: () => setImportDialogOpen(true),
    setImportDialogOpen,
    setImportSession,
    setResourcePage,
    setSelectedLibraryResource,
    startImportFromFile,
    startImportFromResource,
    updateResourceSearch,
    selectImportWorkspace,
    toggleImportWorkspace,
    updateImportWorkspace,
    setImportTargetGroupId,
    setImportTargetGroupTitle,
  }
}
