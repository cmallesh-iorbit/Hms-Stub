import type { ReactNode } from 'react'

export type AlertKind = 'error' | 'success' | 'warning' | 'info'

interface Props {
  kind: AlertKind
  children: ReactNode
  onDismiss?: () => void
}

export function Alert({ kind, children, onDismiss }: Props) {
  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div className="alert__body">{children}</div>
      {onDismiss && (
        <button type="button" className="alert__close" onClick={onDismiss} aria-label="Dismiss">
          &times;
        </button>
      )}
    </div>
  )
}
