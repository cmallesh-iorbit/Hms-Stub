import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as authApi from '../api/auth'
import { configureClient } from '../api/client'

const STORAGE_KEY = 'hms.session'

interface Session {
  token: string
  username: string
  /** Epoch ms. `null` when the server said the token never expires (expiresIn: 0). */
  expiresAt: number | null
}

interface AuthState {
  username: string | null
  isAuthenticated: boolean
  /** Set when a session ends by expiry rather than by the user clicking Logout. */
  expiryNotice: string | null
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearExpiryNotice: () => void
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Holds the token for the app.
 *
 * Stored in sessionStorage: it survives a page refresh (so a half-filled form is not
 * punished by an accidental F5) but dies with the tab, which is the right default on a
 * shared clinical workstation. Note this is readable by any script on the page -- fine
 * for an internal tool, not a defence against XSS.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [expiryNotice, setExpiryNotice] = useState<string | null>(null)

  // The API client reads the token through a ref so that configureClient() does not
  // need to re-run (and callers do not capture a stale token) on every render.
  const sessionRef = useRef<Session | null>(session)
  sessionRef.current = session

  const endSession = useCallback((notice: string | null) => {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionRef.current = null
    setSession(null)
    setExpiryNotice(notice)
  }, [])

  useEffect(() => {
    configureClient({
      getToken: () => {
        const current = sessionRef.current
        if (!current) return null
        if (current.expiresAt !== null && Date.now() >= current.expiresAt) return null
        return current.token
      },
      onUnauthorized: () => endSession('Your session has expired. Please sign in again.'),
    })
  }, [endSession])

  // Expire the session on a timer too, so an idle tab returns to the login screen
  // instead of waiting for the user to submit a form and be rejected.
  useEffect(() => {
    if (!session?.expiresAt) return

    const ms = session.expiresAt - Date.now()
    if (ms <= 0) {
      endSession('Your session has expired. Please sign in again.')
      return
    }

    const timer = window.setTimeout(
      () => endSession('Your session has expired. Please sign in again.'),
      ms,
    )
    return () => window.clearTimeout(timer)
  }, [session, endSession])

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await authApi.login(username, password)

    const next: Session = {
      token: res.token,
      username,
      expiresAt: res.expiresIn > 0 ? Date.now() + res.expiresIn * 1000 : null,
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    sessionRef.current = next
    setSession(next)
    setExpiryNotice(null)
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout() // revoke server-side before we forget the token
    endSession(null)
  }, [endSession])

  const value = useMemo<AuthState>(
    () => ({
      username: session?.username ?? null,
      isAuthenticated: Boolean(session),
      expiryNotice,
      signIn,
      signOut,
      clearExpiryNotice: () => setExpiryNotice(null),
    }),
    [session, expiryNotice, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Session
    if (!parsed?.token) return null

    // Already expired while the tab was closed or in the background.
    if (parsed.expiresAt !== null && Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    // Private mode, blocked storage, or corrupt JSON -- start clean.
    return null
  }
}
