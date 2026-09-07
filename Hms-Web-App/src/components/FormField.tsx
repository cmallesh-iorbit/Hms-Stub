import type { ReactNode } from 'react'

interface Props {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
}

export function FormField({ label, htmlFor, required, error, hint, children }: Props) {
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && <p className="field__error">{error}</p>}
    </div>
  )
}
