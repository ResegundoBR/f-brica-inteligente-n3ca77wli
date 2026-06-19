import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import {
  LayoutDashboard,
  BookOpen,
  GraduationCap,
  Users,
  Shield,
  ScrollText,
  Factory,
  Settings,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, group: 'Engenharia' },
  { title: 'Catálogo Técnico', url: '/catalogo', icon: BookOpen, group: 'Engenharia' },
  { title: 'Evolução Aprendizado', url: '/aprendizado', icon: GraduationCap, group: 'Engenharia' },
  { title: 'Usuários', url: '/admin/usuarios', icon: Users, group: 'Administração' },
  { title: 'Funções', url: '/admin/funcoes', icon: Shield, group: 'Administração' },
  { title: 'Status dos Produtos', url: '/admin/status', icon: Settings, group: 'Administração' },
  { title: 'Log de Atividades', url: '/admin/logs', icon: ScrollText, group: 'Administração' },
]

export function AppSidebar() {
  const location = useLocation()
  const { user } = useAuth()
  const { setOpenMobile } = useSidebar()

  const role = user?.expand?.role
  const isSuperAdmin =
    user?.role === 'admin' ||
    role?.name === 'admin' ||
    role?.name === 'Administrador' ||
    user?.email === 'reginaldo.segundo@planagroup.com.br'

  const hasAccess = (itemTitle: string) => {
    if (isSuperAdmin) return true
    if (!role) return false

    switch (itemTitle) {
      case 'Dashboard':
        return !!role.access_dashboard
      case 'Catálogo Técnico':
        return !!role.access_catalog
      case 'Evolução Aprendizado':
        return !!role.access_learning
      case 'Usuários':
      case 'Funções':
      case 'Status dos Produtos':
      case 'Log de Atividades':
        return !!role.access_users
      default:
        return true
    }
  }

  return (
    <Sidebar
      variant="inset"
      style={
        {
          '--sidebar-background': '222.2 47.4% 11.2%',
          '--sidebar-foreground': '210 40% 98%',
          '--sidebar-border': '222.2 47.4% 11.2%',
          '--sidebar-accent': '217.2 32.6% 17.5%',
          '--sidebar-accent-foreground': '210 40% 98%',
        } as React.CSSProperties
      }
      className="border-r-0"
    >
      <SidebarHeader className="flex flex-row items-center gap-2 p-4 h-16 border-b border-slate-800/50">
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Factory className="size-5" />
        </div>
        <span className="font-bold text-lg">
          <span className="text-green-700">Fábrica</span>{' '}
          <span className="text-orange-600">Inteligente</span>
        </span>
      </SidebarHeader>
      <SidebarContent>
        {['Engenharia', 'Administração'].map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems
                  .filter((i) => i.group === group && hasAccess(i.title))
                  .map((item) => {
                    const isActive =
                      location.pathname === item.url ||
                      (item.url !== '/' && location.pathname.startsWith(item.url))
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <Link to={item.url} onClick={() => setOpenMobile(false)}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
