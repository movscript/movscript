import { Trash2 } from 'lucide-react'
import { Button } from '@movscript/ui'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@movscript/ui'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  nodeNames: string[]
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

export function DeleteNodeDialog({ open, nodeNames, onConfirm, onCancel, isPending }: Props) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 size={16} className="text-destructive" />
            {t('pipeline.delete.title')}
          </DialogTitle>
          <DialogDescription>
            {t('pipeline.delete.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-1">
          {nodeNames.map((name, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md">
              <Trash2 size={12} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">{name}</span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isPending}>
            {isPending ? t('pipeline.delete.deleting') : t('pipeline.delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
