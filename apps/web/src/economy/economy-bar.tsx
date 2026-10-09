import type { WorldDto } from '@archipelago/shared'
import { Fire } from '@phosphor-icons/react'
import { Button } from '../ui/button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/icon'
import { ChestIcon, SuppliesIcon } from '../ui/icons'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { useWorld } from '../world/use-world'
import { useClaimDaily } from './use-claim-daily'
import { useCountUp } from './use-count-up'

const pill =
  'inline-flex items-center gap-1 rounded-full bg-surface-primary px-2 py-1 text-label font-heading tabular-nums shadow-1 sm:px-3'

function BalanceChip({ balance }: { balance: number }) {
  const shown = useCountUp(balance)
  return (
    <span
      role="img"
      aria-label={`${balance} Supplies`}
      className={cx(pill, balance < 0 ? 'text-coral-text' : 'text-text-primary')}
    >
      <SuppliesIcon size={16} /> {shown}
    </span>
  )
}

/** The streak chip; a tap shows the next-bonus hint that `title` alone hid from touch screens. */
function StreakChip({ streak }: { streak: WorldDto['economy']['streak'] }) {
  const hint = streak.next
    ? `Next bonus at ${streak.next.days} days: +${streak.next.amount}`
    : 'Top streak bonus reached'
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${streak.days}-day streak`}
        title={hint}
        className="flex min-h-11 items-center"
      >
        <span className={cx(pill, streak.activeToday ? 'text-coral-text' : 'text-text-secondary')}>
          <Icon icon={Fire} size={16} active={streak.activeToday} />
          {streak.days}d
        </span>
      </PopoverTrigger>
      <PopoverContent align="end">{hint}</PopoverContent>
    </Popover>
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
        <Button
          variant="accent"
          size="sm"
          aria-label={`Claim +${daily.amount}`}
          loading={claim.isPending}
          onClick={() => claim.mutate()}
        >
          {!claim.isPending && <ChestIcon size={20} />}
          <span aria-hidden className="sm:hidden">
            +{daily.amount}
          </span>
          <span aria-hidden className="hidden sm:inline">
            Claim +{daily.amount}
          </span>
        </Button>
      )}
    </div>
  )
}
