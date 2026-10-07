const KEY = 'archipelago.lastIsland'

/** The island shown most recently, from an earlier visit; null if unknown or storage is blocked. */
export function readLastIsland(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeLastIsland(projectId: string): void {
  try {
    localStorage.setItem(KEY, projectId)
  } catch {
    // Storage can be unavailable (private mode); the island just isn't remembered.
  }
}
