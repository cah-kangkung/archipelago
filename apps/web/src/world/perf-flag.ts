let cached: boolean | null = null

/** True when the page was loaded with `?perf` (spec 16.5). Read once per page load. */
export function perfEnabled(): boolean {
  if (cached === null) cached = new URLSearchParams(window.location.search).has('perf')
  return cached
}

/** Test seam: forget the cached flag. */
export function resetPerfFlag(): void {
  cached = null
}

let noBlur: boolean | null = null

/** True when the page was loaded with `?noblur`: glass turns solid (spec 25.5). */
export function noBlurEnabled(): boolean {
  if (noBlur === null) noBlur = new URLSearchParams(window.location.search).has('noblur')
  return noBlur
}

/** Test seam: forget the cached flag. */
export function resetNoBlurFlag(): void {
  noBlur = null
}
