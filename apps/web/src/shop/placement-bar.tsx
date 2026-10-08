import type { ShopItemDto } from '@archipelago/shared'
import { Spinner } from '../app/spinner'

const bar =
  'pointer-events-auto flex min-h-11 items-center justify-between gap-2 rounded-md bg-surface-primary/95 px-3 py-1 shadow'
const action = 'inline-flex min-h-11 items-center gap-2 rounded-md px-3'

export function PlacementBar({
  item,
  hasGhost,
  pending,
  onConfirm,
  onCancel,
}: {
  item: ShopItemDto
  hasGhost: boolean
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div role="toolbar" aria-label={`Placing ${item.name}`} className={bar}>
      {hasGhost ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`${action} bg-brand text-text-on-brand disabled:opacity-50`}
        >
          {pending ? (
            <>
              <Spinner />
              Placing…
            </>
          ) : (
            `Place · ${item.price}`
          )}
        </button>
      ) : (
        <p className="text-sm text-text-secondary">Tap a glowing plot</p>
      )}
      <button type="button" onClick={onCancel} className={`${action} text-text-secondary`}>
        Cancel
      </button>
    </div>
  )
}
