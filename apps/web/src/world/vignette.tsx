import { scenePalette } from '../scene/model/palette'
import { VIGNETTE_ALPHA } from '../scene/tuning'

const alpha = Math.round(VIGNETTE_ALPHA * 255)
  .toString(16)
  .padStart(2, '0')

/** Darkens the canvas corners towards deep water (spec 17.3); the card view has none. */
export function Vignette() {
  return (
    <div
      data-testid="vignette"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background: `radial-gradient(ellipse at center, transparent 55%, ${scenePalette.seaDeep}${alpha} 100%)`,
      }}
    />
  )
}
