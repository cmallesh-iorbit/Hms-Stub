/**
 * Minimal FHIR R4 types -- only the fields this app actually reads or writes.
 * Deliberately not a full FHIR type library; that would be thousands of lines
 * for the handful of paths we touch.
 */

export interface Coding {
  system?: string
  code?: string
  display?: string
}

export interface CodeableConcept {
  coding?: Coding[]
  text?: string
}

export interface Identifier {
  system?: string
  value?: string
}

export interface HumanName {
  use?: string
  family?: string
  given?: string[]
  prefix?: string[]
  text?: string
}

export interface Reference {
  reference?: string
  display?: string
}

export interface Patient {
  resourceType: 'Patient'
  id?: string
  identifier?: Identifier[]
  name?: HumanName[]
  gender?: string
  birthDate?: string
}

export interface Practitioner {
  resourceType: 'Practitioner'
  id?: string
  identifier?: Identifier[]
  name?: HumanName[]
}

export type AppointmentStatus =
  | 'proposed'
  | 'pending'
  | 'booked'
  | 'arrived'
  | 'checked-in'
  | 'fulfilled'
  | 'cancelled'
  | 'noshow'
  | 'waitlist'

export interface AppointmentParticipant {
  actor?: Reference
  required?: 'required' | 'optional' | 'information-only'
  status?: 'accepted' | 'declined' | 'tentative' | 'needs-action'
}

export interface Appointment {
  resourceType: 'Appointment'
  id?: string
  /** Business identifier -- carries the hospital's Pod ID. */
  identifier?: Identifier[]
  status: AppointmentStatus
  appointmentType?: CodeableConcept
  serviceType?: CodeableConcept[]
  specialty?: CodeableConcept[]
  reasonCode?: CodeableConcept[]
  description?: string
  start?: string
  end?: string
  minutesDuration?: number
  comment?: string
  participant: AppointmentParticipant[]
}

/** A FHIR searchset Bundle, narrowed to the resource type we asked for. */
export interface Bundle<T> {
  resourceType: 'Bundle'
  type?: string
  total?: number
  entry?: Array<{ fullUrl?: string; resource?: T }>
}

export interface OperationOutcome {
  resourceType: 'OperationOutcome'
  issue?: Array<{
    severity?: string
    code?: string
    diagnostics?: string
    details?: CodeableConcept
  }>
}
