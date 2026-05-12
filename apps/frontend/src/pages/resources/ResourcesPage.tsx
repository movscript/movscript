import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RawResource, ResourceFolder, ResourceFolderPermission, User, PaginatedResponse } from '@/types'
import {
  Upload, Trash2, Search, Image as ImageIcon, Video, FileAudio, File,
  FolderPlus, Folder, FolderOpen, Share2,
  ChevronRight, MoreHorizontal, Globe, MoveRight,
  ShieldCheck, Pencil, Eye, PenLine, X as XIcon,
  LayoutGrid, List, ChevronLeft, Download, FileText,
} from 'lucide-react'
import { MediaViewer, downloadResource, resolveResourceUrl } from '@/components/shared/MediaViewer'
import { ResourceListItem } from '@/components/shared/ResourcePanel'
import { Button } from '@movscript/ui'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useTranslation } from 'react-i18next'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'

type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'text'
type Tab = 'mine' | 'shared'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'image': return <ImageIcon size={13} />
    case 'video': return <Video size={13} />
    case 'audio': return <FileAudio size={13} />
    case 'text': return <FileText size={13} />
    default: return <File size={13} />
  }
}

const TYPE_TABS: { labelKey: string; value: TypeFilter }[] = [
  { labelKey: 'common.all', value: 'all' },
  { labelKey: 'pages.resources.types.image', value: 'image' },
  { labelKey: 'pages.resources.types.video', value: 'video' },
  { labelKey: 'pages.resources.types.audio', value: 'audio' },
  { labelKey: 'pages.resources.types.text', value: 'text' },
]

// ─── Folder Dialog ────────────────────────────────────────────────────────────
function FolderDialog({
  open,
  onClose,
  editFolder,
}: {
  open: boolean
  onClose: () => void
  editFolder?: ResourceFolder | null
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(editFolder?.name ?? '')
  const [isShared, setIsShared] = useState(editFolder?.is_shared ?? false)

  const save = useMutation({
    mutationFn: () => {
      const body = { name, is_shared: isShared }
      return editFolder
        ? api.put(`/resource-folders/${editFolder.ID}`, body)
        : api.post('/resource-folders', body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resource-folders'] })
      onClose()
    },
  })

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-80 z-50">
          <Dialog.Title className="text-sm font-semibold mb-4">
            {editFolder ? t('pages.resources.editFolder') : t('pages.resources.newFolder')}
          </Dialog.Title>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('forms.name')}</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={t('pages.resources.folderNamePlaceholder')}
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={isShared}
                onChange={e => setIsShared(e.target.checked)}
                className="rounded"
              />
              <Globe size={13} className="text-muted-foreground" />
              {t('pages.resources.enableSharingVisible')}
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Permissions Dialog ───────────────────────────────────────────────────────
function PermissionsDialog({ folder, onClose }: { folder: ResourceFolder; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [searchQ, setSearchQ] = useState('')
  const [localIsShared, setLocalIsShared] = useState(folder.is_shared)

  const { data: perms = [] } = useQuery<ResourceFolderPermission[]>({
    queryKey: ['folder-permissions', folder.ID],
    queryFn: () => api.get(`/resource-folders/${folder.ID}/permissions`).then(r => r.data),
  })

  const { data: searchResults = [] } = useQuery<User[]>({
    queryKey: ['users-search', searchQ],
    queryFn: () => api.get(`/users?q=${encodeURIComponent(searchQ)}`).then(r => r.data),
    enabled: searchQ.trim().length > 0,
  })

  const existingUserIds = new Set(perms.map(p => p.user_id))

  const toggleShared = useMutation({
    mutationFn: (v: boolean) => api.put(`/resource-folders/${folder.ID}`, { is_shared: v }),
    onSuccess: (_, v) => {
      setLocalIsShared(v)
      qc.invalidateQueries({ queryKey: ['resource-folders'] })
    },
  })

  const grant = useMutation({
    mutationFn: ({ userId, permission }: { userId: number; permission: string }) =>
      api.post(`/resource-folders/${folder.ID}/permissions`, { user_id: userId, permission }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folder-permissions', folder.ID] }),
  })

  const revoke = useMutation({
    mutationFn: (userId: number) =>
      api.delete(`/resource-folders/${folder.ID}/permissions/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folder-permissions', folder.ID] }),
  })

  const PERM_LABELS = { read: t('pages.resources.permissions.read'), write: t('pages.resources.permissions.write') }
  const PERM_ICONS = { read: <Eye size={11} />, write: <PenLine size={11} /> }

  return (
    <Dialog.Root open onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-96 z-50 max-h-[80vh] flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-primary" />
            <Dialog.Title className="text-sm font-semibold flex-1">{t('pages.resources.permissionSettingsTitle', { name: folder.name })}</Dialog.Title>
            <Dialog.Close className="text-muted-foreground hover:text-foreground">
              <XIcon size={14} />
            </Dialog.Close>
          </div>

          {/* Sharing toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div>
              <p className="text-xs font-medium">{t('pages.resources.enableSharing')}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('pages.resources.enableSharingHint')}</p>
            </div>
            <button
              onClick={() => toggleShared.mutate(!localIsShared)}
              className={`relative w-10 h-5 rounded-full transition-colors ${localIsShared ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${localIsShared ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {localIsShared && (
            <>
              {/* Current permission list */}
              <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                <p className="text-[11px] text-muted-foreground font-medium mb-1">{t('pages.resources.authorizedUsers')}</p>
                {perms.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 py-2 text-center">{t('pages.resources.noAuthorizedUsers')}</p>
                ) : (
                  perms.map(p => (
                    <div key={p.ID} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
                      <span className="text-xs font-medium flex-1 truncate">{p.user?.username ?? t('pages.resources.userFallback', { id: p.user_id })}</span>
                      {/* Toggle permission */}
                      <button
                        onClick={() => grant.mutate({ userId: p.user_id, permission: p.permission === 'read' ? 'write' : 'read' })}
                        className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors"
                        title={t('pages.resources.togglePermissionTitle')}
                      >
                        {PERM_ICONS[p.permission]}
                        {PERM_LABELS[p.permission]}
                      </button>
                      {/* Revoke */}
                      <button
                        onClick={() => revoke.mutate(p.user_id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title={t('pages.resources.removePermissionTitle')}
                      >
                        <XIcon size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add user */}
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium">{t('pages.resources.addUser')}</p>
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQ}
                    onChange={e => setSearchQ(e.target.value)}
                    placeholder={t('pages.resources.searchUsersPlaceholder')}
                    className="w-full pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {searchResults.map(u => {
                      const already = existingUserIds.has(u.ID)
                      return (
                        <div key={u.ID} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background text-xs">
                          <span className="flex-1 truncate">{u.username}</span>
                          {already ? (
                            <span className="text-muted-foreground text-[11px]">{t('pages.resources.alreadyAdded')}</span>
                          ) : (
                            <div className="flex gap-1">
                              <button
                                onClick={() => { grant.mutate({ userId: u.ID, permission: 'read' }); setSearchQ('') }}
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <Eye size={10} /> {t('pages.resources.permissions.read')}
                              </button>
                              <button
                                onClick={() => { grant.mutate({ userId: u.ID, permission: 'write' }); setSearchQ('') }}
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                              >
                                <PenLine size={10} /> {t('pages.resources.permissions.write')}
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Move to Folder Dialog ───────────────────────────────────────────────────
function MoveDialog({
  resource,
  folders,
  onClose,
}: {
  resource: RawResource
  folders: ResourceFolder[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  // null = root (unfiled), number = folder ID
  const [targetFolder, setTargetFolder] = useState<number | null>(resource.folder_id ?? null)

  const move = useMutation({
    mutationFn: () =>
      api.put(`/resources/${resource.ID}`, { folder_id: targetFolder ?? 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      onClose()
    },
  })

  return (
    <Dialog.Root open onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-72 z-50">
          <Dialog.Title className="text-sm font-semibold mb-4">{t('pages.resources.moveToFolder')}</Dialog.Title>
          <p className="text-xs text-muted-foreground mb-3 truncate" title={resource.name}>{resource.name}</p>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            <FolderOption
              label={t('pages.resources.unfiledRoot')}
              selected={targetFolder === null}
              onClick={() => setTargetFolder(null)}
            />
            {folders.map(f => (
              <FolderOption
                key={f.ID}
                label={f.name}
                selected={targetFolder === f.ID}
                isShared={f.is_shared}
                onClick={() => setTargetFolder(f.ID)}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => move.mutate()} disabled={move.isPending}>
              {move.isPending ? t('pages.resources.moving') : t('pages.resources.move')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Rename Resource Dialog ──────────────────────────────────────────────────
function RenameResourceDialog({
  resource,
  onClose,
}: {
  resource: RawResource
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [name, setName] = useState(resource.name)

  const rename = useMutation({
    mutationFn: () => api.put(`/resources/${resource.ID}`, { name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      onClose()
    },
  })

  return (
    <Dialog.Root open onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-xl p-6 w-80 z-50">
          <Dialog.Title className="text-sm font-semibold mb-4">{t('pages.resources.renameResource')}</Dialog.Title>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('forms.name')}</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && name.trim()) rename.mutate()
              }}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={() => rename.mutate()} disabled={!name.trim() || rename.isPending}>
              {rename.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function FolderOption({ label, selected, isShared, onClick }: {
  label: string; selected: boolean; isShared?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors text-left ${
        selected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
      }`}
    >
      <Folder size={12} />
      <span className="flex-1 truncate">{label}</span>
      {isShared && <Globe size={10} className={selected ? 'opacity-70' : 'text-blue-400'} />}
    </button>
  )
}

// ─── Resource Card ────────────────────────────────────────────────────────────
function ResourceCard({
  resource,
  onDelete,
  onMove,
  onRename,
  onDownload,
  isSharedView,
}: {
  resource: RawResource
  onDelete?: () => void
  onMove: () => void
  onRename: () => void
  onDownload: () => void
  isSharedView?: boolean
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className="group relative flex cursor-grab flex-col gap-1.5 active:cursor-grabbing"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/resource-id', String(resource.ID))
        event.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
        event.dataTransfer.effectAllowed = 'copy'
      }}
      title={t('shared.resourcePanel.previewDragTitle')}
    >
      {/* Preview */}
      <div className="aspect-square relative">
        {resource.type === 'image' || resource.type === 'video' || resource.type === 'audio' || resource.type === 'text' ? (
          <MediaViewer resource={resource} className="w-full h-full" />
        ) : (
          <div className="w-full h-full rounded-lg bg-muted flex items-center justify-center">
            <TypeIcon type={resource.type} />
          </div>
        )}

        {/* Action menu */}
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title={t('pages.resources.actions')}
            >
              <MoreHorizontal size={12} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-36 z-50 text-sm"
              align="end"
              sideOffset={4}
            >
              <DropdownMenu.Item
                className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                onSelect={onDownload}
              >
                <Download size={13} />
                {t('shared.mediaViewer.download')}
              </DropdownMenu.Item>
              {!isSharedView && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={onRename}
                >
                  <Pencil size={13} />
                  {t('pages.resources.renameResource')}
                </DropdownMenu.Item>
              )}
              {!isSharedView && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={onMove}
                >
                  <MoveRight size={13} />
                  {t('pages.resources.moveToFolder')}
                </DropdownMenu.Item>
              )}
              {!isSharedView && onDelete && (
                <>
                  <DropdownMenu.Separator className="my-1 border-t border-border" />
                  <DropdownMenu.Item
                    className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-destructive"
                    onSelect={onDelete}
                  >
                    <Trash2 size={13} />
                    {t('common.delete')}
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Shared badge */}
        {resource.is_shared && (
          <div className="absolute bottom-1 right-1">
            <span title={t('pages.resources.sharedTitle')}><Share2 size={10} className="text-blue-400" /></span>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-1 text-muted-foreground/70">
        <TypeIcon type={resource.type} />
        <span className="text-xs truncate flex-1" title={resource.name}>{resource.name}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground/50">{formatBytes(resource.size)}</span>
        {isSharedView && resource.owner && (
          <span className="text-xs text-muted-foreground/50 truncate ml-1">{resource.owner.username}</span>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResourcesPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('mine')
  const [filter, setFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  // selectedFolder: null=all, 'root'=unfiled, number=folder ID
  // selectedFolderTab: which sidebar section the selected folder belongs to
  const [selectedFolder, setSelectedFolder] = useState<number | 'root' | null>(null)
  const [selectedFolderTab, setSelectedFolderTab] = useState<'mine' | 'shared'>('mine')
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; folder?: ResourceFolder | null }>({ open: false })
  const [moveResource, setMoveResource] = useState<RawResource | null>(null)
  const [renameResource, setRenameResource] = useState<RawResource | null>(null)
  const [permissionsFolder, setPermissionsFolder] = useState<ResourceFolder | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)
  const pageSize = 30

  // My folders
  const { data: myFolders = [] } = useQuery<ResourceFolder[]>({
    queryKey: ['resource-folders', 'mine'],
    queryFn: () => api.get('/resource-folders').then(r => r.data),
  })

  // Shared folders from other users
  const { data: sharedFolders = [] } = useQuery<ResourceFolder[]>({
    queryKey: ['resource-folders', 'shared'],
    queryFn: () => api.get('/resource-folders?shared=true').then(r => r.data),
  })

  const deleteFolder = useMutation({
    mutationFn: (id: number) => api.delete(`/resource-folders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resource-folders'] })
      if (typeof selectedFolder === 'number') setSelectedFolder(null)
    },
  })

  // Resources: personal or shared, with optional folder filter
  const folderParam = selectedFolder === 'root' ? 'root' : selectedFolder != null ? String(selectedFolder) : undefined
  const { data: resourcesData, isLoading } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', tab, folderParam, selectedFolderTab, filter, search, page],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('page_size', String(pageSize))
      if (tab === 'shared' || (selectedFolderTab === 'shared' && selectedFolder != null)) {
        params.set('shared', 'true')
      }
      if (folderParam && !(tab === 'shared' && !selectedFolder)) {
        params.set('folder_id', folderParam)
      }
      // When showing all shared (no folder selected), don't pass folder_id
      if (tab === 'shared' && selectedFolder === null) {
        params.delete('folder_id')
      }
      if (filter !== 'all') params.set('type', filter)
      if (search.trim()) params.set('q', search.trim())
      return api.get(`/resources?${params}`).then(r => r.data)
    },
  })
  const resources = resourcesData?.items ?? []
  const total = resourcesData?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      if (typeof selectedFolder === 'number' && selectedFolderTab === 'mine') {
        fd.append('folder_id', String(selectedFolder))
      }
      return api.post('/resources/upload', fd).then(r => r.data as RawResource)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/resources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resources'] }),
  })

  const isSharedView = tab === 'shared' || selectedFolderTab === 'shared'

  const visible = resources

  const currentFolderLabel = () => {
    if (selectedFolder === 'root') return t('pages.resources.unfiled')
    if (typeof selectedFolder === 'number') {
      const inMine = myFolders.find(f => f.ID === selectedFolder)
      if (inMine) return inMine.name
      const inShared = sharedFolders.find(f => f.ID === selectedFolder)
      if (inShared) return t('pages.resources.sharedFolderWithOwner', { name: inShared.name, owner: inShared.owner?.username ?? t('pages.resources.otherUser') })
    }
    return null
  }

  function selectMyFolder(id: number | 'root' | null) {
    setSelectedFolder(id)
    setSelectedFolderTab('mine')
    setTab('mine')
    setPage(1)
  }

  function selectSharedFolder(id: number) {
    setSelectedFolder(id)
    setSelectedFolderTab('shared')
    setTab('shared')
    setPage(1)
  }

  return (
    <div className="flex h-full">
      {/* Sidebar — folder tree */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col bg-background">
        {/* My Folders section */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50">
          <span className="text-xs font-semibold text-foreground">{t('pages.resources.myFolders')}</span>
          <button
            onClick={() => setFolderDialog({ open: true, folder: null })}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title={t('pages.resources.newFolder')}
          >
            <FolderPlus size={13} />
          </button>
        </div>

        <div className="overflow-y-auto py-1 border-b border-border">
          <FolderItem
            label={t('pages.resources.allResources')}
            icon={<Folder size={13} />}
            active={selectedFolder === null && tab === 'mine'}
            onClick={() => selectMyFolder(null)}
          />
          <FolderItem
            label={t('pages.resources.unfiled')}
            icon={<Folder size={13} />}
            active={selectedFolder === 'root' && tab === 'mine'}
            onClick={() => selectMyFolder('root')}
          />
          {myFolders.map(f => (
            <FolderItem
              key={f.ID}
              label={f.name}
              icon={selectedFolder === f.ID && tab === 'mine' ? <FolderOpen size={13} /> : <Folder size={13} />}
              active={selectedFolder === f.ID && tab === 'mine'}
              onClick={() => selectMyFolder(f.ID)}
              badge={f.resource_count > 0 ? f.resource_count : undefined}
              isShared={f.is_shared}
              onEdit={() => setFolderDialog({ open: true, folder: f })}
              onDelete={() => deleteFolder.mutate(f.ID)}
              onPermissions={() => setPermissionsFolder(f)}
            />
          ))}
        </div>

        {/* Shared Folders section */}
        <div className="px-3 py-2.5 border-b border-border/50">
          <div className="flex items-center gap-1.5">
            <Share2 size={11} className="text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">{t('pages.resources.sharedFolders')}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {sharedFolders.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground/50">{t('pages.resources.noSharedFolders')}</p>
          ) : (
            sharedFolders.map(f => (
              <FolderItem
                key={f.ID}
                label={f.name}
                icon={selectedFolder === f.ID && tab === 'shared' ? <FolderOpen size={13} /> : <Folder size={13} />}
                active={selectedFolder === f.ID && tab === 'shared'}
                onClick={() => selectSharedFolder(f.ID)}
                badge={f.resource_count > 0 ? f.resource_count : undefined}
                subtitle={f.owner?.username}
              />
            ))
          )}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">{t('header.titles.resources')}</span>
            {currentFolderLabel() && (
              <>
                <ChevronRight size={12} className="text-muted-foreground/50" />
                <span className="font-medium text-foreground">{currentFolderLabel()}</span>
              </>
            )}
          </div>
          <div className="flex-1" />

          {/* Tabs */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => { setTab('mine'); setPage(1); if (selectedFolderTab === 'shared') setSelectedFolder(null) }}
              className={`px-3 py-1 transition-colors ${tab === 'mine' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {t('pages.resources.mine')}
            </button>
            <button
              onClick={() => { setTab('shared'); setSelectedFolderTab('shared'); setPage(1) }}
              className={`px-3 py-1 flex items-center gap-1 transition-colors ${tab === 'shared' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
            >
              <Share2 size={11} />
              {t('pages.resources.shared')}
            </button>
          </div>

          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('pages.resources.searchFilesPlaceholder')}
              className="pl-7 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring w-40"
            />
          </div>

          {/* Upload button — only visible for personal folders */}
          <Button
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className={`gap-1.5 ${isSharedView ? 'invisible' : ''}`}
          >
            <Upload size={13} />
            {upload.isPending ? t('pages.resources.uploading') : t('pages.resources.uploadFile')}
          </Button>
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              title={t('pages.resources.gridTitle')}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              title={t('pages.resources.listTitle')}
            >
              <List size={13} />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={RESOURCE_UPLOAD_ACCEPT}
            multiple
            onChange={e => {
              if (!e.target.files) return
              Array.from(e.target.files).forEach(f => upload.mutate(f))
              e.target.value = ''
            }}
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-background shrink-0">
          {TYPE_TABS.map(tabItem => (
            <button
              key={tabItem.value}
              onClick={() => { setFilter(tabItem.value); setPage(1) }}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                filter === tabItem.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {t(tabItem.labelKey)}
            </button>
          ))}
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">{t('pages.resources.filesCount', { count: total })}</span>
        </div>

        {/* Grid / List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">{t('common.loadingShort')}</div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50">
              <Upload size={32} className="mb-3 opacity-30" />
              <p className="text-sm">
                {isSharedView ? t('pages.resources.noSharedResources') : search ? t('pages.resources.noMatchedFiles') : t('pages.resources.noResourcesUpload')}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {visible.map(r => (
                <ResourceCard
                  key={r.ID}
                  resource={r}
                  isSharedView={isSharedView}
                  onDelete={!isSharedView ? () => remove.mutate(r.ID) : undefined}
                  onMove={() => setMoveResource(r)}
                  onRename={() => setRenameResource(r)}
                  onDownload={() => downloadResource(resolveResourceUrl(r), r.name)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {visible.map(r => (
                <ResourceListItem
                  key={r.ID}
                  resource={r}
                  thumbSize="md"
                  draggable
                  trailing={
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <button
                          className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-36 z-50 text-sm" align="end" sideOffset={4}>
                          <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground" onSelect={() => downloadResource(resolveResourceUrl(r), r.name)}>
                            <Download size={13} />{t('shared.mediaViewer.download')}
                          </DropdownMenu.Item>
                          {!isSharedView && (
                            <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground" onSelect={() => setRenameResource(r)}>
                              <Pencil size={13} />{t('pages.resources.renameResource')}
                            </DropdownMenu.Item>
                          )}
                          {!isSharedView && (
                            <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground" onSelect={() => setMoveResource(r)}>
                              <MoveRight size={13} />{t('pages.resources.moveToFolder')}
                            </DropdownMenu.Item>
                          )}
                          {!isSharedView && (
                            <>
                              <DropdownMenu.Separator className="my-1 border-t border-border" />
                              <DropdownMenu.Item className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-destructive" onSelect={() => remove.mutate(r.ID)}>
                                <Trash2 size={13} />{t('common.delete')}
                              </DropdownMenu.Item>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  }
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-background shrink-0 text-xs text-muted-foreground">
          <span>{t('pages.resources.pageStatus', { page, pageCount })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft size={13} />
              {t('pages.resources.previousPage')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              {t('pages.resources.nextPage')}
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {folderDialog.open && (
        <FolderDialog
          open
          onClose={() => setFolderDialog({ open: false })}
          editFolder={folderDialog.folder}
        />
      )}
      {moveResource && (
        <MoveDialog
          resource={moveResource}
          folders={myFolders}
          onClose={() => setMoveResource(null)}
        />
      )}
      {renameResource && (
        <RenameResourceDialog
          resource={renameResource}
          onClose={() => setRenameResource(null)}
        />
      )}
      {permissionsFolder && (
        <PermissionsDialog
          folder={permissionsFolder}
          onClose={() => setPermissionsFolder(null)}
        />
      )}
    </div>
  )
}

// ─── Folder Sidebar Item ──────────────────────────────────────────────────────
function FolderItem({
  label,
  icon,
  active,
  onClick,
  badge,
  isShared,
  subtitle,
  onEdit,
  onDelete,
  onPermissions,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  badge?: number
  isShared?: boolean
  subtitle?: string
  onEdit?: () => void
  onDelete?: () => void
  onPermissions?: () => void
}) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className={`group flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors ${
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
      onClick={onClick}
    >
      <span className="shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate">{label}</div>
        {subtitle && <div className="text-[10px] text-muted-foreground/60 truncate">{subtitle}</div>}
      </div>

      {isShared && <span title={t('pages.resources.sharedTitle')}><Globe size={10} className="text-blue-400 shrink-0" /></span>}

      {badge != null && (
        <span className="bg-muted text-muted-foreground rounded-full px-1.5 text-[10px]">{badge}</span>
      )}

      {(onEdit || onDelete || onPermissions) && (
        <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal size={11} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-28 z-50 text-xs"
              align="end"
              sideOffset={4}
            >
              {onEdit && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={() => { onEdit(); setMenuOpen(false) }}
                >
                  {t('pages.resources.edit')}
                </DropdownMenu.Item>
              )}
              {onPermissions && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-muted text-foreground"
                  onSelect={() => { onPermissions(); setMenuOpen(false) }}
                >
                  <ShieldCheck size={11} />
                  {t('pages.resources.permissionSettings')}
                </DropdownMenu.Item>
              )}
              {onDelete && (
                <DropdownMenu.Item
                  className="px-3 py-1.5 cursor-pointer hover:bg-muted text-destructive"
                  onSelect={() => { onDelete(); setMenuOpen(false) }}
                >
                  {t('common.delete')}
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  )
}
