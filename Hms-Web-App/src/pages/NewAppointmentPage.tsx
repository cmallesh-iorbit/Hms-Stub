import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { createAppointment, searchPatients, searchPractitioners } from '../api/fhir'
import { UnauthorizedError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/Alert'
import { FormField } from '../components/FormField'
import { ResourcePicker, type PickerItem } from '../components/ResourcePicker'
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  DEFAULTS,
  DURATIONS,
  POD_ID_SYSTEM,
  REASONS,
  REASON_FREE_TEXT,
  SERVICE_TYPES,
  SPECIALTIES,
  findCoding,
} from '../constants/codes'
import type { Appointment, AppointmentStatus } from '../types/fhir'
import {
  describeSlot,
  isInPast,
  nextHalfHour,
  todayIsoDate,
  toFhirInstant,
  toFhirInstantPlus,
} from '../utils/datetime'
import { displayName, patientSubtitle, practitionerSubtitle } from '../utils/humanName'

interface FormErrors {
  patient?: string
  practitioner?: string
  date?: string
  time?: string
}

export function NewAppointmentPage() {
  const { username, signOut } = useAuth()

  const [patient, setPatient] = useState<PickerItem | null>(null)
  const [practitioner, setPractitioner] = useState<PickerItem | null>(null)

  const [date, setDate] = useState(() => todayIsoDate())
  const [time, setTime] = useState(() => nextHalfHour())
  const [duration, setDuration] = useState<number>(DEFAULTS.durationMinutes)

  const [podId, setPodId] = useState('')
  const [status, setStatus] = useState<AppointmentStatus>(DEFAULTS.status)
  const [appointmentType, setAppointmentType] = useState(DEFAULTS.appointmentType)
  const [serviceType, setServiceType] = useState(DEFAULTS.serviceType)
  const [specialty, setSpecialty] = useState(DEFAULTS.specialty)
  const [reasonCode, setReasonCode] = useState('')
  const [reasonText, setReasonText] = useState('')
  const [description, setDescription] = useState('')
  const [comment, setComment] = useState('')

  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const pastWarning = isInPast(date, time)
  const slotSummary = useMemo(() => describeSlot(date, time, duration), [date, time, duration])

  // Stable identities so the pickers' debounced effect does not re-fire every render.
  const findPatients = useCallback(
    (q: string) =>
      searchPatients(q).then((list) =>
        list.map((p) => ({
          id: p.id ?? '',
          title: displayName(p),
          subtitle: patientSubtitle(p),
        })),
      ),
    [],
  )

  const findPractitioners = useCallback(
    (q: string) =>
      searchPractitioners(q).then((list) =>
        list.map((p) => ({
          id: p.id ?? '',
          title: displayName(p),
          subtitle: practitionerSubtitle(p),
        })),
      ),
    [],
  )

  function validate(): boolean {
    const next: FormErrors = {}
    if (!patient) next.patient = 'Select a patient.'
    if (!practitioner) next.practitioner = 'Select a practitioner.'
    if (!date) next.date = 'Pick a date.'
    if (!time) next.time = 'Pick a start time.'

    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitError(null)
    setCreatedId(null)

    if (!validate() || !patient || !practitioner) return

    setSubmitting(true)
    try {
      const created = await createAppointment(
        buildAppointment({
          patient,
          practitioner,
          date,
          time,
          duration,
          status,
          appointmentType,
          serviceType,
          specialty,
          reasonCode,
          reasonText,
          description,
          comment,
          podId,
        }),
      )
      setCreatedId(created.id ?? '(id not returned)')
    } catch (err) {
      // A dead session is already being handled globally -- the app is redirecting
      // to /login, so showing an error here would flash and disappear.
      if (err instanceof UnauthorizedError) return
      setSubmitError(err instanceof Error ? err.message : 'Could not create the appointment.')
    } finally {
      setSubmitting(false)
    }
  }

  /** Clear the clinical details but keep the date -- the usual case is several bookings in a row. */
  function createAnother() {
    setCreatedId(null)
    setSubmitError(null)
    setPatient(null)
    setPractitioner(null)
    setTime(nextHalfHour())
    // Pod IDs are per-appointment, so never carry one over to the next booking.
    setPodId('')
    setReasonCode('')
    setReasonText('')
    setDescription('')
    setComment('')
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetAll() {
    createAnother()
    setDate(todayIsoDate())
    setDuration(DEFAULTS.durationMinutes)
    setStatus(DEFAULTS.status)
    setAppointmentType(DEFAULTS.appointmentType)
    setServiceType(DEFAULTS.serviceType)
    setSpecialty(DEFAULTS.specialty)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">HMS</div>
        <div className="topbar__spacer" />
        <span className="topbar__user">{username}</span>
        <button type="button" className="btn btn--ghost" onClick={() => void signOut()}>
          Logout
        </button>
      </header>

      <main className="page">
        <div className="page__head">
          <h1 className="page__title">New appointment</h1>
          <p className="page__subtitle">
            Book a patient with a practitioner. Fields marked * are required.
          </p>
        </div>

        {createdId && (
          <Alert kind="success">
            <strong>Appointment created.</strong> Reference <code>{createdId}</code>
            {slotSummary && <> · {slotSummary}</>}
            <div className="alert__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={createAnother}>
                Create another
              </button>
            </div>
          </Alert>
        )}

        {submitError && (
          <Alert kind="error" onDismiss={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}

        <form className="card form" onSubmit={onSubmit} noValidate>
          <fieldset className="form__section" disabled={submitting}>
            <legend className="form__legend">Who</legend>

            <ResourcePicker
              label="Patient"
              placeholder="Name, ID or MRN — e.g. Kiran, 1173, MRN-205"
              search={findPatients}
              selected={patient}
              onSelect={setPatient}
              required
              error={errors.patient}
              hint="Search by name, by numeric ID, or by MRN. Patient must already exist on the server."
            />

            <ResourcePicker
              label="Practitioner"
              placeholder="Name, ID or code — e.g. Mehta, 1174, DOC-505"
              search={findPractitioners}
              selected={practitioner}
              onSelect={setPractitioner}
              required
              error={errors.practitioner}
              hint="Search by name, by numeric ID, or by DOC/NRS code."
            />
          </fieldset>

          <fieldset className="form__section" disabled={submitting}>
            <legend className="form__legend">When</legend>

            <div className="form__row">
              <FormField label="Date" htmlFor="date" required error={errors.date}>
                <input
                  id="date"
                  className="input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </FormField>

              <FormField label="Start time" htmlFor="time" required error={errors.time}>
                <input
                  id="time"
                  className="input"
                  type="time"
                  step={900}
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </FormField>

              <FormField label="Duration" htmlFor="duration" required>
                <select
                  id="duration"
                  className="input"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} minutes
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            {slotSummary && <p className="form__note">Slot: {slotSummary}</p>}

            {pastWarning && (
              <Alert kind="warning">
                This start time is in the past. You can still book it — check the date if that was
                not intended.
              </Alert>
            )}
          </fieldset>

          <fieldset className="form__section" disabled={submitting}>
            <legend className="form__legend">Details</legend>

            <FormField
              label="Pod ID"
              htmlFor="podId"
              hint="Your hospital's own reference for this appointment. Leave blank if there isn't one."
            >
              <input
                id="podId"
                className="input"
                type="text"
                placeholder="e.g. LoudrBed"
                value={podId}
                onChange={(e) => setPodId(e.target.value)}
              />
            </FormField>

            <div className="form__row">
              <FormField label="Status" htmlFor="status" required>
                <select
                  id="status"
                  className="input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                >
                  {APPOINTMENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Appointment type" htmlFor="appointmentType">
                <select
                  id="appointmentType"
                  className="input"
                  value={appointmentType}
                  onChange={(e) => setAppointmentType(e.target.value)}
                >
                  <option value="">— none —</option>
                  {APPOINTMENT_TYPES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.display}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="form__row">
              <FormField label="Service type" htmlFor="serviceType">
                <select
                  id="serviceType"
                  className="input"
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                >
                  <option value="">— none —</option>
                  {SERVICE_TYPES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.display}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Specialty" htmlFor="specialty">
                <select
                  id="specialty"
                  className="input"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                >
                  <option value="">— none —</option>
                  {SPECIALTIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.display}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <FormField label="Reason" htmlFor="reason">
              <select
                id="reason"
                className="input"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              >
                <option value="">— none —</option>
                {REASONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.display}
                  </option>
                ))}
                <option value={REASON_FREE_TEXT}>Other (type it in)…</option>
              </select>
            </FormField>

            {reasonCode === REASON_FREE_TEXT && (
              <FormField label="Reason (free text)" htmlFor="reasonText">
                <input
                  id="reasonText"
                  className="input"
                  type="text"
                  placeholder="e.g. Persistent back pain"
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                />
              </FormField>
            )}

            <FormField label="Description" htmlFor="description">
              <input
                id="description"
                className="input"
                type="text"
                placeholder="Short label, e.g. OPD consultation"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>

            <FormField label="Comment" htmlFor="comment">
              <textarea
                id="comment"
                className="input input--textarea"
                rows={3}
                placeholder="Anything the clinician should know before the visit"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </FormField>
          </fieldset>

          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create appointment'}
            </button>
            <button
              type="button"
              className="btn btn--link"
              onClick={resetAll}
              disabled={submitting}
            >
              Reset
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}

/**
 * Map form state onto a FHIR R4 Appointment.
 *
 * Optional fields the user left blank are omitted entirely rather than sent as null or
 * "" -- FHIR validation rejects empty values. This exact payload shape was verified
 * against the deployed server (201 Created).
 */
function buildAppointment(input: {
  patient: PickerItem
  practitioner: PickerItem
  date: string
  time: string
  duration: number
  status: AppointmentStatus
  appointmentType: string
  serviceType: string
  specialty: string
  reasonCode: string
  reasonText: string
  description: string
  comment: string
  podId: string
}): Appointment {
  const appointment: Appointment = {
    resourceType: 'Appointment',
    status: input.status,
    start: toFhirInstant(input.date, input.time),
    end: toFhirInstantPlus(input.date, input.time, input.duration),
    minutesDuration: input.duration,
    participant: [
      {
        actor: { reference: `Patient/${input.patient.id}`, display: input.patient.title },
        required: 'required',
        status: 'accepted',
      },
      {
        actor: {
          reference: `Practitioner/${input.practitioner.id}`,
          display: input.practitioner.title,
        },
        required: 'required',
        status: 'accepted',
      },
    ],
  }

  const podId = input.podId.trim()
  if (podId) appointment.identifier = [{ system: POD_ID_SYSTEM, value: podId }]

  const type = findCoding(APPOINTMENT_TYPES, input.appointmentType)
  if (type) appointment.appointmentType = { coding: [type] }

  const service = findCoding(SERVICE_TYPES, input.serviceType)
  if (service) appointment.serviceType = [{ coding: [service] }]

  const spec = findCoding(SPECIALTIES, input.specialty)
  if (spec) appointment.specialty = [{ coding: [spec] }]

  if (input.reasonCode === REASON_FREE_TEXT) {
    const text = input.reasonText.trim()
    if (text) appointment.reasonCode = [{ text }]
  } else {
    const reason = findCoding(REASONS, input.reasonCode)
    if (reason) appointment.reasonCode = [{ coding: [reason] }]
  }

  const description = input.description.trim()
  if (description) appointment.description = description

  const comment = input.comment.trim()
  if (comment) appointment.comment = comment

  return appointment
}
