const bar =
  'pointer-events-auto flex min-h-11 items-center justify-between gap-2 rounded-md bg-surface-primary/95 px-3 py-1 shadow'

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
      <p className="text-sm text-text-primary">{name}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Remove ${name} for ${refund} Supplies back?`)) onRemove()
        }}
        className="inline-flex min-h-11 items-center rounded-md px-3 text-error disabled:opacity-50"
      >
        Remove (+{refund})
      </button>
    </div>
  )
}
