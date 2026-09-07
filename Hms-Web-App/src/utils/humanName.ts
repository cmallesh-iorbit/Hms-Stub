import type { HumanName, Identifier, Patient, Practitioner } from '../types/fhir'

/**
 * Render a FHIR HumanName the way a person would write it:
 * `{ prefix: ["Dr."], given: ["Priyansh"], family: "Mehta" }` -> "Dr. Priyansh Mehta"
 */
export function formatHumanName(name?: HumanName): string {
  if (!name) return ''
  if (name.text) return name.text

  return [...(name.prefix ?? []), ...(name.given ?? []), name.family]
    .filter(Boolean)
    .join(' ')
    .trim()
}

/** First usable name on a resource, falling back to the id so a row is never blank. */
export function displayName(resource: Patient | Practitioner): string {
  const names = resource.name ?? []
  for (const n of names) {
    const formatted = formatHumanName(n)
    if (formatted) return formatted
  }
  return resource.id ? `(unnamed) ${resource.id}` : '(unnamed)'
}

/** `MRN-040` / `DOC-001` -- the secondary line in a picker row. */
export function primaryIdentifier(identifiers?: Identifier[]): string {
  return identifiers?.find((i) => i.value)?.value ?? ''
}

/**
 * Compact subtitle for a picker row, e.g. "id 1173 · MRN-205 · male · 1990-05-15".
 *
 * The id leads because it is what goes into the Appointment reference and what people
 * search by after creating a record -- seeing it here confirms they picked the right one.
 */
export function patientSubtitle(p: Patient): string {
  return [p.id && `id ${p.id}`, primaryIdentifier(p.identifier), p.gender, p.birthDate]
    .filter(Boolean)
    .join(' · ')
}

export function practitionerSubtitle(p: Practitioner): string {
  return [p.id && `id ${p.id}`, primaryIdentifier(p.identifier)].filter(Boolean).join(' · ')
}
