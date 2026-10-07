import { Component, type ReactNode } from 'react'

/**
 * Catches a failed scene chunk load or a renderer that cannot get a context, and shows
 * `fallback` (the card view) in place of the world instead of the root error screen.
 */
export class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
