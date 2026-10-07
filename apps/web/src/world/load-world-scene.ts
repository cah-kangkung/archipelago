import { type ComponentType, lazy } from 'react'
import type { WorldSceneProps } from '../scene/world-scene'

/** The dynamic import keeps Three.js in its own chunk, out of the login screen's weight. */
export const loadWorldScene = (): Promise<{ default: ComponentType<WorldSceneProps> }> =>
  import('../scene/world-scene').then((m) => ({ default: m.WorldScene }))

/**
 * A fresh lazy scene. React caches a rejected import inside the lazy component, so a retry after a
 * chunk-load failure needs a new one to ask the network again.
 */
export const createLazyWorldScene = () => lazy(loadWorldScene)
