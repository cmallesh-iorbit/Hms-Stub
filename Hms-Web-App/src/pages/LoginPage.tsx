import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/Alert'
import { FormField } from '../components/FormField'

export function LoginPage() {
  const { isAuthenticated, signIn, expiryNotice, clearExpiryNotice } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already signed in (e.g. refreshed the tab) -- skip straight to the form.
  if (isAuthenticated) return <Navigate to="/appointments/new" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    // Acting on the form acknowledges any stale "session expired" notice; keeping it
    // would stack two banners on top of each other.
    clearExpiryNotice()

    if (!username.trim() || !password) {
      setError('Enter both username and password.')
      return
    }

    setSubmitting(true)
    try {
      await signIn(username.trim(), password)
      navigate('/appointments/new', { replace: true })
    } catch (err) {
      // Show the server's own wording -- it distinguishes bad credentials from a
      // malformed request, and we should not paper over that.
      setError(err instanceof Error ? err.message : 'Sign in failed.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <form className="card auth-card" onSubmit={onSubmit} noValidate>
        <header className="auth-card__header">
          <h1 className="auth-card__title">HMS</h1>
          <p className="auth-card__subtitle">Sign in to book appointments</p>
        </header>

        {expiryNotice && (
          <Alert kind="warning" onDismiss={clearExpiryNotice}>
            {expiryNotice}
          </Alert>
        )}

        {error && <Alert kind="error">{error}</Alert>}

        <FormField label="Username" htmlFor="username" required>
          <input
            id="username"
            className="input"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
          />
        </FormField>

        <FormField label="Password" htmlFor="password" required>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </FormField>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
