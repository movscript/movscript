import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { AGENT_PANEL_DRAFT_EVENT, AGENT_PANEL_THREAD_EVENT, type AgentPanelThreadPayload } from '@/lib/agentPanelBridge'
import { useAgentPanelUiStore } from '@/store/agentPanelUiStore'

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function useAIAgentPanelDockController() {
  const open = useAgentPanelUiStore((state) => state.open)
  const setOpen = useAgentPanelUiStore((state) => state.setOpen)
  const toggleOpen = useAgentPanelUiStore((state) => state.toggleOpen)
  const [pendingThreadIdToOpen, setPendingThreadIdToOpen] = useState<string | null>(null)
  const [panelWidth, setPanelWidth] = useState(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    return viewportWidth < 1280 ? 340 : 392
  })
  const [dockLayout, setDockLayout] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 960 : true)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const panelResizeFrameRef = useRef<number | null>(null)
  const panelResizeStateRef = useRef<{ startX: number; startWidth: number; latestWidth: number; maxWidth: number } | null>(null)

  useEffect(() => {
    function handleDraft() {
      setOpen(true)
    }
    function handleThreadOpen(event: Event) {
      const detail = (event as CustomEvent<AgentPanelThreadPayload>).detail
      if (!detail?.threadId?.trim()) return
      setPendingThreadIdToOpen(detail.threadId)
      setOpen(true)
    }

    window.addEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
    window.addEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    return () => {
      window.removeEventListener(AGENT_PANEL_DRAFT_EVENT, handleDraft)
      window.removeEventListener(AGENT_PANEL_THREAD_EVENT, handleThreadOpen)
    }
  }, [])

  useEffect(() => {
    function updateDockLayout() {
      const viewportWidth = window.innerWidth
      setDockLayout(viewportWidth >= 960)
      setPanelWidth((current) => viewportWidth < 1280 ? Math.min(current, 340) : current)
    }

    updateDockLayout()
    window.addEventListener('resize', updateDockLayout)
    return () => window.removeEventListener('resize', updateDockLayout)
  }, [])

  const handlePendingThreadHandled = useCallback((threadId: string) => {
    setPendingThreadIdToOpen((current) => current === threadId ? null : current)
  }, [])

  const startPanelResize = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!open || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const startWidth = panelWidth
    const startX = event.clientX
    const viewportWidth = window.innerWidth
    const maxWidth = viewportWidth >= 1440
      ? 680
      : Math.min(480, Math.max(300, Math.round(viewportWidth * 0.4)))
    panelResizeStateRef.current = { startX, startWidth, latestWidth: startWidth, maxWidth }
    document.body.classList.add('ai-agent-panel-resizing', 'ai-agent-panel-resizing--x')

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const state = panelResizeStateRef.current
      if (!state) return
      const delta = state.startX - moveEvent.clientX
      state.latestWidth = clampNumber(state.startWidth + delta, 300, state.maxWidth)
      if (panelResizeFrameRef.current !== null) return
      panelResizeFrameRef.current = window.requestAnimationFrame(() => {
        panelResizeFrameRef.current = null
        const latest = panelResizeStateRef.current
        if (!latest) return
        panelRef.current?.style.setProperty('--ai-agent-panel-width', `${latest.latestWidth}px`)
      })
    }

    const onUp = () => {
      const finalWidth = panelResizeStateRef.current?.latestWidth ?? panelWidth
      if (panelResizeFrameRef.current !== null) {
        window.cancelAnimationFrame(panelResizeFrameRef.current)
        panelResizeFrameRef.current = null
      }
      panelRef.current?.style.setProperty('--ai-agent-panel-width', `${finalWidth}px`)
      setPanelWidth(finalWidth)
      panelResizeStateRef.current = null
      document.body.classList.remove('ai-agent-panel-resizing', 'ai-agent-panel-resizing--x')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }, [open, panelWidth])

  return {
    dockLayout,
    handlePendingThreadHandled,
    open,
    panelRef,
    panelWidth,
    pendingThreadIdToOpen,
    startPanelResize,
    toggleOpen,
  }
}
