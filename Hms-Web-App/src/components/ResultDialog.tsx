import { useEffect, useRef } from 'react'
import type { Appointment, CodeableConcept } from '../types/fhir'
import { formatInstantRange } from '../utils/datetime'

/** What came back from the submit -- either the created resource or why it failed. */
export type SubmitResult =
  | { kind: 'success'; appointment: Appointment }
  | { kind: 'error'; message: string; status?: number }

interface Props {
  result: SubmitResult
  onClose: () => void
  /** Only offered on success. */
  onCreateAnother: () => void
}

/**
 * Modal shown after the appointment POST resolves.
 *
 * On success it reports everything the server actually stored -- read back off the
 * returned resource, not off the form -- so what you see is what was persisted. On
 * failure it shows the server's own reason rather than a generic "something broke".
 */
export function ResultDialog({ result, onClose, onCreateAnother }: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Move focus into the dialog so Enter/Escape land here, not on the form behind it.
  useEffect(() => {
    primaryRef.current?.focus()
  }, [])

  // Escape closes; Tab is kept inside the dialog while it is open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Stop the page behind the dialog scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  const isSuccess = result.kind === 'success'

  return (
    <div
      className="modal__backdrop"
      onMouseDown={(e) => {
        // Backdrop click closes; a click that started inside the panel does not.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`modal card modal--${isSuccess ? 'success' : 'error'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        ref={dialogRef}
      >
        <div className="modal__head">
          <span className={`modal__icon modal__icon--${isSuccess ? 'success' : 'error'}`}>
            {isSuccess ? '✓' : '!'}
          </span>
          <div className="modal__heading">
            <h2 className="modal__title" id="result-title">
              {isSuccess ? 'Appointment created' : 'Could not create appointment'}
            </h2>
            <p className="modal__subtitle">
              {isSuccess
                ? 'Saved on the FHIR server. Details below are what was stored.'
                : 'Nothing was saved. Your form is untouched — fix the problem and try again.'}
            </p>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="modal__body">
          {isSuccess ? (
            <SuccessDetails appointment={result.appointment} />
          ) : (
            <ErrorDetails message={result.message} status={result.status} />
          )}
        </div>

        <div className="modal__actions">
          {isSuccess ? (
            <>
              <button
                type="button"
                className="btn btn--primary"
                onClick={onCreateAnother}
                ref={primaryRef}
              >
                Create another
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onClose}
              ref={primaryRef}
            >
              Back to form
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SuccessDetails({ appointment: a }: { appointment: Appointment }) {
  const patient = a.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'))
  const practitioner = a.participant?.find((p) =>
    p.actor?.reference?.startsWith('Practitioner/'),
  )

  return (
    <>
      <div className="modal__ref">
        <span className="modal__ref-label">Appointment ID</span>
        <span className="modal__ref-value">{a.id ?? '(not returned)'}</span>
      </div>

      <dl className="detail-list">
        <Row label="Pod ID" value={a.identifier?.[0]?.value} />
        <Row label="Status" value={a.status} />
        <Row
          label="Patient"
          value={patient?.actor?.display}
          note={patient?.actor?.reference}
        />
        <Row
          label="Practitioner"
          value={practitioner?.actor?.display}
          note={practitioner?.actor?.reference}
        />
        <Row
          label="When"
          value={formatInstantRange(a.start, a.end)}
          note={a.minutesDuration ? `${a.minutesDuration} minutes` : undefined}
        />
        <Row label="Appointment type" value={concept(a.appointmentType)} />
        <Row label="Service type" value={concept(a.serviceType?.[0])} />
        <Row label="Specialty" value={concept(a.specialty?.[0])} />
        <Row label="Reason" value={concept(a.reasonCode?.[0])} />
        <Row label="Description" value={a.description} />
        <Row label="Comment" value={a.comment} />
      </dl>
    </>
  )
}

function ErrorDetails({ message, status }: { message: string; status?: number }) {
  return (
    <>
      <p className="modal__reason-label">Reason{status ? ` (HTTP ${status})` : ''}</p>
      <p className="modal__reason">{message}</p>

      {status === 401 && (
        <p className="modal__hint">Your session ended. Sign in again and re-enter the booking.</p>
      )}
      {(status === 400 || status === 422) && (
        <p className="modal__hint">
          The server rejected the data above. Check the patient and practitioner still exist and
          that the date and time are valid.
        </p>
      )}
      {status === 0 && (
        <p className="modal__hint">
          The server could not be reached at all. Check your internet connection, then confirm the
          FHIR server is running.
        </p>
      )}
    </>
  )
}

/** Rows with no value are dropped -- an empty "Reason —" line is just noise. */
function Row({ label, value, note }: { label: string; value?: string; note?: string }) {
  if (!value) return null
  return (
    <div className="detail-list__row">
      <dt className="detail-list__label">{label}</dt>
      <dd className="detail-list__value">
        {value}
        {note && <span className="detail-list__note">{note}</span>}
      </dd>
    </div>
  )
}

/** Prefer the coded display; fall back to free text (how the "Other…" reason is stored). */
function concept(c?: CodeableConcept): string | undefined {
  return c?.coding?.[0]?.display ?? c?.coding?.[0]?.code ?? c?.text
}
