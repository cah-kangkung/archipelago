import { useEffect, useRef } from 'react'

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useShortcuts({
  enabled,
  onNew,
  onSearch,
  onEscape,
  onTogglePanel,
}: {
  enabled: boolean
  onNew: () => void
  onSearch: () => void
  onEscape: () => void
  onTogglePanel: () => void
}) {
  const handlers = useRef({ onNew, onSearch, onEscape, onTogglePanel })
  handlers.current = { onNew, onSearch, onEscape, onTogglePanel }

  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handlers.current.onEscape()
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      const typing =
        target !== null && (TYPING_TAGS.has(target.tagName) || target.isContentEditable)
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        handlers.current.onNew()
      } else if (event.key === '/') {
        event.preventDefault()
        handlers.current.onSearch()
      } else if (event.key === ']') {
        event.preventDefault()
        handlers.current.onTogglePanel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}
