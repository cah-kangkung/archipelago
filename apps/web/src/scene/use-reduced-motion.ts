import { useEffect, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function usePrefersReducedMotion(): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches)
  useEffect(() => {
    const mql = window.matchMedia(REDUCED_MOTION_QUERY)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return matches
}
