import { File as FileIcon, FileAudio, FileText, Image as ImageIcon, Video } from 'lucide-react'

export function ResourceTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'image': return <ImageIcon size={14} />
    case 'video': return <Video size={14} />
    case 'audio': return <FileAudio size={14} />
    case 'text': return <FileText size={14} />
    default: return <FileIcon size={14} />
  }
}
