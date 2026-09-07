import type { OperationOutcome } from '../types/fhir'

/**
 * The single place every HTTP request goes through.
 *
 * Two rules it enforces for the whole app:
 *  1. URLs are ALWAYS relative ('/fhir/...', '/auth/...') so the browser sees them as
 *     same-origin and never sends a CORS preflight. Vite forwards them to the backend.
 *     An absolute URL here would be blocked by the server with 403 Invalid CORS request.
 *  2. A 401 means the token is gone or expired -- it clears the session exactly once and
 *     lets the UI redirect, instead of every caller having to remember to check.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Thrown on 401 so callers can distinguish "session died" from "bad request". */
export class UnauthorizedError extends ApiError {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

/** Set by AuthContext; how the client knows the current token without importing React. */
let tokenProvider: () => string | null = () => null
let onUnauthorized: () => void = () => {}

export function configureClient(opts: {
  getToken: () => string | null
  onUnauthorized: () => void
}): void {
  tokenProvider = opts.getToken
  onUnauthorized = opts.onUnauthorized
}

interface RequestOptions {
  method?: string
  path: string
  body?: unknown
  /** FHIR writes need `application/fhir+json`; /auth needs plain `application/json`. */
  contentType?: string
  accept?: string
  /** Login must not send a stale Authorization header. */
  skipAuth?: boolean
}

export async function request<T>(opts: RequestOptions): Promise<T> {
  const { method = 'GET', path, body, contentType, accept, skipAuth } = opts

  if (/^https?:\/\//i.test(path)) {
    // Guard against the one mistake that reintroduces the CORS failure.
    throw new Error(
      `Absolute URL passed to request(): "${path}". Use a relative path so the dev proxy handles it.`,
    )
  }

  const headers: Record<string, string> = { Accept: accept ?? 'application/fhir+json' }
  if (body !== undefined) headers['Content-Type'] = contentType ?? 'application/fhir+json'

  if (!skipAuth) {
    const token = tokenProvider()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      0,
      'Cannot reach the FHIR server. Check your connection, and that the server is up.',
    )
  }

  if (res.status === 401) {
    // A 401 on a request we deliberately sent WITHOUT a token (i.e. login) means the
    // credentials were wrong -- not that a session died. Treating the two the same
    // wipes the session, shows a misleading "session expired" notice, and hides the
    // server's actual message.
    if (skipAuth) {
      throw new ApiError(401, await extractErrorMessage(res))
    }

    onUnauthorized()
    throw new UnauthorizedError()
  }

  if (res.status === 403) {
    // Should be unreachable through the proxy. If it happens, say what it means
    // rather than showing a bare 403.
    const text = await safeText(res)
    if (text.includes('Invalid CORS request')) {
      throw new ApiError(
        403,
        'Blocked by CORS. A request bypassed the dev proxy -- this is a bug in the app, not your input.',
      )
    }
    throw new ApiError(403, text || 'Forbidden.')
  }

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res))
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/**
 * Pull something readable out of a failure. HAPI returns an OperationOutcome whose
 * `diagnostics` is the actually-useful sentence; everything else is noise.
 */
async function extractErrorMessage(res: Response): Promise<string> {
  const text = await safeText(res)
  if (!text) return `Request failed with HTTP ${res.status}.`

  try {
    const parsed = JSON.parse(text) as OperationOutcome & { message?: string }

    if (parsed.resourceType === 'OperationOutcome' && parsed.issue?.length) {
      const details = parsed.issue
        .map((i) => i.diagnostics || i.details?.text)
        .filter(Boolean)
        .join(' ')
      if (details) return details
    }

    // The /auth endpoints use the starter's ErrorResponse shape instead.
    if (parsed.message) return parsed.message
  } catch {
    // Not JSON -- fall through to the raw text.
  }

  return text.slice(0, 500)
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).trim()
  } catch {
    return ''
  }
}
