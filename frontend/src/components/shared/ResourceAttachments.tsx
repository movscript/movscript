import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RawResource } from '@/types'
import { Paperclip, X, Upload } from 'lucide-react'
import { AuthedImage, AuthedVideo } from './AuthedImage'

interface Props {
  resourceIds: number[]
  onChange: (ids: number[]) => void
}

const BASE = 'http://localhost:8765'

export function ResourceAttachments({ resourceIds, onChange }: Props) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: allResources = [] } = useQuery<RawResource[]>({
    queryKey: ['resources'],
    queryFn: () => api.get('/resources').then((r) => r.data),
  })

  const attached = allResources.filter((r) => resourceIds.includes(r.ID))

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/resources/upload', fd).then((r) => r.data as RawResource)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      onChange([...resourceIds, r.ID])
    },
  })

  function remove(id: number) {
    onChange(resourceIds.filter((i) => i !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {attached.map((r) => (
          <div key={r.ID} className="relative group">
            {r.type === 'image' ? (
              <AuthedImage
                src={`${BASE}${r.url}`}
                alt={r.name}
                className="w-16 h-16 object-cover rounded border border-border"
              />
            ) : r.type === 'video' ? (
              <AuthedVideo
                src={`${BASE}${r.url}`}
                className="w-16 h-16 object-cover rounded border border-border bg-muted"
              />
            ) : (
              <div className="w-16 h-16 rounded border border-border bg-muted flex items-center justify-center">
                <Paperclip size={16} className="text-muted-foreground" />
              </div>
            )}
            <button
              onClick={() => remove(r.ID)}
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="移除"
            >
              <X size={10} />
            </button>
          </div>
        ))}

        <button
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className="w-16 h-16 rounded border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-ring hover:text-muted-foreground transition-colors"
        >
          <Upload size={14} />
          <span className="text-xs">{upload.isPending ? '…' : '上传'}</span>
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*,video/*"
        onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
      />
    </div>
  )
}
