import {
  useEffect,
  useMemo,
  useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query'
import { ChevronLeft,
  FileText,
  Folder,
  HardDrive,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Save,
  Trash2 } from 'lucide-react'
import {
  AgentPageShell,
  AgentPageShellHeader,
} from '@/features/agent/components/AgentPageUi'
import {
  AgentConsoleActionButton,
  AgentConsoleHeader,
  AgentConsoleHeaderActions,
  AgentConsoleHeaderCopy,
  AgentConsoleHeaderDescription,
  AgentConsoleHeaderTitle,
  AgentConsoleHeaderTitleRow,
  AgentConsoleStatusBadge,
} from '@/features/agent/components/AgentConsoleUi'
import {
  AgentWorkspaceEditorActions,
  AgentWorkspaceEditorBody,
  AgentWorkspaceEditorFooter,
  AgentWorkspaceEditorHeader,
  AgentWorkspaceEditorLayout,
  AgentWorkspaceEditorSubtitle,
  AgentWorkspaceEditorTextarea,
  AgentWorkspaceEditorTitle,
  AgentWorkspaceEditorTitleBlock,
  AgentWorkspaceListItemButton,
  AgentWorkspaceListItemContent,
  AgentWorkspaceListItemMeta,
  AgentWorkspaceListItemTitle,
  AgentWorkspaceListStack,
  AgentWorkspaceSidebarPathRow,
  AgentWorkspaceSidebarPathText,
  AgentWorkspaceStateRow,
  AgentWorkspaceStateSpinner,
  AgentWorkspacesPageBody,
  AgentWorkspacesPageList,
  AgentWorkspacesPageMain,
  AgentWorkspacesPageSidebar,
  AgentWorkspacesPageSidebarControls
} from '@/features/agent/components/AgentPageWorkspaceUi'
import { AppFeedbackText } from '@movscript/ui/business/app'
import { Button } from '@movscript/ui/primitives'
import { AgentConsoleNav } from '@/features/agent/components/AgentConsoleNav'
import { requireWorkspaceFilesAPI, requireWorkspaceRootAPI } from '@/features/agent/application/movScriptWorkspaceElectron'
import { movScriptWorkspaceKeys } from '@/features/agent/application/movScriptWorkspaceQueryKeys'
import { invalidateMovScriptWorkspaceMutationResult, workspaceFileChangedResult, workspaceFilesChangedResult } from '@/features/agent/application/movScriptWorkspaceMutationInvalidation'
import type {
  ElectronMovScriptWorkspaceFileEntry,
  ElectronMovScriptWorkspaceFileReadResult,
  ElectronMovScriptWorkspaceFilesListResult,
  ElectronMovScriptWorkspaceMediaFileReadResult,
  ElectronMovScriptWorkspaceRootResult,
} from '@/shared/contracts/electronApi'

export default function MovScriptWorkspaceFilesPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const initialPath = useMemo(() => normalizeRelativePath(searchParams.get('path')), [searchParams])
  const [currentPath, setCurrentPath] = useState(() => initialPath && !looksLikeFilePath(initialPath) ? initialPath : parentRelativePath(initialPath))
  const [selectedPath, setSelectedPath] = useState<string | null>(() => initialPath && looksLikeFilePath(initialPath) ? initialPath : null)
  const [draft, setDraft] = useState('')
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const rootQuery = useQuery<ElectronMovScriptWorkspaceRootResult>({
    queryKey: movScriptWorkspaceKeys.root,
    queryFn: () => requireWorkspaceRootAPI().getRoot(),
    retry: false,
  })
  const filesQuery = useQuery<ElectronMovScriptWorkspaceFilesListResult>({
    queryKey: movScriptWorkspaceKeys.files(currentPath),
    queryFn: () => requireWorkspaceFilesAPI().list({ path: currentPath }),
    retry: false,
  })
  const isSelectedImage = Boolean(selectedPath && isPreviewableImagePath(selectedPath))
  const readQuery = useQuery<ElectronMovScriptWorkspaceFileReadResult>({
    queryKey: movScriptWorkspaceKeys.file(selectedPath),
    queryFn: () => requireWorkspaceFilesAPI().read({ path: selectedPath ?? '' }),
    enabled: Boolean(selectedPath && !isSelectedImage),
    retry: false,
  })
  const mediaQuery = useQuery<ElectronMovScriptWorkspaceMediaFileReadResult>({
    queryKey: movScriptWorkspaceKeys.mediaPreview(selectedPath),
    queryFn: () => requireWorkspaceFilesAPI().readMedia({ path: selectedPath ?? '' }),
    enabled: Boolean(selectedPath && isSelectedImage),
    retry: false,
  })
  const writeMutation = useMutation({
    mutationFn: (input: { path: string; content: string }) => requireWorkspaceFilesAPI().write(input),
    onSuccess: (file) => {
      setSelectedPath(file.path)
      setDraft(file.content)
      setActionError(null)
      invalidateMovScriptWorkspaceMutationResult(queryClient, workspaceFilesChangedResult({ changedPaths: [file.path] }))
      invalidateMovScriptWorkspaceMutationResult(queryClient, workspaceFileChangedResult({ path: file.path }))
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
      invalidateMovScriptWorkspaceMutationResult(queryClient, workspaceFilesChangedResult({ changedPaths: [path] }))
    },
    onError: (error) => setActionError(errorMessage(error)),
  })

  const entries = filesQuery.data?.entries ?? []
  const selectedEntry = entries.find((entry) => entry.path === selectedPath)
  const selectedFile = readQuery.data
  const selectedName = selectedPath?.split('/').at(-1) || '未选择文件'
  const dirty = !isSelectedImage && selectedFile ? draft !== selectedFile.content : false
  const parentPath = useMemo(() => parentRelativePath(currentPath), [currentPath])
  useEffect(() => {
    if (readQuery.data) setDraft(readQuery.data.content)
  }, [readQuery.data])

  useEffect(() => {
    if (!initialPath) return
    setActionError(null)
    setDeleteConfirmPath(null)
    if (looksLikeFilePath(initialPath)) {
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
    if (selectedPath) invalidateMovScriptWorkspaceMutationResult(queryClient, workspaceFileChangedResult({ path: selectedPath }))
  }

  return (
    <AgentPageShell data-testid="movscript-workspace-files-page">
      <AgentPageShellHeader>
        <AgentConsoleHeader>
          <AgentConsoleHeaderCopy>
            <AgentConsoleHeaderTitleRow>
              <HardDrive size={18} />
              <AgentConsoleHeaderTitle>MovScript Workspace</AgentConsoleHeaderTitle>
              <AgentConsoleStatusBadge intent={rootQuery.error ? 'danger' : rootQuery.data ? 'success' : 'neutral'} emphasis="soft">
                {rootQuery.error ? 'Root 异常' : rootQuery.data ? '.movscript' : '加载中'}
              </AgentConsoleStatusBadge>
            </AgentConsoleHeaderTitleRow>
            <AgentConsoleHeaderDescription>
              {workspacePathSummary(rootQuery.data, rootQuery.error)}
            </AgentConsoleHeaderDescription>
          </AgentConsoleHeaderCopy>
          <AgentConsoleHeaderActions>
            <AgentConsoleActionButton type="button" variant="outline" size="sm" onClick={refreshWorkspace}>
              <RefreshCw size={14} />
              刷新
            </AgentConsoleActionButton>
            <AgentConsoleActionButton type="button" size="sm" onClick={createFile} disabled={writeMutation.isPending}>
              <Plus size={14} />
              新建文件
            </AgentConsoleActionButton>
          </AgentConsoleHeaderActions>
        </AgentConsoleHeader>
      </AgentPageShellHeader>

      <AgentConsoleNav compact />

      <AgentWorkspacesPageBody>
        <AgentWorkspacesPageSidebar data-testid="movscript-workspace-files-sidebar">
          <AgentWorkspacesPageSidebarControls>
            <AgentWorkspaceSidebarPathRow>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCurrentPath(parentPath)} disabled={!currentPath}>
                <ChevronLeft size={14} />
              </Button>
              <AgentWorkspaceSidebarPathText>
                /{filesQuery.data?.path || ''}
              </AgentWorkspaceSidebarPathText>
            </AgentWorkspaceSidebarPathRow>
          </AgentWorkspacesPageSidebarControls>
          <AgentWorkspacesPageList>
            {filesQuery.isLoading ? (
              <StateRow icon={<AgentWorkspaceStateSpinner />} text="加载中" />
            ) : filesQuery.error ? (
              <StateRow text={errorMessage(filesQuery.error)} tone="danger" />
            ) : entries.length === 0 ? (
              <StateRow text="空目录" />
            ) : (
              <AgentWorkspaceListStack>
                {entries.map((entry) => (
                  <AgentWorkspaceListItemButton
                    key={entry.path}
                    data-active={selectedPath === entry.path ? 'true' : undefined}
                    onClick={() => openEntry(entry)}
                  >
                    <AgentWorkspaceListItemContent>
                      {entry.kind === 'directory' ? <Folder size={14} /> : isPreviewableImagePath(entry.path) ? <ImageIcon size={14} /> : <FileText size={14} />}
                      <AgentWorkspaceListItemTitle>{entry.name}</AgentWorkspaceListItemTitle>
                      <AgentWorkspaceListItemMeta>{entry.kind === 'file' ? formatBytes(entry.size) : ''}</AgentWorkspaceListItemMeta>
                    </AgentWorkspaceListItemContent>
                  </AgentWorkspaceListItemButton>
                ))}
              </AgentWorkspaceListStack>
            )}
          </AgentWorkspacesPageList>
        </AgentWorkspacesPageSidebar>

        <AgentWorkspacesPageMain data-testid="movscript-workspace-files-editor">
          <AgentWorkspaceEditorLayout>
            <AgentWorkspaceEditorHeader>
              <AgentWorkspaceEditorTitleBlock>
                <AgentWorkspaceEditorTitle>{selectedName}</AgentWorkspaceEditorTitle>
                <AgentWorkspaceEditorSubtitle>{selectedPath || '选择一个文件'}</AgentWorkspaceEditorSubtitle>
              </AgentWorkspaceEditorTitleBlock>
              <AgentWorkspaceEditorActions>
                <Button type="button" variant="outline" size="sm" onClick={() => selectedPath && deletePath(selectedPath)} disabled={!selectedPath || deleteMutation.isPending}>
                  <Trash2 size={14} />
                  {deleteConfirmPath === selectedPath ? '确认删除' : '删除'}
                </Button>
                <Button type="button" size="sm" onClick={saveSelectedFile} disabled={!selectedPath || isSelectedImage || !dirty || writeMutation.isPending}>
                  <Save size={14} />
                  保存
                </Button>
              </AgentWorkspaceEditorActions>
            </AgentWorkspaceEditorHeader>
            <AgentWorkspaceEditorBody>
              {isSelectedImage ? (
                mediaQuery.isLoading ? (
                  <StateRow icon={<AgentWorkspaceStateSpinner />} text="读取图片中" />
                ) : mediaQuery.error ? (
                  <StateRow text={errorMessage(mediaQuery.error)} tone="danger" />
                ) : mediaQuery.data ? (
                  <div className="agent-workspace-image-preview">
                    <img src={mediaQuery.data.dataUrl} alt={selectedName} />
                  </div>
                ) : (
                  <StateRow text="无法预览图片" tone="danger" />
                )
              ) : readQuery.isLoading ? (
                <StateRow icon={<AgentWorkspaceStateSpinner />} text="读取中" />
              ) : readQuery.error ? (
                <StateRow text={errorMessage(readQuery.error)} tone="danger" />
              ) : selectedPath ? (
                <AgentWorkspaceEditorTextarea
                  value={draft}
                  spellCheck={false}
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : (
                <StateRow text="未选择文件" />
              )}
            </AgentWorkspaceEditorBody>
            {(actionError || dirty || selectedFile || mediaQuery.data || selectedEntry) && (
              <AgentWorkspaceEditorFooter>
                {actionError ? (
                  <AppFeedbackText as="span">{actionError}</AppFeedbackText>
                ) : (
                  <span>
                    {dirty
                      ? '有未保存修改'
                      : selectedFile
                        ? `${formatBytes(selectedFile.size)} · ${formatTime(selectedFile.updatedAt)}`
                        : mediaQuery.data
                          ? `${mediaQuery.data.mimeType} · ${formatBytes(mediaQuery.data.size)} · ${formatTime(mediaQuery.data.updatedAt)}`
                          : selectedEntry
                            ? `${formatBytes(selectedEntry.size)} · ${formatTime(selectedEntry.updatedAt)}`
                            : ''}
                  </span>
                )}
                {writeMutation.isPending && <span>保存中</span>}
              </AgentWorkspaceEditorFooter>
            )}
          </AgentWorkspaceEditorLayout>
        </AgentWorkspacesPageMain>
      </AgentWorkspacesPageBody>
    </AgentPageShell>
  )
}

function StateRow({ icon, text, tone = 'muted' }: { icon?: ReactNode; text: string; tone?: 'muted' | 'danger' }) {
  return (
    <AgentWorkspaceStateRow tone={tone}>
      {icon}
      {tone === 'danger' ? <AppFeedbackText as="span">{text}</AppFeedbackText> : <span>{text}</span>}
    </AgentWorkspaceStateRow>
  )
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

function looksLikeFilePath(path: string): boolean {
  return /(^|\/)[^/]+\.[a-z0-9]+$/i.test(path)
}

function isPreviewableImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(path)
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
