import { Link, useLocation } from 'react-router-dom'
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
} from '@/components/ui/sidebar'

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, group: 'Principal' },
  { title: 'Catálogo Técnico', url: '/catalogo', icon: BookOpen, group: 'Principal' },
  { title: 'Evolução Aprendizado', url: '/aprendizado', icon: GraduationCap, group: 'Principal' },
  { title: 'Usuários', url: '/admin/usuarios', icon: Users, group: 'Administração' },
  { title: 'Funções', url: '/admin/funcoes', icon: Shield, group: 'Administração' },
  { title: 'Status dos Produtos', url: '/admin/status', icon: Settings, group: 'Administração' },
  { title: 'Log de Atividades', url: '/admin/logs', icon: ScrollText, group: 'Administração' },
]

export function AppSidebar() {
  const location = useLocation()

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="flex flex-row items-center gap-2 p-4 h-16 border-b">
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Factory className="size-5" />
        </div>
        <span className="font-bold text-lg">Fábrica Inteligente</span>
      </SidebarHeader>
      <SidebarContent>
        {['Principal', 'Administração'].map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems
                  .filter((i) => i.group === group)
                  .map((item) => {
                    const isActive =
                      location.pathname === item.url ||
                      (item.url !== '/' && location.pathname.startsWith(item.url))
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <Link to={item.url}>
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
