import { useState } from 'react'
import * as Toast from '@radix-ui/react-toast'
import { useTranslation } from 'react-i18next'
import { X, CheckCircle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useToastStore, type ToastItem } from '@/shared/ui/toastStore'
import {
  AppToastDetail,
  AppToastIcon,
  AppToastIconButton,
  AppToastMessage,
  AppToastRow,
  AppToastShell,
  AppToastViewport,
  type AppToastTone,
} from '@movscript/ui'

const ICONS = {
  success: <CheckCircle size={14} />,
  error:   <AlertCircle size={14} />,
  info:    <Info size={14} />,
}

const TOAST_TONE: Record<ToastItem['type'], AppToastTone> = {
  success: 'success',
  error: 'danger',
  info: 'info',
}

function ToastItem({ t, onRemove }: { t: ToastItem; onRemove: () => void }) {
  const { t: translate } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  return (
    <Toast.Root
      asChild
      open
      onOpenChange={(open) => { if (!open) onRemove() }}
    >
      <AppToastShell tone={TOAST_TONE[t.type]}>
        <AppToastRow>
          <AppToastIcon tone={TOAST_TONE[t.type]}>{ICONS[t.type]}</AppToastIcon>
          <Toast.Description asChild>
            <AppToastMessage>
              {t.message}
            </AppToastMessage>
          </Toast.Description>
          {t.detail && (
            <AppToastIconButton
              onClick={() => setExpanded(e => !e)}
              title={translate('toast.expandDetails')}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </AppToastIconButton>
          )}
          <Toast.Close asChild>
            <AppToastIconButton>
              <X size={14} />
            </AppToastIconButton>
          </Toast.Close>
        </AppToastRow>
        {t.detail && expanded && (
          <AppToastDetail>
            {t.detail}
          </AppToastDetail>
        )}
      </AppToastShell>
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
      <Toast.Viewport asChild>
        <AppToastViewport />
      </Toast.Viewport>
    </Toast.Provider>
  )
}
