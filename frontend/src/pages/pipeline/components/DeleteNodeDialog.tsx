import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'

interface Props {
  open: boolean
  nodeNames: string[]
  onConfirm: () => void
  onCancel: () => void
  isPending?: boolean
}

export function DeleteNodeDialog({ open, nodeNames, onConfirm, onCancel, isPending }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 size={16} className="text-destructive" />
            确认删除节点
          </DialogTitle>
          <DialogDescription>
            此操作无法撤销，关联的审核记录也将被移除。
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
            取消
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={isPending}>
            {isPending ? '删除中…' : '确认删除'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
