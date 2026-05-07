import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ShieldAlert } from 'lucide-react'

export function AuthGuard() {
  const { user, loading, signOut } = useAuth()
  const [accessDenied, setAccessDenied] = useState(false)

  useEffect(() => {
    if (user && !loading) {
      if (!user.active) {
        setAccessDenied(true)
        return
      }

      if (
        user.access_days &&
        user.access_days.length > 0 &&
        user.access_start_time &&
        user.access_end_time
      ) {
        const now = new Date()
        const currentDay = now.getDay() // 0 = Sunday

        if (!user.access_days.includes(currentDay)) {
          setAccessDenied(true)
          return
        }

        const currentHours = now.getHours().toString().padStart(2, '0')
        const currentMinutes = now.getMinutes().toString().padStart(2, '0')
        const currentTimeStr = `${currentHours}:${currentMinutes}`

        if (currentTimeStr < user.access_start_time || currentTimeStr > user.access_end_time) {
          setAccessDenied(true)
          return
        }
      }

      setAccessDenied(false)
    }
  }, [user, loading])

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  if (!user) return <Navigate to="/login" replace />

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-6" />
        <h2 className="text-3xl font-bold mb-4 tracking-tight">Acesso Negado</h2>
        <p className="text-muted-foreground mb-8 max-w-md">
          Acesso não permitido fora do horário ou dias estabelecidos pelo administrador.
        </p>
        <Button onClick={() => signOut()} size="lg">
          Voltar para o Login
        </Button>
      </div>
    )
  }

  if (user.must_change_password) return <Navigate to="/change-password" replace />

  return <Outlet />
}
