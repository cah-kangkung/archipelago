let probed: boolean | undefined

/** Whether this browser can create a WebGL context. Probed once; the answer does not change. */
export function hasWebGL(): boolean {
  if (probed === undefined) {
    try {
      const canvas = document.createElement('canvas')
      probed = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
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
