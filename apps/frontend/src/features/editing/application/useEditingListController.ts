import { useEffect, useState } from 'react'

import {
  readEditingProjectRegistry,
  upsertEditingProjectSummary,
  writeEditingProjectRegistry,
  type EditingProjectSummary,
} from '@/features/app-shell/application/editingProjectRegistry'
import { editingProjectPath } from '@/routes/appRouteModel'
import { openEditingProjectWindow } from '@/shared/infrastructure/appWindowContext'
import { readMediaAPI } from './browser'
import {
  createEmptyEditingProject,
  EDITING_CANVAS_PRESETS,
  editingProjectStoreResultToSummary,
  type EditingCanvasPresetId,
  type EditingListState,
} from './editingListModel'

export function useEditingListController() {
  const [projectTitle, setProjectTitle] = useState('未命名剪辑')
  const [projects, setProjects] = useState<EditingProjectSummary[]>([])
  const [state, setState] = useState<EditingListState>({ status: 'idle' })
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [renamingProjectId, setRenamingProjectId] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [canvasPresetId, setCanvasPresetId] = useState<EditingCanvasPresetId>('16:9')
  const mediaAPI = readMediaAPI()

  useEffect(() => {
    let cancelled = false
    async function loadProjects() {
      const registryProjects = readEditingProjectRegistry()
      if (!mediaAPI?.listMediaEditingProjects) {
        setProjects(registryProjects)
        return
      }
      try {
        const result = await mediaAPI.listMediaEditingProjects()
        if (cancelled) return
        const storedProjects = result.projects.map(editingProjectStoreResultToSummary)
        setProjects(storedProjects)
        writeEditingProjectRegistry(storedProjects)
      } catch {
        if (!cancelled) setProjects(registryProjects)
      }
    }
    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [mediaAPI])

  useEffect(() => {
    if (!mediaAPI?.onMediaEditingProjectEvent) return undefined
    return mediaAPI.onMediaEditingProjectEvent((event) => {
      const eventProject = event.editingProject ?? event.editing_project
      if (!eventProject?.id) return
      setProjects((currentProjects) => {
        const nextProjects = upsertEditingProjectSummary(currentProjects, {
          id: eventProject.id,
          projectId: eventProject.projectId,
          title: eventProject.title,
          updatedAt: eventProject.updatedAt ?? new Date().toISOString(),
          projectPath: event.projectPath ?? event.project_path,
          snapshot: eventProject,
        })
        writeEditingProjectRegistry(nextProjects)
        return nextProjects
      })
    })
  }, [mediaAPI])

  async function createAndOpenProject() {
    if (!projectTitle.trim()) return
    setState({ status: 'creating', message: '正在创建剪辑项目' })
    try {
      const preset = EDITING_CANVAS_PRESETS.find((candidate) => candidate.id === canvasPresetId) ?? EDITING_CANVAS_PRESETS[0]
      const project = createEmptyEditingProject(projectTitle, preset)
      const result = mediaAPI?.saveMediaEditingProject
        ? await mediaAPI.saveMediaEditingProject({ editingProject: project })
        : undefined
      if (result?.status === 'conflict') {
        setState({ status: 'error', message: result.message || '剪辑项目版本已变化，创建已取消' })
        return
      }
      const savedProject = result?.editingProject ?? result?.editing_project ?? project
      const nextProjects = upsertEditingProjectSummary(projects, {
        id: savedProject.id,
        projectId: savedProject.projectId,
        title: savedProject.title,
        updatedAt: savedProject.updatedAt ?? new Date().toISOString(),
        projectPath: result?.projectPath ?? result?.project_path,
        snapshot: savedProject,
      })
      setProjects(nextProjects)
      writeEditingProjectRegistry(nextProjects)
      setShowCreateDialog(false)
      setProjectTitle('未命名剪辑')
      setState({ status: 'idle' })
      await openEditingProject(savedProject.id, savedProject.title)
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  async function openEditingProject(editingProjectId: string, title?: string) {
    await openEditingProjectWindow({
      editingProjectId,
      title,
      route: editingProjectPath(editingProjectId),
    })
  }

  async function deleteProject(project: EditingProjectSummary) {
    try {
      await mediaAPI?.deleteMediaEditingProject?.({
        editingProjectId: project.id,
      })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      return
    }
    const nextProjects = projects.filter((candidate) => candidate.id !== project.id)
    setProjects(nextProjects)
    writeEditingProjectRegistry(nextProjects)
  }

  function openCreateDialog() {
    setState({ status: 'idle' })
    setShowCreateDialog(true)
  }

  function handleCreateDialogOpenChange(open: boolean) {
    if (state.status === 'creating') return
    setShowCreateDialog(open)
    if (open) setState({ status: 'idle' })
  }

  function startRenameProject(project: EditingProjectSummary) {
    setRenamingProjectId(project.id)
    setRenameTitle(project.title)
  }

  function cancelRenameProject() {
    setRenamingProjectId('')
    setRenameTitle('')
  }

  async function commitRenameProject(project: EditingProjectSummary) {
    const title = renameTitle.trim()
    if (!title) return
    if (title === project.title) {
      cancelRenameProject()
      return
    }
    try {
      const now = new Date().toISOString()
      const nextSnapshot = project.snapshot
        ? {
          ...project.snapshot,
          title,
          updatedAt: now,
          revision: (project.snapshot.revision ?? 0) + 1,
        }
        : undefined
      const result = nextSnapshot && mediaAPI?.saveMediaEditingProject
        ? await mediaAPI.saveMediaEditingProject({ editingProject: nextSnapshot, expectedRevision: project.snapshot?.revision })
        : undefined
      if (result?.status === 'conflict') {
        setState({ status: 'error', message: result.message || '剪辑项目版本已变化，重命名已取消' })
        return
      }
      const savedProject = result?.editingProject ?? result?.editing_project ?? nextSnapshot
      const nextProjects = projects.map((candidate) => {
        if (candidate.id !== project.id) return candidate
        return {
          ...candidate,
          title: savedProject?.title ?? title,
          updatedAt: savedProject?.updatedAt ?? now,
          projectPath: result?.projectPath ?? result?.project_path ?? candidate.projectPath,
          snapshot: savedProject ?? candidate.snapshot,
        }
      })
      setProjects(nextProjects)
      writeEditingProjectRegistry(nextProjects)
      cancelRenameProject()
      setState({ status: 'idle' })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return {
    canvasPresetId,
    commitRenameProject,
    createAndOpenProject,
    deleteProject,
    handleCreateDialogOpenChange,
    openCreateDialog,
    openEditingProject,
    projectTitle,
    projects,
    renameTitle,
    renamingProjectId,
    setCanvasPresetId,
    setProjectTitle,
    setRenameTitle,
    setShowCreateDialog,
    showCreateDialog,
    startRenameProject,
    cancelRenameProject,
    state,
  }
}
