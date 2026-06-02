import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface InlineTitleEditorOptions {
  value: string
  onCommit: (value: string) => void
}

export function useInlineTitleEditor({ value, onCommit }: InlineTitleEditorOptions) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [workspace, setWorkspace] = useState(value)

  useEffect(() => {
    if (!editing) setWorkspace(value)
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
    setWorkspace(value)
    setEditing(true)
  }, [value])

  const cancelEditing = useCallback(() => {
    setWorkspace(value)
    setEditing(false)
  }, [value])

  const commitEditing = useCallback(() => {
    const nextValue = workspace.trim()
    setEditing(false)
    if (!nextValue) {
      setWorkspace(value)
      return
    }
    setWorkspace(nextValue)
    if (nextValue !== value) onCommit(nextValue)
  }, [workspace, onCommit, value])

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
    workspace,
    inputRef,
    setWorkspace,
    startEditing,
    cancelEditing,
    commitEditing,
    handleInputKeyDown,
    handleDisplayKeyDown,
  }
}
