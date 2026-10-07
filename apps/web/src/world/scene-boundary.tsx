import { Component, type ReactNode } from 'react'

/** How many times per page load a failed scene is retried on a later route change (spec §14.6). */
export const MAX_SCENE_RETRIES = 2
let retriesLeft = MAX_SCENE_RETRIES

/** Test seam: restore the per-page-load retry budget. */
export function resetSceneRetries(): void {
  retriesLeft = MAX_SCENE_RETRIES
}

/**
 * Catches a failed scene chunk load or a renderer that cannot get a context, and shows
 * `fallback` (the card view) in place of the world instead of the root error screen. A route
 * change (`resetKey`) tries the scene again, at most `MAX_SCENE_RETRIES` times per page load, so a
 * transient failure recovers but a device that always fails settles on the cards.
 */
export class SceneBoundary extends Component<
  { fallback: ReactNode; resetKey: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (!this.state.failed || prev.resetKey === this.props.resetKey || retriesLeft <= 0) return
    retriesLeft -= 1
    this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
