import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'

interface RoleGuardProps {
  module: 'dashboard' | 'catalog' | 'learning' | 'users'
  children: React.ReactNode
}

export function RoleGuard({ module, children }: RoleGuardProps) {
  const { user, loading: authLoading, setUser } = useAuth()
  const [roleLoading, setRoleLoading] = useState(false)
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)

  useEffect(() => {
    let isMounted = true

    async function checkAccess() {
      if (!user) {
        if (isMounted) setHasAccess(false)
        return
      }

      const isSuperAdmin =
        user.role === 'admin' ||
        user.expand?.role?.name === 'admin' ||
        user.expand?.role?.name === 'Administrador' ||
        user.email === 'reginaldo.segundo@planagroup.com.br'

      if (isSuperAdmin) {
        if (isMounted) setHasAccess(true)
        return
      }

      // If user has a role ID but it's not expanded yet (e.g. right after login)
      let currentRole = user.expand?.role
      if (!currentRole && user.role) {
        if (isMounted) setRoleLoading(true)
        try {
          const freshUser = await pb.collection('users').getOne(user.id, { expand: 'role' })
          if (isMounted) {
            setUser(freshUser as any)
            currentRole = freshUser.expand?.role
          }
        } catch (error) {
          console.error('Failed to fetch user role', error)
        } finally {
          if (isMounted) setRoleLoading(false)
        }
      }

      if (!currentRole) {
        if (isMounted) setHasAccess(false)
        return
      }

      let access = false
      switch (module) {
        case 'dashboard':
          access = !!currentRole.access_dashboard
          break
        case 'catalog':
          access = !!currentRole.access_catalog
          break
        case 'learning':
          access = !!currentRole.access_learning
          break
        case 'users':
          access = !!currentRole.access_users
          break
      }

      if (isMounted) setHasAccess(access)
    }

    if (!authLoading) {
      checkAccess()
    }

    return () => {
      isMounted = false
    }
  }, [user, authLoading, module, setUser])

  if (authLoading || roleLoading || hasAccess === null) {
    return (
      <div className="flex h-full min-h-[50vh] items-center justify-center text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!hasAccess) return <Navigate to="/unauthorized" replace />

  return <>{children}</>
}
