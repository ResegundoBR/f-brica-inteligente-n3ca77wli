import pb from '@/lib/pocketbase/client'
import type { User, Role } from '@/types'

const SUPERADMIN_EMAIL = 'reginaldo.segundo@planagroup.com.br'

interface RedirectEntry {
  path: string
  hasAccess: (role: Role) => boolean
}

const REDIRECT_PRIORITY: RedirectEntry[] = [
  { path: '/', hasAccess: (r) => !!r.access_dashboard || !!r.access_produto_processos },
  { path: '/pcp/operador', hasAccess: (r) => !!r.access_operator },
  { path: '/pcp/ordens', hasAccess: (r) => !!r.access_ordens_producao },
  { path: '/pcp/kanban', hasAccess: (r) => !!r.access_painel_controle },
  {
    path: '/pcp/comercial',
    hasAccess: (r) => !!r.access_visao_comercial || !!r.access_commercial,
  },
  { path: '/pcp/suprimentos/solicitacoes', hasAccess: (r) => !!r.access_suprimentos },
  { path: '/pcp/dashboard', hasAccess: (r) => !!r.access_pcp },
  { path: '/catalogo', hasAccess: (r) => !!r.access_catalog },
  { path: '/consulta', hasAccess: (r) => !!r.access_catalog_consultation },
  { path: '/aprendizado', hasAccess: (r) => !!r.access_learning },
  { path: '/admin/usuarios', hasAccess: (r) => !!r.access_users },
]

export async function getPostLoginRedirectPath(user: User): Promise<string> {
  const isSuperAdmin =
    user.email === SUPERADMIN_EMAIL ||
    user.role === 'admin' ||
    user.expand?.role?.name === 'admin' ||
    user.expand?.role?.name === 'Administrador'

  if (isSuperAdmin) return '/'

  let role = user.expand?.role

  if (!role && user.role) {
    try {
      const freshUser = await pb.collection('users').getOne(user.id, { expand: 'role' })
      role = (freshUser as unknown as User).expand?.role
    } catch {
      return '/'
    }
  }

  if (!role) return '/'

  for (const entry of REDIRECT_PRIORITY) {
    if (entry.hasAccess(role)) return entry.path
  }

  return '/'
}
