import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'

export function AuthGuard() {
  const { user, loading } = useAuth()

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/change-password" replace />

  return <Outlet />
}
