import type { ReactNode } from 'react'
import type {
  SemanticEntityConfig,
  SemanticEntityPayload,
  SemanticEntityRecord,
} from '@/shared/infrastructure/api/semanticEntities'
import type { AccentTone } from '@movscript/ui/semantic'

export interface SemanticEntityInlineEditorControlState {
  formId: string
  isEditing: boolean
  canSave: boolean
  isSaving: boolean
  isDeleting: boolean
  isImmutableRecord: boolean
}

export interface SemanticEntityInlineEditorProps {
  projectId?: number
  config: SemanticEntityConfig
  record?: SemanticEntityRecord | null
  defaults?: Partial<SemanticEntityPayload>
  queryKey?: readonly unknown[]
  title?: string
  description?: string
  hideHeaderCopy?: boolean
  hideHeaderActions?: boolean
  hideDeleteAction?: boolean
  showAdvancedFields?: boolean
  hiddenFieldKeys?: string[]
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  onControlStateChange?: (state: SemanticEntityInlineEditorControlState) => void
  emptyTitle?: string
  emptyDescription?: string
  className?: string
  surface?: 'default' | 'embedded'
  hero?: SemanticEntityInlineEditorHero
  primaryFieldKeys?: string[]
  collapsed?: boolean
  collapsedMode?: 'vertical' | 'horizontal'
  onCollapsedChange?: (collapsed: boolean) => void
  resetToken?: number
  idScope?: string
  editKey?: string | number | null
  deleteRecord?: (record: SemanticEntityRecord) => Promise<unknown>
  saveRecord?: (payload: SemanticEntityPayload, record: SemanticEntityRecord | null | undefined) => Promise<SemanticEntityRecord>
  lookupOptions?: Record<string, Array<{ value: string; label: string }>>
  onSaved?: (record: SemanticEntityRecord) => void
  onDeleted?: (record: SemanticEntityRecord) => void
}

export interface SemanticEntityInlineEditorHero {
  icon?: ReactNode
  eyebrow?: ReactNode
  title?: ReactNode
  subtitle?: ReactNode
  summary?: ReactNode
  accentTone?: AccentTone
  accentClassName?: string
  compact?: boolean
  status?: ReactNode
  stats?: Array<{ label: string; value: ReactNode }>
}
