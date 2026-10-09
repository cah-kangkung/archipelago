import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { RewardStore } from '../rewards/reward-store'
import type { Focus } from '../world/selectors'
import { AdaptiveQuality } from './adaptive-quality'
import { CameraRig, ISO_DISTANCE } from './camera-rig'
import { FogRig } from './fog-rig'
import { Framing } from './framing'
import { IndicatorProbe } from './indicator-probe'
import type { IndicatorStore } from './indicator-store'
import { Labels } from './labels'
import { type AmbientLife, hasLife } from './model/ambient-life'
import { ARCHIPELAGO_ZOOM } from './model/camera'
import type { IslandUrgency } from './model/indicators'
import { scenePalette } from './model/palette'
import { nextQuality, qualityDpr, START_QUALITY } from './model/quality'
import type { SceneModel } from './model/scene-model'
import { PerfProbe } from './perf-probe'
import type { PerfStore } from './perf-store'
import { SpotlightRig } from './spotlight-rig'
import { startTicker, tickerWanted } from './ticker'
import { usePrefersReducedMotion } from './use-reduced-motion'
import { type Placement, type SceneHandlers, WorldContents } from './world-contents'

export type WorldSceneProps = SceneHandlers & {
  model: SceneModel
  focus: Focus
  selectedTaskId: string | null
  selectedBuildingId: string | null
  placement: Placement | null
  coveredBottom: number
  /** Canvas px the HUD chips cover at the top; edge markers stay below it. */
  hudInset: number
  anchor: string | null
  urgent: readonly IslandUrgency[]
  indicators: IndicatorStore
  rewards: RewardStore
  perf?: PerfStore | null
  /** Called once the canvas exists. */
  onReady?: () => void
  /** Opens the new-island editor; offered over the empty sea. */
  onNewProject?: () => void
  /** Boats, gulls and the whale (spec 17.5). */
  life: AmbientLife
}

function AnimationTicker({ enabled }: { enabled: boolean }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => (enabled ? startTicker(() => invalidate()) : undefined), [enabled, invalidate])
  return null
}

/** The 3D world. Renders on demand; the ticker adds frames only while something moves. */
export function WorldScene(props: WorldSceneProps) {
  const animate = !usePrefersReducedMotion()
  const rewards = useSyncExternalStore(props.rewards.subscribe, props.rewards.get)
  const [quality, setQuality] = useState(START_QUALITY)
  const [cameraMoving, setCameraMoving] = useState(false)
  const [growing, setGrowing] = useState(false)
  const [spotting, setSpotting] = useState(false)
  const cranes = useMemo(
    () => props.model.islands.some((i) => i.structures.some((s) => s.kind === 'crane')),
    [props.model],
  )
  const seaWave = animate && quality.tier === 'high'
  // Reward floats do not invalidate themselves: a live event keeps the ticker running for them.
  const ticking = tickerWanted({
    animate,
    seaWave,
    cranes,
    effects: rewards.length > 0,
    camera: cameraMoving,
    life: seaWave && hasLife(props.life),
    growth: growing,
    spotlight: spotting,
  })
  return (
    <Canvas
      frameloop="demand"
      onCreated={() => props.onReady?.()}
      dpr={qualityDpr(quality.tier)}
      orthographic
      flat
      camera={{
        position: [ISO_DISTANCE, ISO_DISTANCE, ISO_DISTANCE],
        zoom: ARCHIPELAGO_ZOOM,
        near: 0.1,
        far: 2000,
      }}
      className="touch-none"
    >
      <color attach="background" args={[scenePalette.seaDeep]} />
      <WorldContents
        {...props}
        rewards={rewards}
        animate={animate}
        seaWave={seaWave}
        lowTier={quality.tier === 'low'}
        onGrowth={setGrowing}
      />
      <SpotlightRig
        model={props.model}
        focus={props.focus}
        animate={animate}
        onRunning={setSpotting}
      />
      <Labels model={props.model} focus={props.focus} />
      <CameraRig
        model={props.model}
        focus={props.focus}
        covered={props.coveredBottom}
        hudInset={props.hudInset}
        anchor={props.anchor}
        animate={animate}
        onMotion={setCameraMoving}
      />
      <Framing covered={props.coveredBottom} animate={animate} />
      {/* After the camera rigs: same-priority frames run in mount order, so the fog must read the
          camera position they have just set, not last frame's. */}
      <FogRig bounds={props.model.bounds} />
      <IndicatorProbe
        model={props.model}
        urgent={props.urgent}
        currentProjectId={props.focus.kind === 'archipelago' ? null : props.focus.projectId}
        covered={props.coveredBottom}
        topInset={props.hudInset}
        store={props.indicators}
      />
      {/*
        The monitor is mounted only while the ticker runs, so it guards the 30fps ticker. A device
        on `low` may not climb back to `high` while nothing ticks; the spec's 55fps panning figure
        is a manual check through the ?perf overlay, not something the monitor decides.
      */}
      <AdaptiveQuality
        tier={quality.tier}
        monitoring={ticking && !quality.settled}
        onSignal={(signal) => setQuality((q) => nextQuality(q, signal))}
      />
      <AnimationTicker enabled={ticking} />
      {props.perf && <PerfProbe store={props.perf} tier={quality.tier} />}
    </Canvas>
  )
}
