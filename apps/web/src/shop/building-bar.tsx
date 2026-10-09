import { Trash } from '@phosphor-icons/react'
import { Button } from '../ui/button'

const bar =
  'pointer-events-auto flex min-h-11 items-center justify-between gap-2 rounded-xl bg-surface-primary px-3 py-1 shadow-2'

export function BuildingBar({
  name,
  refund,
  pending,
  onRemove,
}: {
  name: string
  refund: number
  pending: boolean
  onRemove: () => void
}) {
  return (
    <div role="toolbar" aria-label={name} className={bar}>
      <p className="text-label font-label text-text-primary">{name}</p>
      <Button
        variant="danger"
        size="sm"
        icon={Trash}
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Remove ${name} for ${refund} Supplies back?`)) onRemove()
        }}
      >
        Remove (+{refund})
      </Button>
    </div>
  )
}
