import type { WorldDto } from '@archipelago/shared'
import { useEffect, useId, useRef, useState } from 'react'
import { useWorld } from '../world/use-world'
import { useClaimDaily } from './use-claim-daily'
import { useCountUp } from './use-count-up'

const pill = 'rounded-full bg-surface-primary px-2 py-1 sm:px-3 text-sm font-semibold tabular-nums'

function BalanceChip({ balance }: { balance: number }) {
  const shown = useCountUp(balance)
  return (
    <span
      role="img"
      aria-label={`${balance} Supplies`}
      className={`${pill} ${balance < 0 ? 'text-error' : 'text-text-primary'}`}
    >
      ◆ {shown}
    </span>
  )
}

/** The streak chip; a tap shows the next-bonus hint that `title` alone hid from touch screens. */
function StreakChip({ streak }: { streak: WorldDto['economy']['streak'] }) {
  const [open, setOpen] = useState(false)
  const hintId = useId()
  const root = useRef<HTMLSpanElement>(null)
  // iOS Safari never blurs a tapped button, so a tap elsewhere or Escape must close it too.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
  const hint = streak.next
    ? `Next bonus at ${streak.next.days} days: +${streak.next.amount}`
    : 'Top streak bonus reached'
  return (
    <span ref={root} className="relative">
      <button
        type="button"
        aria-label={`${streak.days}-day streak`}
        aria-expanded={open}
        aria-controls={open ? hintId : undefined}
        title={hint}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="flex min-h-11 items-center"
      >
        <span className={`${pill} ${streak.activeToday ? 'text-warning' : 'text-text-secondary'}`}>
          {streak.days}d
        </span>
      </button>
      {open && (
        <span
          id={hintId}
          className="absolute top-full right-0 z-50 mt-2 w-max max-w-64 rounded-md bg-surface-primary px-3 py-2 text-sm text-text-primary shadow-lg"
        >
          {hint}
        </span>
      )}
    </span>
  )
}

export function EconomyBar() {
  const { data: world } = useWorld()
  const claim = useClaimDaily()
  if (!world) return null
  const { balance, streak, daily } = world.economy

  return (
    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
      <BalanceChip balance={balance} />
      <StreakChip streak={streak} />
      {!daily.claimedToday && (
        <button
          type="button"
          aria-label={`Claim +${daily.amount}`}
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
          className="min-h-11 rounded-md bg-brand-secondary px-3 text-sm font-semibold text-text-on-brand disabled:opacity-60"
        >
          <span aria-hidden className="sm:hidden">
            +{daily.amount}
          </span>
          <span aria-hidden className="hidden sm:inline">
            Claim +{daily.amount}
          </span>
        </button>
      )}
    </div>
  )
}
