import { PerformanceMonitor } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { type Quality, type QualitySignal, qualityDpr } from './model/quality'
import { QUALITY_MONITOR_BOUNDS } from './tuning'

const bounds = () => QUALITY_MONITOR_BOUNDS

/**
 * Applies the tier's DPR and, while the scene is drawing steadily, lets drei's monitor move the
 * tier (spec 16.3). The monitor samples rendered frames, so it is only mounted while the ticker
 * runs: sparse on-change frames would read as a slow device.
 */
export function AdaptiveQuality({
  tier,
  monitoring,
  onSignal,
}: {
  tier: Quality
  monitoring: boolean
  onSignal: (signal: QualitySignal) => void
}) {
  const setDpr = useThree((s) => s.setDpr)
  // The Canvas `dpr` prop sets the same value; this keeps the store in step when the tier changes.
  useEffect(() => {
    setDpr(qualityDpr(tier))
  }, [tier, setDpr])
  if (!monitoring) return null
  // No `flipflops`/`onFallback`: drei counts every signal as a flip-flop, so settling is counted
  // on real tier changes in `nextQuality` instead.
  return (
    <PerformanceMonitor
      bounds={bounds}
      onDecline={() => onSignal('decline')}
      onIncline={() => onSignal('incline')}
    />
  )
}
