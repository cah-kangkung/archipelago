import type { ShopItemDto } from '@archipelago/shared'
import { X } from '@phosphor-icons/react'
import { Button } from '../ui/button'

const bar =
  'pointer-events-auto flex min-h-11 items-center justify-between gap-2 rounded-xl bg-surface-primary px-3 py-1 shadow-2'

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
        <Button size="sm" loading={pending} onClick={onConfirm}>
          {pending ? 'Placing…' : `Place · ${item.price}`}
        </Button>
      ) : (
        <p className="text-label text-text-secondary">Tap a glowing plot</p>
      )}
      <Button variant="ghost" size="sm" icon={X} onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
