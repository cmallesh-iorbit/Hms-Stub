import { request } from './client'
import type { Appointment, Bundle, Patient, Practitioner } from '../types/fhir'

const PAGE_SIZE = Number(import.meta.env.VITE_PICKER_PAGE_SIZE ?? 20) || 20

function resources<T>(bundle: Bundle<T>): T[] {
  return (bundle.entry ?? []).map((e) => e.resource).filter((r): r is T => Boolean(r))
}

const EMPTY = { resourceType: 'Bundle' } as const

/**
 * Look a resource up three ways at once and merge the hits.
 *
 * People reach for whatever is in front of them: the name on a chart, the numeric id
 * returned when the record was created (1173, 1174), or the hospital's own MRN/DOC
 * code. All three go out in parallel and the results are merged, so the user never has
 * to know which kind of thing they are holding.
 *
 * Order matters: an id or identifier match is exact and unambiguous, so those come
 * first and dedupe keeps them ahead of the fuzzier name matches.
 *
 * `name` uses the `:contains` modifier -- FHIR's plain `name=` is prefix-matched, so
 * typing the middle of a name would otherwise find nothing.
 */
async function searchResource<T extends { id?: string }>(
  resourceType: 'Patient' | 'Practitioner',
  query: string,
): Promise<T[]> {
  const q = query.trim()

  // Empty box: show something useful rather than nothing.
  if (!q) {
    const sort = resourceType === 'Patient' ? '&_sort=-_lastUpdated' : ''
    const bundle = await request<Bundle<T>>({
      path: `/fhir/${resourceType}?_count=${PAGE_SIZE}${sort}`,
    })
    return resources(bundle)
  }

  const encoded = encodeURIComponent(q)
  const lookups: Array<Promise<Bundle<T>>> = []

  // Exact id -- ids on this server are numeric, so only try it when that is plausible.
  if (/^\d+$/.test(q)) {
    lookups.push(get<T>(`/fhir/${resourceType}?_id=${encoded}`))
  }

  // Business identifier (MRN-040, DOC-001, NRS-002...). Only worth a request when the
  // text could actually be one.
  if (/[\d-]/.test(q)) {
    lookups.push(get<T>(`/fhir/${resourceType}?identifier=${encoded}&_count=${PAGE_SIZE}`))
  }

  lookups.push(get<T>(`/fhir/${resourceType}?name:contains=${encoded}&_count=${PAGE_SIZE}`))

  const bundles = await Promise.all(lookups)
  return dedupeById(bundles.flatMap(resources))
}

/**
 * One lookup. A failure here degrades to "no hits from this angle" rather than failing
 * the whole search -- if the id lookup errors, name results should still show.
 * A 401 is deliberately NOT swallowed: that must reach the caller so the session ends.
 */
function get<T>(path: string): Promise<Bundle<T>> {
  return request<Bundle<T>>({ path }).catch((err) => {
    if (err instanceof Error && err.name === 'UnauthorizedError') throw err
    return EMPTY as Bundle<T>
  })
}

/** Patient picker: matches on name, numeric id, or MRN. */
export function searchPatients(query: string): Promise<Patient[]> {
  return searchResource<Patient>('Patient', query)
}

/** Practitioner picker: matches on name, numeric id, or DOC/NRS identifier. */
export function searchPractitioners(query: string): Promise<Practitioner[]> {
  return searchResource<Practitioner>('Practitioner', query)
}

/** POST a new Appointment. Returns the created resource, whose `id` we show the user. */
export function createAppointment(appointment: Appointment): Promise<Appointment> {
  return request<Appointment>({
    method: 'POST',
    path: '/fhir/Appointment',
    body: appointment,
    contentType: 'application/fhir+json',
  })
}

/** Keeps the first occurrence, so exact matches stay ahead of name matches. */
function dedupeById<T extends { id?: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.id
    if (!key) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
