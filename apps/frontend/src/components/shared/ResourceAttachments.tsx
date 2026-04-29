import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'
import type { RawResource, ResourceBinding, ResourceBindingOwnerType, ResourceBindingRole } from '@/types'
import { Paperclip, X, Upload } from 'lucide-react'
import { AuthedImage, AuthedVideo } from './AuthedImage'
import { useProjectStore } from '@/store/projectStore'

interface Props {
  ownerType: ResourceBindingOwnerType
  ownerId: number
  role?: ResourceBindingRole
  slot?: string
  variant?: 'picker' | 'gallery'
  maxCount?: number
}

const BASE = API_BASE_URL

export function ResourceAttachments({ ownerType, ownerId, role = 'attachment', slot = '', variant = 'picker', maxCount }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)
  const fileRef = useRef<HTMLInputElement>(null)

  const queryKey = ['resource-bindings', projectId, ownerType, ownerId, role, slot]
  const { data: bindings = [] } = useQuery<ResourceBinding[]>({
    queryKey,
    queryFn: () =>
      api.get(`/projects/${projectId}/entities/${ownerType}/${ownerId}/resources`, {
        params: { role, ...(slot ? { slot } : {}) },
      }).then((r) => r.data),
    enabled: !!projectId && !!ownerId,
  })

  const attached = bindings.filter((binding) => binding.resource).map((binding) => ({ binding, resource: binding.resource! }))
  const canUpload = !maxCount || attached.length < maxCount
  const tileClass = variant === 'gallery'
    ? 'h-24 min-w-28 flex-1 basis-28'
    : 'w-16 h-16'

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const resource = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      return api.post(`/projects/${projectId}/resource-bindings`, {
        resource_id: resource.ID,
        owner_type: ownerType,
        owner_id: ownerId,
        role,
        slot,
        source_type: 'upload',
      }).then((r) => r.data as ResourceBinding)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey })
    },
  })

  const remove = useMutation({
    mutationFn: (bindingId: number) => api.delete(`/resource-bindings/${bindingId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  })

  return (
    <div className="space-y-2">
      <div className={variant === 'gallery' ? 'grid grid-cols-2 gap-2 sm:grid-cols-3' : 'flex items-center gap-2 flex-wrap'}>
        {attached.map(({ binding, resource }) => (
          <div key={binding.ID} className="relative group">
            {resource.type === 'image' ? (
              <AuthedImage
                src={`${BASE}${resource.url}`}
                alt={resource.name}
                className={`${tileClass} object-cover rounded border border-border`}
              />
            ) : resource.type === 'video' ? (
              <AuthedVideo
                src={`${BASE}${resource.url}`}
                className={`${tileClass} object-cover rounded border border-border bg-muted`}
              />
            ) : (
              <div className={`${tileClass} rounded border border-border bg-muted flex items-center justify-center`}>
                <Paperclip size={16} className="text-muted-foreground" />
              </div>
            )}
            {variant === 'gallery' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b border-x border-b border-border bg-background/90 px-2 py-1">
                <p className="truncate text-[11px] text-foreground">{resource.name}</p>
              </div>
            )}
            <button
              onClick={() => remove.mutate(binding.ID)}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={t('shared.attachments.remove')}
            >
              <X size={10} />
            </button>
          </div>
        ))}

        {canUpload && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className={`${tileClass} rounded border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-ring hover:text-muted-foreground transition-colors`}
          >
            <Upload size={14} />
            <span className="text-xs">{upload.isPending ? '...' : t('shared.attachments.upload')}</span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,video/*,audio/*,text/*"
        onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
      />
    </div>
  )
}
