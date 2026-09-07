import { request } from './client'

/** Response shape of POST /auth/login -- matches the backend's LoginResponse record. */
export interface LoginResponse {
  token: string
  tokenType: string
  /** Seconds. 0 means the token never expires. */
  expiresIn: number
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>({
    method: 'POST',
    path: '/auth/login',
    body: { username, password },
    contentType: 'application/json',
    accept: 'application/json',
    skipAuth: true,
  })
}

/**
 * Revoke the token server-side. Best-effort: if this fails we still clear the local
 * session, because leaving the user "logged in" after they clicked Logout is worse
 * than leaving one token to expire on its own.
 */
export async function logout(): Promise<void> {
  try {
    await request<void>({ method: 'POST', path: '/auth/logout', accept: 'application/json' })
  } catch {
    // Intentionally ignored.
  }
}
