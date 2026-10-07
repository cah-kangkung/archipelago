let probed: boolean | undefined

/**
 * Whether this browser can create a WebGL2 context; three r186's renderer needs WebGL2, so a
 * WebGL1-only device gets the card view. Probed once; the answer does not change.
 */
export function hasWebGL(): boolean {
  if (probed === undefined) {
    try {
      const ctx = document.createElement('canvas').getContext('webgl2')
      probed = ctx !== null
      // Browsers cap live contexts; hand the probe's back straight away.
      ctx?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      probed = false
    }
  }
  return probed
}

/** Test seam: forget the cached probe. */
export function resetWebGLProbe(): void {
  probed = undefined
}
