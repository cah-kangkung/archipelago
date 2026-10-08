import type { DecorationType } from '@archipelago/shared'
import type { ReactNode } from 'react'

const shapes: Record<DecorationType, ReactNode> = {
  pine: (
    <>
      <path className="fill-success" d="M20 4 30 22H10Z M20 12 33 32H7Z" />
      <rect className="fill-warning" x="18" y="32" width="4" height="5" />
    </>
  ),
  palm: (
    <>
      <path className="fill-warning" d="M19 14h3l2 23h-6Z" />
      <path
        className="fill-success"
        d="M20 14C14 6 6 8 4 12c6-2 11 0 16 2Zm0 0c6-8 14-6 16-2-6-2-11 0-16 2Zm0 0c-2-6-8-9-11-8 5 2 8 5 11 8Z"
      />
    </>
  ),
  garden: (
    <>
      <rect className="fill-success" x="6" y="22" width="28" height="12" rx="2" />
      <circle className="fill-warning" cx="13" cy="20" r="3" />
      <circle className="fill-error" cx="20" cy="17" r="3" />
      <circle className="fill-brand-secondary" cx="27" cy="20" r="3" />
    </>
  ),
  lamp: (
    <>
      <rect className="fill-text-secondary" x="28" y="8" width="3" height="29" />
      <rect className="fill-warning" x="25" y="5" width="9" height="7" rx="1" />
      <rect className="fill-warning" x="5" y="24" width="18" height="4" />
      <rect className="fill-warning" x="5" y="17" width="18" height="3" />
    </>
  ),
  well: (
    <>
      <path className="fill-brand-secondary" d="M8 6h24l-4 7H12Z" />
      <rect className="fill-text-secondary" x="9" y="24" width="22" height="13" rx="2" />
      <rect className="fill-warning" x="10" y="12" width="2" height="12" />
      <rect className="fill-warning" x="28" y="12" width="2" height="12" />
    </>
  ),
  stall: (
    <>
      <path className="fill-brand-secondary" d="M4 10h32l-3 7H7Z" />
      <rect
        className="fill-surface-secondary stroke-border-secondary"
        x="8"
        y="24"
        width="24"
        height="13"
      />
      <rect className="fill-warning" x="8" y="17" width="2" height="8" />
      <rect className="fill-warning" x="30" y="17" width="2" height="8" />
    </>
  ),
  fountain: (
    <>
      <ellipse className="fill-text-secondary" cx="20" cy="32" rx="16" ry="5" />
      <ellipse className="fill-brand-secondary" cx="20" cy="30" rx="13" ry="3" />
      <rect className="fill-text-secondary" x="18" y="14" width="4" height="16" />
      <path className="fill-brand-secondary" d="M20 4c4 4 4 8 0 10-4-2-4-6 0-10Z" />
    </>
  ),
  statue: (
    <>
      <rect className="fill-text-secondary" x="10" y="28" width="20" height="9" />
      <rect className="fill-border-secondary" x="16" y="13" width="8" height="15" />
      <circle className="fill-border-secondary" cx="20" cy="9" r="4" />
    </>
  ),
}

/** A flat silhouette of each decoration, so the shop never loads the 3D chunk. */
export function DecorationIcon({ type }: { type: DecorationType }) {
  return (
    <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" className="shrink-0">
      {shapes[type]}
    </svg>
  )
}
