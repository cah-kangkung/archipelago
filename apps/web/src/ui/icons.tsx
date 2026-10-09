import type { IconSize } from './icon'

type Props = { size?: IconSize; className?: string }

/** The supplies coin: a gold disc with a darker rim and a diamond stamp. */
export function SuppliesIcon({ size = 20, className }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="10" className="fill-gold-text" />
      <circle cx="12" cy="11" r="9" className="fill-gold" />
      <path d="M12 6.5 15.5 11 12 15.5 8.5 11Z" className="fill-gold-text" opacity="0.55" />
    </svg>
  )
}

/** The daily chest: a sand box, coral lid band, gold clasp. */
export function ChestIcon({ size = 20, className }: Props) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M3 10a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v1H3Z" className="fill-coral" />
      <rect x="3" y="11" width="18" height="9" rx="2" className="fill-sand" />
      <rect x="3" y="11" width="18" height="2" className="fill-sand-text" opacity="0.35" />
      <rect x="10" y="9" width="4" height="6" rx="1" className="fill-gold" />
    </svg>
  )
}
