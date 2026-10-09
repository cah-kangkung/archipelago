import { cloneElement, type ReactElement, useId } from 'react'

export const inputClass =
  'min-h-11 w-full rounded-xl border border-border-secondary bg-surface-primary px-3 text-body text-text-primary placeholder:text-text-tertiary focus:border-brand-secondary focus:ring-2 focus:ring-brand-secondary/20 focus:outline-none'

export function Field({
  label,
  errors,
  children,
}: {
  label: string
  errors?: string[]
  children: ReactElement<{ id?: string }>
}) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-label font-label text-text-secondary">
        {label}
      </label>
      {cloneElement(children, { id })}
      {errors?.map((message) => (
        <p key={message} role="alert" className="text-label text-error">
          {message}
        </p>
      ))}
    </div>
  )
}
