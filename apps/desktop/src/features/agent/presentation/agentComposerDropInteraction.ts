import {
  hasResourceDragPayload,
  readResourceDragPayload,
  type ResourceDragPayload,
} from '@movscript/resource-surface/resource-interaction'
import type { RawResource } from '@/types'

export interface AgentComposerDropDataTransfer {
  types: ArrayLike<string>
  files: ArrayLike<File>
  getData(type: string): string
  dropEffect?: string
}

export type AgentComposerDropKind = 'files' | 'resource'

export function agentComposerDataTransferTypes(dataTransfer: Pick<AgentComposerDropDataTransfer, 'types'>) {
  return Array.from(dataTransfer.types ?? [])
}

export function agentComposerHasFileDrop(dataTransfer: Pick<AgentComposerDropDataTransfer, 'files' | 'types'>) {
  return agentComposerDataTransferTypes(dataTransfer).includes('Files') || dataTransfer.files.length > 0
}

export function agentComposerHasResourceDrop(dataTransfer: Pick<AgentComposerDropDataTransfer, 'types'>) {
  return hasResourceDragPayload(agentComposerDataTransferTypes(dataTransfer))
}

export function agentComposerDropKind(dataTransfer: Pick<AgentComposerDropDataTransfer, 'files' | 'types'>): AgentComposerDropKind | null {
  if (agentComposerHasFileDrop(dataTransfer)) return 'files'
  if (agentComposerHasResourceDrop(dataTransfer)) return 'resource'
  return null
}

export function acceptAgentComposerDropDragOver(dataTransfer: AgentComposerDropDataTransfer) {
  if (!agentComposerDropKind(dataTransfer)) return false
  dataTransfer.dropEffect = 'copy'
  return true
}

export function readAgentComposerResourceDrop(dataTransfer: Pick<AgentComposerDropDataTransfer, 'getData'>): ResourceDragPayload<RawResource> | null {
  return readResourceDragPayload<RawResource>(dataTransfer)
}
