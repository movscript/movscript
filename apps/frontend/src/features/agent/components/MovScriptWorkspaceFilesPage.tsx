import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, FileText, Folder, HardDrive, Loader2, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
  AgentWorkspacesPageBody,
  AgentWorkspacesPageList,
  AgentWorkspacesPageMain,
  AgentWorkspacesPageSidebar,
  AgentWorkspacesPageSidebarControls,
  AppFeedbackText,
  Button,
} from '@movscript/ui'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import type {
  ElectronMovScriptWorkspaceFileEntry,
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFilesListResult,
  ElectronMovScriptWorkspaceRootResult,
} from '@/shared/contracts/electronApi'

export default function MovScriptWorkspaceFilesPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const initialPath = useMemo(() => normalizeRelativePath(searchParams.get('path')), [searchParams])
  const [currentPath, setCurrentPath] = useState(() => initialPath && !initialPath.endsWith('.json') ? initialPath : '')
  const [selectedPath, setSelectedPath] = useState<string | null>(() => initialPath && initialPath.endsWith('.json') ? initialPath : null)
  const [draft, setDraft] = useState('')
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const rootQuery = useQuery<ElectronMovScriptWorkspaceRootResult>({
    queryKey: ['movscript-workspace-root'],
    queryFn: () => requireWorkspaceRootAPI().getRoot(),
    retry: false,
  })
  const filesQuery = useQuery<ElectronMovScriptWorkspaceFilesListResult>({
    queryKey: ['movscript-workspace-files', currentPath],
    queryFn: () => requireWorkspaceFilesAPI().list({ path: currentPath }),
    retry: false,
  })
  const readQuery = useQuery<ElectronMovScriptWorkspaceFileReadResult>({
    queryKey: ['movscript-workspace-file', selectedPath],
    queryFn: () => requireWorkspaceFilesAPI().read({ path: selectedPath ?? '' }),
    enabled: Boolean(selectedPath),
    retry: false,
  })
  const writeMutation = useMutation({
    mutationFn: (input: { path: string; content: string }) => requireWorkspaceFilesAPI().write(input),
    onSuccess: (file) => {
      setSelectedPath(file.path)
      setDraft(file.content)
      setActionError(null)
      void queryClient.invalidateQueries({ queryKey: ['movscript-workspace-files'] })
      void queryClient.invalidateQueries({ queryKey: ['movscript-workspace-file', file.path] })
    },
    onError: (error) => setActionError(errorMessage(error)),
  })
  const deleteMutation = useMutation({
    mutationFn: (path: string) => requireWorkspaceFilesAPI().delete({ path }),
    onSuccess: (_result, path) => {
      setActionError(null)
      setDeleteConfirmPath(null)
      if (selectedPath === path || selectedPath?.startsWith(`${path}/`)) {
        setSelectedPath(null)
        setDraft('')
      }
      void queryClient.invalidateQueries({ queryKey: ['movscript-workspace-files'] })
    },
    onError: (error) => setActionError(errorMessage(error)),
  })

  const entries = filesQuery.data?.entries ?? []
  const selectedFile = readQuery.data
  const selectedName = selectedPath?.split('/').at(-1) || '未选择文件'
  const dirty = selectedFile ? draft !== selectedFile.content : false
  const parentPath = useMemo(() => parentRelativePath(currentPath), [currentPath])
  useEffect(() => {
    if (readQuery.data) setDraft(readQuery.data.content)
  }, [readQuery.data])

  useEffect(() => {
    if (!initialPath) return
    setActionError(null)
    setDeleteConfirmPath(null)
    if (initialPath.endsWith('.json')) {
      setCurrentPath(parentRelativePath(initialPath))
      setSelectedPath(initialPath)
      return
    }
    setCurrentPath(initialPath)
    setSelectedPath(null)
    setDraft('')
  }, [initialPath])

  function openEntry(entry: ElectronMovScriptWorkspaceFileEntry) {
    setActionError(null)
    setDeleteConfirmPath(null)
    if (entry.kind === 'directory') {
      setCurrentPath(entry.path)
      setSelectedPath(null)
      setDraft('')
      return
    }
    setSelectedPath(entry.path)
  }

  function createFile() {
    const name = window.prompt('文件名')
    const normalized = normalizeRelativeSegment(name)
    if (!normalized) return
    const path = currentPath ? `${currentPath}/${normalized}` : normalized
    writeMutation.mutate({ path, content: defaultFileContent(path) })
  }

  function saveSelectedFile() {
    if (!selectedPath) return
    writeMutation.mutate({ path: selectedPath, content: draft })
  }

  function deletePath(path: string) {
    if (deleteConfirmPath !== path) {
      setDeleteConfirmPath(path)
      return
    }
    deleteMutation.mutate(path)
  }

  function refreshWorkspace() {
    void rootQuery.refetch()
    void filesQuery.refetch()
    if (selectedPath) void queryClient.invalidateQueries({ queryKey: ['movscript-workspace-file', selectedPath] })
  }

  return (
    <AgentPageShell data-testid="movscript-workspace-files-page">
      <AgentPageShellHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <HardDrive size={18} />
                MovScript Workspace
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {workspacePathSummary(rootQuery.data, rootQuery.error)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={refreshWorkspace}>
                <RefreshCw size={14} />
                刷新
              </Button>
              <Button type="button" size="sm" onClick={createFile} disabled={writeMutation.isPending}>
                <Plus size={14} />
                新建文件
              </Button>
            </div>
          </div>
          <AgentConsoleNav compact />
        </div>
      </AgentPageShellHeader>
      <AgentWorkspacesPageBody>
        <AgentWorkspacesPageSidebar data-testid="movscript-workspace-files-sidebar">
          <AgentWorkspacesPageSidebarControls>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setCurrentPath(parentPath)} disabled={!currentPath}>
                <ChevronLeft size={14} />
              </Button>
              <div className="min-w-0 flex-1 truncate text-sm font-medium">
                /{filesQuery.data?.path || ''}
              </div>
            </div>
          </AgentWorkspacesPageSidebarControls>
          <AgentWorkspacesPageList>
            {filesQuery.isLoading ? (
              <StateRow icon={<Loader2 size={14} className="animate-spin" />} text="加载中" />
            ) : filesQuery.error ? (
              <StateRow text={errorMessage(filesQuery.error)} tone="danger" />
            ) : entries.length === 0 ? (
              <StateRow text="空目录" />
            ) : (
              <div className="space-y-1">
                {entries.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted ${selectedPath === entry.path ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
                    onClick={() => openEntry(entry)}
                  >
                    {entry.kind === 'directory' ? <Folder size={14} /> : <FileText size={14} />}
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{entry.kind === 'file' ? formatBytes(entry.size) : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </AgentWorkspacesPageList>
        </AgentWorkspacesPageSidebar>

        <AgentWorkspacesPageMain className="flex flex-col gap-3" data-testid="movscript-workspace-files-editor">
          <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{selectedName}</div>
                <div className="truncate text-xs text-muted-foreground">{selectedPath || '选择一个文件'}</div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => selectedPath && deletePath(selectedPath)} disabled={!selectedPath || deleteMutation.isPending}>
                  <Trash2 size={14} />
                  {deleteConfirmPath === selectedPath ? '确认删除' : '删除'}
                </Button>
                <Button type="button" size="sm" onClick={saveSelectedFile} disabled={!selectedPath || !dirty || writeMutation.isPending}>
                  <Save size={14} />
                  保存
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {readQuery.isLoading ? (
                <StateRow icon={<Loader2 size={14} className="animate-spin" />} text="读取中" />
              ) : readQuery.error ? (
                <StateRow text={errorMessage(readQuery.error)} tone="danger" />
              ) : selectedPath ? (
                <textarea
                  className="h-full min-h-[360px] w-full resize-none rounded border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground outline-none focus:border-primary"
                  value={draft}
                  spellCheck={false}
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : (
                <StateRow text="未选择文件" />
              )}
            </div>
            {(actionError || dirty || selectedFile) && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                {actionError ? (
                  <AppFeedbackText as="span">{actionError}</AppFeedbackText>
                ) : (
                  <span>{dirty ? '有未保存修改' : selectedFile ? `${formatBytes(selectedFile.size)} · ${formatTime(selectedFile.updatedAt)}` : ''}</span>
                )}
                {writeMutation.isPending && <span>保存中</span>}
              </div>
            )}
        </AgentWorkspacesPageMain>
      </AgentWorkspacesPageBody>
    </AgentPageShell>
  )
}

function StateRow({ icon, text, tone = 'muted' }: { icon?: ReactNode; text: string; tone?: 'muted' | 'danger' }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
      {icon}
      {tone === 'danger' ? <AppFeedbackText as="span">{text}</AppFeedbackText> : <span>{text}</span>}
    </div>
  )
}

function requireWorkspaceFilesAPI() {
  const api = window.api
  if (!api?.listMovScriptWorkspaceFiles || !api.readMovScriptWorkspaceFile || !api.writeMovScriptWorkspaceFile || !api.deleteMovScriptWorkspaceFile) {
    throw new Error('当前窗口没有 MovScript Workspace 文件管理能力')
  }
  return {
    list: api.listMovScriptWorkspaceFiles,
    read: api.readMovScriptWorkspaceFile,
    write: api.writeMovScriptWorkspaceFile,
    delete: api.deleteMovScriptWorkspaceFile,
  }
}

function requireWorkspaceRootAPI() {
  const api = window.api
  if (!api?.getMovScriptWorkspaceRoot) {
    throw new Error('当前窗口没有 MovScript Workspace Root 能力')
  }
  return {
    getRoot: api.getMovScriptWorkspaceRoot,
  }
}

function workspacePathSummary(root?: ElectronMovScriptWorkspaceRootResult, error?: unknown): string {
  if (root) return `${root.workspaceDir} / .movscript`
  return error ? errorMessage(error) : '加载 MovScript Workspace Root'
}

function parentRelativePath(path: string): string {
  const parts = path.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

function normalizeRelativeSegment(value: string | null): string {
  const trimmed = value?.trim().replace(/^[/\\]+/, '').replace(/\\/g, '/') ?? ''
  if (!trimmed || trimmed.includes('../') || trimmed === '..') return ''
  return trimmed
}

function normalizeRelativePath(value: string | null): string {
  const trimmed = value?.trim().replace(/^[/\\]+/, '').replace(/\\/g, '/') ?? ''
  if (!trimmed || trimmed.split('/').includes('..')) return ''
  return trimmed
}

function defaultFileContent(path: string): string {
  return path.endsWith('.json') ? '{\n  \n}\n' : ''
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
