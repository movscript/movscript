import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface InlineTitleEditorOptions {
  value: string
  onCommit: (value: string) => void
}

export function useInlineTitleEditor({ value, onCommit }: InlineTitleEditorOptions) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  useEffect(() => {
    if (!editing) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editing])

  const startEditing = useCallback(() => {
    setDraft(value)
    setEditing(true)
  }, [value])

  const cancelEditing = useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const commitEditing = useCallback(() => {
    const nextValue = draft.trim()
    setEditing(false)
    if (!nextValue) {
      setDraft(value)
      return
    }
    setDraft(nextValue)
    if (nextValue !== value) onCommit(nextValue)
  }, [draft, onCommit, value])

  const handleInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      commitEditing()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }, [cancelEditing, commitEditing])

  const handleDisplayKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== 'F2') return
    event.preventDefault()
    startEditing()
  }, [startEditing])

  return {
    editing,
    draft,
    inputRef,
    setDraft,
    startEditing,
    cancelEditing,
    commitEditing,
    handleInputKeyDown,
    handleDisplayKeyDown,
  }
}
