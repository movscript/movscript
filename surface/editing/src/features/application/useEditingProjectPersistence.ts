import { useCallback, useEffect, useRef } from 'react'

import {
  readEditingProjectRegistry,
  upsertEditingProjectSummary,
  writeEditingProjectRegistry,
  type EditingProjectSummary,
} from '@movscript/editing-surface/registry'
import {
  EDITING_AUTOSAVE_DELAY_MS,
  STANDALONE_EDITING_PROJECT_ID,
} from '../domain/constants'
import {
  normalizeEditingProjectCanvas,
  refreshTimelineDuration,
} from '../domain/project'
import { clampTimelineMs } from '../domain/timelineGeometry'
import type { EditingMediaAPI } from '../domain/types'
import type { ElectronMediaPipelineEditingProject } from '@movscript/editing-surface/contracts'
import { toast } from '@movscript/editing-surface/toast'

import { saveEditingProjectSnapshot } from './editingProjectSave'
import { useEditingSessionStore } from './editingSessionStore'

type CommitProjectChangeOptions = {
  selectedClipId?: string
  playheadMs?: number
  dirty?: boolean
}

export function useEditingProjectPersistence({
  editingProjectId,
  mediaAPI,
  resetWorkspaceViewState,
}: {
  editingProjectId: string | undefined
  mediaAPI: EditingMediaAPI | undefined
  resetWorkspaceViewState: () => void
}) {
  const pendingSaveRevisionRef = useRef<number | null>(null)
  const activeProjectRef = useRef<ElectronMediaPipelineEditingProject | null>(null)
  const isDirtyRef = useRef(false)
  const editGenerationRef = useRef(0)
  const saveQueueRef = useRef<Promise<ElectronMediaPipelineEditingProject | undefined>>(Promise.resolve(undefined))
  const activeProject = useEditingSessionStore((state) => state.activeProject)
  const isDirty = useEditingSessionStore((state) => state.isDirty)
  const saveState = useEditingSessionStore((state) => state.saveState)
  const setActiveProject = useEditingSessionStore((state) => state.setActiveProject)
  const setSelectedClipId = useEditingSessionStore((state) => state.setSelectedClipId)
  const setPlayheadMs = useEditingSessionStore((state) => state.setPlayheadMs)
  const setSaveState = useEditingSessionStore((state) => state.setSaveState)
  const setEditingDirtyState = useEditingSessionStore((state) => state.setDirty)

  useEffect(() => {
    activeProjectRef.current = activeProject
  }, [activeProject])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    if (saveState.status === 'saved' && saveState.message) {
      toast.success(saveState.message)
    }
    if (saveState.status === 'error' && saveState.message) {
      toast.error('剪辑保存失败', saveState.message)
    }
    if (saveState.status === 'conflict' && saveState.message) {
      toast.error('剪辑保存冲突', saveState.message)
    }
  }, [saveState])

  const setActiveEditingProject = useCallback((project: ElectronMediaPipelineEditingProject | null) => {
    activeProjectRef.current = project
    setActiveProject(project)
  }, [setActiveProject])

  const setEditingDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty
    setEditingDirtyState(dirty)
  }, [setEditingDirtyState])

  const rememberSavedProject = useCallback((
    savedProject: ElectronMediaPipelineEditingProject,
    projectPath: string | undefined,
    fallbackUpdatedAt: string,
  ) => {
    const nextProjects = upsertEditingProjectSummary(readEditingProjectRegistry(), {
      id: savedProject.id,
      projectId: savedProject.projectId,
      title: savedProject.title,
      updatedAt: savedProject.updatedAt ?? fallbackUpdatedAt,
      projectPath,
      snapshot: savedProject,
    })
    writeEditingProjectRegistry(nextProjects)
  }, [])

  const runProjectSave = useCallback(async (
    project: ElectronMediaPipelineEditingProject,
    options: { auto?: boolean },
  ) => {
    const projectToSave = activeProjectRef.current ?? project
    if (!projectToSave) return undefined
    if (!isDirtyRef.current && activeProjectRef.current === projectToSave) {
      if (!options.auto) setSaveState({ status: 'saved', message: '已保存到本机剪辑工作区' })
      return projectToSave
    }
    setSaveState({ status: 'saving', message: options.auto ? '正在自动保存' : undefined })
    try {
      const saveGeneration = editGenerationRef.current
      const outcome = await saveEditingProjectSnapshot({
        project: projectToSave,
        mediaAPI,
        onAttempt: (attemptProject) => {
          pendingSaveRevisionRef.current = attemptProject.revision ?? null
        },
      })
      if (outcome.status === 'conflict') {
        pendingSaveRevisionRef.current = null
        setEditingDirty(true)
        setSaveState({ status: 'conflict', message: outcome.result.message || '剪辑项目版本已变化，保存已取消' })
        return undefined
      }
      const savedProject = outcome.editingProject
      pendingSaveRevisionRef.current = savedProject.revision ?? null
      rememberSavedProject(savedProject, outcome.projectPath, outcome.updatedAt)
      const currentProject = activeProjectRef.current
      const isCurrentProject = currentProject?.id === savedProject.id && currentProject.projectId === savedProject.projectId
      if (isCurrentProject && editGenerationRef.current === saveGeneration) {
        setActiveEditingProject(savedProject)
        setEditingDirty(false)
        setSaveState({ status: 'saved', message: outcome.nativeResult ? (options.auto ? '已自动保存' : '已保存到本机剪辑工作区') : '已保存到浏览器本地记录' })
      } else if (isCurrentProject) {
        setEditingDirty(true)
        setSaveState({ status: 'idle' })
      }
      pendingSaveRevisionRef.current = null
      return savedProject
    } catch (error) {
      pendingSaveRevisionRef.current = null
      setSaveState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }, [mediaAPI, rememberSavedProject, setActiveEditingProject, setEditingDirty, setSaveState])

  const saveProject = useCallback(async (
    project: ElectronMediaPipelineEditingProject | null = activeProjectRef.current,
    options: { auto?: boolean } = {},
  ) => {
    const requestedProject = project ?? activeProjectRef.current
    if (!requestedProject) return undefined
    const queuedSave = saveQueueRef.current.then(
      () => runProjectSave(requestedProject, options),
      () => runProjectSave(requestedProject, options),
    )
    saveQueueRef.current = queuedSave.catch(() => undefined)
    return queuedSave
  }, [runProjectSave])

  const openProject = useCallback(async (project: EditingProjectSummary) => {
    setSaveState({ status: 'idle' })
    if (mediaAPI?.getMediaEditingProject) {
      const result = await mediaAPI.getMediaEditingProject({
        projectId: project.projectId,
        editingProjectId: project.id,
      })
      if (result.status === 'ok') {
        setActiveEditingProject(normalizeEditingProjectCanvas(result.editingProject ?? result.editing_project))
        resetWorkspaceViewState()
        setEditingDirty(false)
        return
      }
    }
    if (project.snapshot) {
      setActiveEditingProject(normalizeEditingProjectCanvas(project.snapshot))
      resetWorkspaceViewState()
      setEditingDirty(false)
      return
    }
    setSaveState({ status: 'error', message: '未找到本地剪辑项目文件' })
  }, [mediaAPI, resetWorkspaceViewState, setActiveEditingProject, setEditingDirty, setSaveState])

  const commitProjectChange = useCallback((
    project: ElectronMediaPipelineEditingProject,
    options: CommitProjectChangeOptions = {},
  ) => {
    const nextProject = refreshTimelineDuration(normalizeEditingProjectCanvas(project))
    setActiveEditingProject(nextProject)
    if (options.selectedClipId !== undefined) setSelectedClipId(options.selectedClipId)
    if (options.playheadMs !== undefined) setPlayheadMs(clampTimelineMs(options.playheadMs, Math.max(nextProject.timeline.durationMs ?? 0, 0)))
    if (options.dirty !== false) {
      editGenerationRef.current += 1
      setEditingDirty(true)
      if (saveState.status === 'saved') setSaveState({ status: 'idle' })
    }
  }, [saveState.status, setActiveEditingProject, setEditingDirty, setPlayheadMs, setSaveState, setSelectedClipId])

  useEffect(() => {
    if (!editingProjectId) return
    const registry = readEditingProjectRegistry()
    const project = registry.find((candidate) => candidate.id === editingProjectId)
    if (project) {
      void openProject(project)
      return
    }
    void openProject({
      id: editingProjectId,
      projectId: STANDALONE_EDITING_PROJECT_ID,
      title: editingProjectId,
      updatedAt: new Date().toISOString(),
    })
  }, [editingProjectId, openProject])

  useEffect(() => {
    if (!activeProject || !isDirty) return undefined
    const timeout = window.setTimeout(() => {
      void saveProject(activeProject, { auto: true })
    }, EDITING_AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [activeProject, isDirty, saveProject])

  useEffect(() => {
    if (!activeProject || !mediaAPI?.onMediaEditingProjectEvent) return undefined
    return mediaAPI.onMediaEditingProjectEvent((event) => {
      const eventProjectId = event.projectId ?? event.project_id
      const eventEditingProjectId = event.editingProjectId ?? event.editing_project_id
      if (eventProjectId !== activeProject.projectId || eventEditingProjectId !== activeProject.id) return
      const eventProject = normalizeEditingProjectCanvas(event.editingProject ?? event.editing_project)
      const eventRevision = eventProject.revision ?? event.revision ?? 0
      const activeRevision = activeProject.revision ?? 0
      if (eventRevision <= activeRevision) return
      const isPendingSaveEvent = pendingSaveRevisionRef.current === eventRevision
      if (isDirty) {
        if (!isPendingSaveEvent) {
          setSaveState({ status: 'conflict', message: '剪辑项目已被外部更新；请重新载入后再保存本地修改' })
        }
        return
      }
      setActiveEditingProject(eventProject)
      setEditingDirty(false)
      setSaveState((current) => current.status === 'saving' ? current : { status: 'saved', message: '已同步外部剪辑更新' })
      const nextProjects = upsertEditingProjectSummary(readEditingProjectRegistry(), {
        id: eventProject.id,
        projectId: eventProject.projectId,
        title: eventProject.title,
        updatedAt: eventProject.updatedAt ?? new Date().toISOString(),
        projectPath: event.projectPath ?? event.project_path,
        snapshot: eventProject,
      })
      writeEditingProjectRegistry(nextProjects)
    })
  }, [activeProject, isDirty, mediaAPI, setActiveEditingProject, setEditingDirty, setSaveState])

  return {
    commitProjectChange,
    saveProject,
    setActiveEditingProject,
  }
}
