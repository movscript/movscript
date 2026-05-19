import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const CONTEXT_PANE_DEFAULT_HEIGHT = 220
const CONTEXT_PANE_MIN_HEIGHT = 96
const CONTEXT_PANE_MAX_HEIGHT = 620

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function useAgentContextPaneController() {
  const [showContext, setShowContextState] = useState(false)
  const [contextPaneHeight, setContextPaneHeight] = useState(CONTEXT_PANE_DEFAULT_HEIGHT)
  const contextPaneResizeRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const setShowContext = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setShowContextState((current) => {
      return typeof next === 'function' ? next(current) : next
    })
  }, [])

  const startContextPaneResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!showContext || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startHeight = contextPaneHeight
    contextPaneResizeRef.current = { startY, startHeight }
    document.body.classList.add('ai-agent-panel-resizing', 'ai-agent-panel-resizing--y')

    const onMove = (moveEvent: PointerEvent) => {
      const state = contextPaneResizeRef.current
      if (!state) return
      const delta = state.startY - moveEvent.clientY
      const nextHeight = clampNumber(state.startHeight + delta, CONTEXT_PANE_MIN_HEIGHT, CONTEXT_PANE_MAX_HEIGHT)
      setContextPaneHeight(nextHeight)
    }

    const onUp = () => {
      contextPaneResizeRef.current = null
      document.body.classList.remove('ai-agent-panel-resizing', 'ai-agent-panel-resizing--y')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [contextPaneHeight, showContext])

  return {
    contextPaneHeight,
    setShowContext,
    showContext,
    startContextPaneResize,
  }
}
