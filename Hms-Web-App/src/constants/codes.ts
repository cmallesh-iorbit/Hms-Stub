import type { AppointmentStatus, Coding } from '../types/fhir'

/**
 * Fixed value sets for the appointment form.
 *
 * These are hard-coded on purpose -- no terminology-server round trip. Every default
 * here was verified against an appointment already stored on the deployed server
 * (Appointment/1837), so the server is known to accept these exact codes.
 *
 * Swap these lists for your hospital's real value sets when you have them; nothing
 * else in the app needs to change.
 */

const SNOMED = 'http://snomed.info/sct'
const V2_0276 = 'http://terminology.hl7.org/CodeSystem/v2-0276'

export const APPOINTMENT_STATUSES: Array<{ value: AppointmentStatus; label: string }> = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'pending', label: 'Pending' },
  { value: 'booked', label: 'Booked' },
  { value: 'arrived', label: 'Arrived' },
  { value: 'checked-in', label: 'Checked in' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'noshow', label: 'No show' },
  { value: 'waitlist', label: 'Waitlist' },
]

export const APPOINTMENT_TYPES: Coding[] = [
  { system: V2_0276, code: 'ROUTINE', display: 'Routine appointment' },
  { system: V2_0276, code: 'WALKIN', display: 'A previously unscheduled walk-in visit' },
  { system: V2_0276, code: 'CHECKUP', display: 'A routine check-up' },
  { system: V2_0276, code: 'FOLLOWUP', display: 'A follow up visit' },
  { system: V2_0276, code: 'EMERGENCY', display: 'Emergency appointment' },
]

export const SERVICE_TYPES: Coding[] = [
  { system: SNOMED, code: '11429006', display: 'Consultation' },
  { system: SNOMED, code: '394701000', display: 'Follow-up' },
  { system: SNOMED, code: '410620009', display: 'Well child visit' },
  { system: SNOMED, code: '50849002', display: 'Emergency room admission' },
]

export const SPECIALTIES: Coding[] = [
  { system: SNOMED, code: '394814009', display: 'General practice' },
  { system: SNOMED, code: '394579002', display: 'Cardiology' },
  { system: SNOMED, code: '394582007', display: 'Dermatology' },
  { system: SNOMED, code: '394537008', display: 'Pediatrics' },
  { system: SNOMED, code: '394589003', display: 'Neurology' },
  { system: SNOMED, code: '394612005', display: 'Obstetrics and gynecology' },
  { system: SNOMED, code: '394801008', display: 'Trauma and orthopedics' },
]

export const REASONS: Coding[] = [
  { system: SNOMED, code: '386661006', display: 'Fever' },
  { system: SNOMED, code: '25064002', display: 'Headache' },
  { system: SNOMED, code: '29857009', display: 'Chest pain' },
  { system: SNOMED, code: '49727002', display: 'Cough' },
  { system: SNOMED, code: '422587007', display: 'Nausea' },
]

/** Sentinel for the "type my own reason" option -- writes `reasonCode[0].text`. */
export const REASON_FREE_TEXT = '__free_text__'

/**
 * `system` for the Pod ID business identifier, taken from the appointments already on
 * the server (e.g. Appointment/1837). Change here if your hospital uses another URI.
 */
export const POD_ID_SYSTEM = 'http://hospital.org/pod-id'

export const DURATIONS = [15, 30, 45, 60] as const

export const DEFAULTS = {
  status: 'booked' as AppointmentStatus,
  appointmentType: 'ROUTINE',
  serviceType: '11429006',
  specialty: '394814009',
  durationMinutes: 30,
}

/** Look a Coding up by code so the form can store just the code string. */
export function findCoding(list: Coding[], code: string): Coding | undefined {
  return list.find((c) => c.code === code)
}
