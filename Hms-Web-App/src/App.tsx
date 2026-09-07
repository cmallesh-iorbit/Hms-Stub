import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { NewAppointmentPage } from './pages/NewAppointmentPage'

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/appointments/new"
          element={
            <ProtectedRoute>
              <NewAppointmentPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/appointments/new" replace />} />
      </Routes>
    </AuthProvider>
  )
}
