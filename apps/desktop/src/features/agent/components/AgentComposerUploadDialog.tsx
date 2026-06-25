import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@movscript/ui/primitives'
import { useTranslation } from 'react-i18next'

export function AgentComposerUploadDialog({
  open,
  uploadedFileCount,
  uploadingFileNames,
}: {
  open: boolean
  uploadedFileCount: number
  uploadingFileNames: string[]
}) {
  const { t } = useTranslation()
  const uploadingFileCount = uploadingFileNames.length
  const uploadingPrimaryFileName = uploadingFileNames[0]

  return (
    <Dialog open={open}>
      <DialogContent
        hideClose
        className="w-[min(360px,calc(100vw-32px))]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t('agents.chat.uploadDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('agents.chat.uploadDialogDescription', {
              count: uploadingFileCount,
              uploaded: uploadedFileCount,
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
          <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate type-caption text-foreground">
              {uploadingPrimaryFileName ?? t('agents.chat.uploadDialogPreparing')}
            </p>
            <p className="type-tiny text-muted-foreground">
              {t('agents.chat.uploadDialogProgress', {
                uploaded: uploadedFileCount,
                count: uploadingFileCount,
              })}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
