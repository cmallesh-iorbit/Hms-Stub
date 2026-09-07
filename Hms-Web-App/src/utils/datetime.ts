/**
 * Date/time helpers for building FHIR `instant` values.
 *
 * FHIR wants an ISO-8601 string WITH an offset. `Date.prototype.toISOString()`
 * gives us `...Z` (UTC), which is valid but shifts the wall-clock time the user
 * typed. The appointments already on the server use local offsets (`+05:30`), so
 * we match that: the time the user picked is the time that gets stored.
 */

/** `2026-09-08` for today, in the browser's local timezone (not UTC). */
export function todayIsoDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The next :00 or :30 boundary, as `HH:mm` -- a sensible default start time. */
export function nextHalfHour(): string {
  const d = new Date()
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Combine a `YYYY-MM-DD` date and an `HH:mm` time into a FHIR instant carrying
 * the browser's UTC offset, e.g. `2026-09-08T09:00:00+05:30`.
 */
export function toFhirInstant(date: string, time: string): string {
  const local = parseLocal(date, time)
  return `${date}T${time}:00${offsetString(local)}`
}

/** Same as {@link toFhirInstant}, shifted forward by `minutes`. */
export function toFhirInstantPlus(date: string, time: string, minutes: number): string {
  const end = parseLocal(date, time)
  end.setMinutes(end.getMinutes() + minutes)

  const d = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
  const t = `${pad(end.getHours())}:${pad(end.getMinutes())}`
  return `${d}T${t}:00${offsetString(end)}`
}

/** True when the given date+time is earlier than now. Drives the past-date warning. */
export function isInPast(date: string, time: string): boolean {
  if (!date || !time) return false
  return parseLocal(date, time).getTime() < Date.now()
}

/** Human-readable summary for the confirmation line, e.g. "Tue 8 Sep 2026, 09:00 - 09:30". */
export function describeSlot(date: string, time: string, minutes: number): string {
  if (!date || !time) return ''
  const start = parseLocal(date, time)
  const end = new Date(start.getTime() + minutes * 60_000)

  const day = start.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${day}, ${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`
}

/**
 * Format the `start`/`end` the SERVER echoed back, e.g.
 * "Tue 8 Sep 2026, 09:00 – 09:30 (+05:30)".
 *
 * Reads the wall-clock straight out of the ISO string rather than going through
 * `Date`+`toLocaleString`: the offset is already baked into the value, so re-rendering
 * it in the viewer's timezone would show a different time than was booked.
 */
export function formatInstantRange(startIso?: string, endIso?: string): string {
  const start = splitInstant(startIso)
  if (!start) return ''

  const [y, m, d] = start.date.split('-').map(Number)
  const day = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const end = splitInstant(endIso)
  const range = end ? `${start.time} – ${end.time}` : start.time
  const zone = start.offset ? ` (${start.offset})` : ''

  return `${day}, ${range}${zone}`
}

function splitInstant(
  iso?: string,
): { date: string; time: string; offset: string } | null {
  if (!iso) return null
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?/.exec(
    iso,
  )
  if (!match) return null
  return { date: match[1], time: match[2], offset: match[3] ?? '' }
}

function parseLocal(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  // Using the numeric constructor keeps this in local time; `new Date("...")` on a
  // bare date string would be parsed as UTC.
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}

/** `+05:30` / `-04:00` / `Z` for the given moment in the browser's timezone. */
function offsetString(at: Date): string {
  const total = -at.getTimezoneOffset() // getTimezoneOffset is inverted
  if (total === 0) return 'Z'
  const sign = total > 0 ? '+' : '-'
  const abs = Math.abs(total)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
