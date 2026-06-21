import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
  Kanban,
  FileText,
  TabletSmartphone,
  Eye,
  Activity,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Package,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const navItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard, group: 'Produto/Processos' },
  { title: 'Catálogo Técnico', url: '/catalogo', icon: BookOpen, group: 'Produto/Processos' },
  {
    title: 'Evolução Aprendizado',
    url: '/aprendizado',
    icon: GraduationCap,
    group: 'Produto/Processos',
  },
  { title: 'Suprimentos', url: '/pcp/materiais', icon: Package, group: 'Produto/Processos' },
  { title: 'Dashboard PCP', url: '/pcp/dashboard', icon: LayoutDashboard, group: 'PCP' },
  { title: 'Painel de Controle', url: '/pcp/kanban', icon: Kanban, group: 'PCP' },
  { title: 'Ordens de Produção', url: '/pcp/ordens', icon: FileText, group: 'PCP' },
  { title: 'Clientes', url: '/pcp/clientes', icon: Users, group: 'PCP' },
  { title: 'Portal do Operador', url: '/pcp/operador', icon: TabletSmartphone, group: 'PCP' },
  { title: 'Visão Comercial', url: '/pcp/comercial', icon: Eye, group: 'PCP' },
  { title: 'Relatório de Ocorrências', url: '/pcp/ocorrencias', icon: Activity, group: 'PCP' },
  { title: 'Usuários', url: '/admin/usuarios', icon: Users, group: 'Administração' },
  { title: 'Funções', url: '/admin/funcoes', icon: Shield, group: 'Administração' },
  { title: 'Status dos Produtos', url: '/admin/status', icon: Settings, group: 'Administração' },
  { title: 'Log de Atividades', url: '/admin/logs', icon: ScrollText, group: 'Administração' },
]

export function AppSidebar() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { setOpenMobile, toggleSidebar, state } = useSidebar()

  const exactMatch = navItems.find((item) => location.pathname === item.url)
  const activeItem =
    exactMatch ||
    navItems.find((item) => item.url !== '/' && location.pathname.startsWith(item.url))
  const [activeGroup, setActiveGroup] = useState<string>(activeItem?.group || 'Produto/Processos')

  useEffect(() => {
    if (activeItem) {
      setActiveGroup(activeItem.group)
    }
  }, [location.pathname, activeItem])

  const handleLogout = () => {
    signOut()
    navigate('/login')
  }

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
        return !!role.access_dashboard || !!role.access_produto_processos
      case 'Catálogo Técnico':
        return !!role.access_catalog || !!role.access_produto_processos
      case 'Evolução Aprendizado':
        return !!role.access_learning || !!role.access_produto_processos
      case 'Usuários':
      case 'Funções':
      case 'Status dos Produtos':
      case 'Log de Atividades':
        return !!role.access_users
      case 'Dashboard PCP':
      case 'Clientes':
      case 'Relatório de Ocorrências':
        return !!role.access_pcp
      case 'Painel de Controle':
        return !!role.access_painel_controle || !!role.access_pcp
      case 'Ordens de Produção':
        return !!role.access_ordens_producao || !!role.access_pcp
      case 'Suprimentos':
        return !!role.access_suprimentos || !!role.access_pcp || !!role.access_produto_processos
      case 'Portal do Operador':
        return !!role.access_operator || !!role.access_pcp
      case 'Visão Comercial':
        return !!role.access_visao_comercial || !!role.access_commercial || !!role.access_pcp
      default:
        return true
    }
  }

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
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
      <SidebarHeader className="flex flex-row items-center gap-2 p-4 h-16 border-b border-slate-800/50 overflow-hidden">
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shrink-0">
          <Factory className="size-5" />
        </div>
        <span className="font-bold text-lg truncate group-data-[collapsible=icon]:hidden">
          <span className="text-green-700">Fábrica</span>{' '}
          <span className="text-orange-600">Inteligente</span>
        </span>
      </SidebarHeader>
      <SidebarContent>
        <Accordion
          type="single"
          value={activeGroup}
          onValueChange={setActiveGroup}
          collapsible
          className="w-full space-y-2 p-2"
        >
          {['Produto/Processos', 'PCP', 'Administração'].map((group) => {
            const groupItems = navItems.filter((i) => i.group === group && hasAccess(i.title))
            if (groupItems.length === 0) return null

            return (
              <AccordionItem value={group} key={group} className="border-none">
                <SidebarGroup className="p-0">
                  <AccordionTrigger className="px-3 hover:no-underline flex h-8 shrink-0 items-center rounded-md text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider transition-[margin,opacity,colors] ease-linear group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 data-[state=open]:text-sidebar-foreground">
                    {group}
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <SidebarGroupContent className="pt-1">
                      <SidebarMenu>
                        {groupItems.map((item) => {
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
                  </AccordionContent>
                </SidebarGroup>
              </AccordionItem>
            )
          })}
        </Accordion>
      </SidebarContent>
      <SidebarFooter className="border-t border-slate-800/50">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip={state === 'expanded' ? 'Recolher menu' : 'Expandir menu'}
            >
              {state === 'expanded' ? <PanelLeftClose /> : <PanelLeft />}
              <span>{state === 'expanded' ? 'Recolher menu' : 'Expandir menu'}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              tooltip="Sair"
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
