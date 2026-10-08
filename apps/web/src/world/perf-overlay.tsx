import { useSyncExternalStore } from 'react'
import type { PerfStore } from '../scene/perf-store'

/** The `?perf` corner panel (spec 16.5). */
export function PerfOverlay({ store }: { store: PerfStore }) {
  const r = useSyncExternalStore(store.subscribe, store.get, store.get)
  return (
    <aside
      aria-label="Performance"
      className="pointer-events-none absolute top-2 right-2 z-30 rounded-md bg-text-primary/80 px-2 py-1 font-mono text-xs leading-5 text-text-on-brand"
    >
      {r ? (
        <>
          <p>
            {r.fps} fps · {r.tier}
          </p>
          <p>
            {r.calls} calls · {r.triangles} tris
          </p>
          <p>dpr {r.dpr}</p>
        </>
      ) : (
        <p>Waiting for frames</p>
      )}
    </aside>
  )
}
