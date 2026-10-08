import { useSyncExternalStore } from 'react'
import type { IndicatorStore } from '../scene/indicator-store'
import { MARKER_LOOK, MARKER_SIZE_PX } from '../scene/tuning'

/** Buttons at the screen edge pointing toward off-screen urgent islands (spec §14.4). */
export function EdgeIndicatorLayer({
  store,
  onOpen,
}: {
  store: IndicatorStore
  onOpen: (projectId: string) => void
}) {
  const indicators = useSyncExternalStore(store.subscribe, store.get, store.get)
  if (indicators.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {indicators.map((i) => {
        const style = MARKER_LOOK[i.urgency]
        return (
          <button
            key={i.projectId}
            type="button"
            onClick={() => onOpen(i.projectId)}
            aria-label={`${i.name} island, ${i.count} ${style.words}, off screen`}
            style={{ left: i.left, top: i.top, width: MARKER_SIZE_PX, height: MARKER_SIZE_PX }}
            className={`pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-semibold shadow ${style.button}`}
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ transform: `rotate(${i.angle}rad)` }}
            >
              <span
                className={`absolute top-1/2 -right-2 -translate-y-1/2 border-y-[6px] border-l-8 border-y-transparent ${style.arrow}`}
              />
            </span>
            <span aria-hidden>{i.count}</span>
          </button>
        )
      })}
    </div>
  )
}
