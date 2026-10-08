/** A small ring for in-flight buttons; static under reduced motion. Decorative: say it in text. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin ${className}`}
    />
  )
}
