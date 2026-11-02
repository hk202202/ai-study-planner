import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading...</div>
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />
}
