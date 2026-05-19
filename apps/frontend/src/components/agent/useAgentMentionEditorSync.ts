import { useEffect } from 'react'
import type { RefObject } from 'react'
import {
  hydrateMentionEditorMedia,
  renderMentionEditorValue,
  serializeMentionEditor,
  setCaretAtEnd,
} from '@/components/agent/AgentMentionEditor'
import type { AgentAttachment } from '@/store/agentStore'

interface UseAgentMentionEditorSyncInput {
  conversationId: string
  input: string
  inputRef: RefObject<HTMLDivElement>
  resourceAttachmentIndex: Map<number, AgentAttachment>
}

export function useAgentMentionEditorSync({
  conversationId,
  input,
  inputRef,
  resourceAttachmentIndex,
}: UseAgentMentionEditorSyncInput) {
  useEffect(() => {
    inputRef.current?.focus()
  }, [conversationId, inputRef])

  useEffect(() => {
    const editor = inputRef.current
    if (!editor) return
    if (serializeMentionEditor(editor) === input) return
    const selection = window.getSelection()
    const shouldRestoreEnd = document.activeElement === editor && !!selection && editor.contains(selection.anchorNode)
    renderMentionEditorValue(editor, input, resourceAttachmentIndex)
    hydrateMentionEditorMedia(editor)
    if (shouldRestoreEnd) setCaretAtEnd(editor)
  }, [input, inputRef, resourceAttachmentIndex])

  useEffect(() => () => {
    const editor = inputRef.current
    if (!editor) return
    for (const media of Array.from(editor.querySelectorAll<HTMLElement>('.ai-agent-mention-chip__media'))) {
      const objectUrl = media.dataset.objectUrl
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [inputRef])
}
