import { useEffect } from 'react'

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useShortcuts({
  enabled,
  onNew,
  onSearch,
  onEscape,
}: {
  enabled: boolean
  onNew: () => void
  onSearch: () => void
  onEscape: () => void
}) {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape()
        return
      }
      const target = event.target instanceof HTMLElement ? event.target : null
      const typing =
        target !== null && (TYPING_TAGS.has(target.tagName) || target.isContentEditable)
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        onNew()
      } else if (event.key === '/') {
        event.preventDefault()
        onSearch()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onNew, onSearch, onEscape])
}
