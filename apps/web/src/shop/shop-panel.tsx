import { type DecorationType, SHOP_ITEMS } from '@archipelago/shared'
import { useId } from 'react'
import { DecorationIcon } from './decoration-icon'

function shortfall(price: number, balance: number): string | null {
  if (balance < 0) return 'Balance is negative'
  if (price > balance) return `Need ${price - balance} more`
  return null
}

export function ShopPanel({
  balance,
  hasFreeLand,
  onPick,
}: {
  balance: number
  hasFreeLand: boolean
  onPick: (type: DecorationType) => void
}) {
  const id = useId()
  return (
    <div className="space-y-3">
      {!hasFreeLand && (
        <p className="text-sm text-text-secondary">No free land. Islands grow as you add tasks.</p>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SHOP_ITEMS.map((item) => {
          const reason = hasFreeLand ? shortfall(item.price, balance) : null
          const reasonId = `${id}-${item.type}`
          return (
            <li key={item.type}>
              <button
                type="button"
                disabled={!hasFreeLand || reason !== null}
                aria-describedby={reason ? reasonId : undefined}
                onClick={() => onPick(item.type)}
                className="flex min-h-11 w-full items-center gap-2 rounded-md bg-surface-secondary p-2 text-left disabled:opacity-50"
              >
                <DecorationIcon type={item.type} />
                <span className="flex flex-col">
                  <span className="text-sm text-text-primary">{item.name}</span>
                  <span className="text-xs text-text-secondary">{item.price} Supplies</span>
                  {reason && (
                    <span id={reasonId} className="text-xs text-error">
                      {reason}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
