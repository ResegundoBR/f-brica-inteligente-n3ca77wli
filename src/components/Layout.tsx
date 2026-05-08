import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { Header } from './header'
import { useAuth } from '@/hooks/use-auth'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'

export default function Layout() {
  const { user } = useAuth()
  const { toast } = useToast()

  useRealtime('notifications', (e) => {
    if (e.action === 'create' && e.record.user_id === user?.id && !e.record.read) {
      toast({
        title: 'Nova Notificação',
        description: e.record.message,
      })
    }
  })

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen w-full overflow-hidden bg-background">
        <Header />
        <main className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50/50 dark:bg-transparent">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
