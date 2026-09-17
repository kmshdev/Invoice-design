import { cloneElement, useId, type ReactElement } from 'react'

export default function Field({
  label,
  children,
  error,
}: {
  label: string
  children: ReactElement<{
    id?: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }>
  error?: string
}) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  const errorId = `${id}-error`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <small id={errorId} role="alert">
          {error}
        </small>
      )}
    </div>
  )
}
