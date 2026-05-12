import { useState } from 'react'
import * as Toast from '@radix-ui/react-toast'
import { useTranslation } from 'react-i18next'
import { X, CheckCircle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useToastStore, type ToastItem } from '@/store/toastStore'
import { cn } from '@/lib/utils'

const ICONS = {
  success: <CheckCircle size={15} className="shrink-0 text-foreground" />,
  error:   <AlertCircle size={15} className="shrink-0 text-destructive" />,
  info:    <Info size={15} className="shrink-0 text-primary" />,
}

const BORDER = {
  success: 'border-border',
  error:   'border-destructive/30',
  info:    'border-primary/30',
}

function ToastItem({ t, onRemove }: { t: ToastItem; onRemove: () => void }) {
  const { t: translate } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  return (
    <Toast.Root
      open
      onOpenChange={(open) => { if (!open) onRemove() }}
      className={cn(
        'flex flex-col gap-1.5 bg-popover border rounded-xl shadow-lg px-4 py-3 text-sm',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-5',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        BORDER[t.type],
      )}
    >
      <div className="flex items-start gap-2.5">
        {ICONS[t.type]}
        <Toast.Description className="flex-1 text-foreground leading-snug">
          {t.message}
        </Toast.Description>
        {t.detail && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            title={translate('toast.expandDetails')}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
        <Toast.Close asChild>
          <button className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
            <X size={13} />
          </button>
        </Toast.Close>
      </div>
      {t.detail && expanded && (
        <pre className="text-[11px] font-mono text-muted-foreground bg-muted/50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
          {t.detail}
        </pre>
      )}
    </Toast.Root>
  )
}

export function Toaster() {
  const { toasts, remove } = useToastStore()

  return (
    <Toast.Provider swipeDirection="right" duration={4000}>
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} onRemove={() => remove(t.id)} />
      ))}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]" />
    </Toast.Provider>
  )
}
