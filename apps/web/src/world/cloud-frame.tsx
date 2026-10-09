import type { CSSProperties } from 'react'
import { scenePalette } from '../scene/model/palette'
import {
  CLOUD_FRAME_ALPHA,
  CLOUD_FRAME_CLEAR,
  CLOUD_FRAME_DRIFT_S,
  CLOUD_FRAME_MS,
  CLOUD_TEXTURE_PX,
} from '../scene/tuning'
import { usePrefersReducedMotion } from '../scene/use-reduced-motion'
import { cloudFrameState } from './cloud-frame-state'
import { cloudTextureUrl } from './cloud-texture'
import type { Focus } from './selectors'

const mask = `radial-gradient(closest-side, transparent ${Math.round(CLOUD_FRAME_CLEAR * 100)}%, black 100%)`

/**
 * Soft cloud round the screen edges while inside an island or district (spec 22.4): a DOM overlay,
 * so it costs the canvas nothing. Only opacity and transform ease; `bottom` follows the sheet.
 */
export function CloudFrame({ focus, coveredBottom }: { focus: Focus; coveredBottom: number }) {
  const reduced = usePrefersReducedMotion()
  const { shown, scale } = cloudFrameState(focus)
  const texture = cloudTextureUrl()
  const wispStyle: CSSProperties & { '--cloud-tile': string } = {
    top: -CLOUD_TEXTURE_PX,
    left: -CLOUD_TEXTURE_PX,
    ...(texture
      ? {
          backgroundImage: `url(${texture})`,
          backgroundSize: `${CLOUD_TEXTURE_PX}px ${CLOUD_TEXTURE_PX}px`,
        }
      : { backgroundColor: scenePalette.cloud }),
    '--cloud-tile': `${CLOUD_TEXTURE_PX}px`,
    animation: reduced ? 'none' : `cloud-drift ${CLOUD_FRAME_DRIFT_S}s linear infinite`,
    // Paused (not 'none') while hidden: no compositor frames, and no snap back mid-fade-out.
    animationPlayState: shown ? 'running' : 'paused',
  }
  return (
    <div
      data-testid="cloud-frame"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
      style={{
        bottom: coveredBottom,
        opacity: shown ? CLOUD_FRAME_ALPHA : 0,
        transform: `scale(${scale})`,
        transition: reduced
          ? 'none'
          : `opacity ${CLOUD_FRAME_MS}ms ease-out, transform ${CLOUD_FRAME_MS}ms ease-out`,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      <div
        data-testid="cloud-frame-wisps"
        className="absolute right-0 bottom-0"
        style={wispStyle}
      />
    </div>
  )
}
