import { cloneElement, type ReactElement, useId } from 'react'

export const inputClass =
  'min-h-11 w-full rounded-md border border-border-secondary bg-surface-primary px-3 text-base focus:border-brand focus:outline-none'

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
      <label htmlFor={id} className="block text-sm text-text-secondary">
        {label}
      </label>
      {cloneElement(children, { id })}
      {errors?.map((message) => (
        <p key={message} role="alert" className="text-sm text-error">
          {message}
        </p>
      ))}
    </div>
  )
}
