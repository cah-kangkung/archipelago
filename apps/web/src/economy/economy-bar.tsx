import { useWorld } from '../world/use-world'
import { useClaimDaily } from './use-claim-daily'

const pill = 'rounded-full bg-surface-primary px-3 py-1 text-sm font-semibold tabular-nums'

export function EconomyBar() {
  const { data: world } = useWorld()
  const claim = useClaimDaily()
  if (!world) return null
  const { balance, streak, daily } = world.economy
  const next = streak.next ? `Next bonus at ${streak.next.days} days: +${streak.next.amount}` : ''

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        role="img"
        aria-label={`${balance} Supplies`}
        className={`${pill} ${balance < 0 ? 'text-error' : 'text-text-primary'}`}
      >
        ◆ {balance}
      </span>
      <span
        role="img"
        aria-label={`${streak.days}-day streak`}
        title={next}
        className={`${pill} ${streak.activeToday ? 'text-warning' : 'text-text-secondary'}`}
      >
        {streak.days}d
      </span>
      {!daily.claimedToday && (
        <button
          type="button"
          disabled={claim.isPending}
          onClick={() => claim.mutate()}
          className="min-h-11 rounded-md bg-brand-secondary px-3 text-sm font-semibold text-text-on-brand disabled:opacity-60"
        >
          Claim +{daily.amount}
        </button>
      )}
    </div>
  )
}
